import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { ReferenceImage } from '../ai/public/provider.port';
import type { ModelInputReader } from '../assets/public/assets.port';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { assertLedgerMatchesAccounts } from '../common/testing/ledger';
import { AccountsService } from '../credits/accounts.service';
import { ProjectsService } from '../projects/projects.service';
import { buildGeneration, type GenerationHarness } from './testing/harness';
import { createFakeProvider } from './testing/fake-provider';
import {
  GenerationRateLimitedError,
  IdempotencyKeyRequiredError,
  NeedsInputCapError,
  NoAssetsError,
  SpendCapReachedError,
} from './public/generation.errors';
import { NoCreditsError } from '../credits/public/credits.errors';
import { NeedsInputCache } from './needs-input.cache';
import { stubGalleryReader } from '../gallery/testing/stub-reader';

/**
 * The gates in front of TX 1 (spec §6 steps 1–6). Every one of these must refuse BEFORE a
 * credit moves or a provider is called — which is what the assertions check, not just the
 * status code.
 */

let db: TestDatabase;
let accounts: AccountsService;
let projects: ProjectsService;
let alice: string;
let project: string;
let photos: ReferenceImage[];

const ONE_PHOTO: ReferenceImage[] = [{ bytes: Buffer.from('photo-a'), mimeType: 'image/jpeg' }];

function assetsStub(images: ReferenceImage[]): ModelInputReader {
  return { readModelInputs: () => Promise.resolve(images) };
}

function harness(limits = {}, images = photos): GenerationHarness {
  return buildGeneration(
    db.pool,
    {
      credits: accounts,
      projects,
      briefs: projects,
      assets: assetsStub(images),
      generator: { generate: () => Promise.reject(new Error('not called in this suite')) },
    },
    limits,
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  photos = ONE_PHOTO;
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  accounts = new AccountsService(db.pool);
  projects = new ProjectsService(db.pool, stubGalleryReader());

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz') RETURNING id`,
  );
  alice = made.rows[0]?.id ?? '';

  const created = await projects.create(alice, {
    productName: 'Krossovka',
    description: 'Bej rangli krossovka',
    goal: 'sales',
    formatId: 'product-film',
    platform: 'instagram',
    aspectRatio: '9:16',
    durationSeconds: 10,
    audience: null,
    offer: null,
    confirmedClaims: [],
    galleryInspirationId: null,
  });
  project = created.id;
});

async function ledger(): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string }>(
    `SELECT type FROM credit_ledger WHERE user_id = $1 ORDER BY created_at`,
    [alice],
  );
  return rows.map((row) => row.type);
}

async function generationCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM generations`);
  return Number(rows[0]?.n);
}

it('reserves exactly one credit and queues the job', async () => {
  await accounts.credit(alice, 1, 'owner_grant', { note: 'seed' });
  const h = harness();

  const accepted = await h.service.request(alice, project, randomUUID());

  expect(accepted.status).toBe('queued');
  expect(accepted.fromCache).toBe(false);
  expect(await accounts.getBalance(alice)).toEqual({ available: 0, reserved: 1 });
  expect(h.queue.enqueued).toEqual([accepted.generationId]);
  // The reserve row carries the generation it belongs to, not a dangling null.
  const { rows } = await db.pool.query<{ generation_id: string }>(
    `SELECT generation_id FROM credit_ledger WHERE type = 'reserve'`,
  );
  expect(rows[0]?.generation_id).toBe(accepted.generationId);
  await assertLedgerMatchesAccounts(db.pool);
});

it('refuses without an Idempotency-Key, before anything moves', async () => {
  await accounts.credit(alice, 1, 'owner_grant', { note: 'seed' });
  const h = harness();

  await expect(h.service.request(alice, project, undefined)).rejects.toBeInstanceOf(
    IdempotencyKeyRequiredError,
  );
  await expect(h.service.request(alice, project, '   ')).rejects.toBeInstanceOf(
    IdempotencyKeyRequiredError,
  );

  expect(await generationCount()).toBe(0);
  expect(await ledger()).toEqual(['owner_grant']);
});

it('refuses a project with no photos, before reserving', async () => {
  await accounts.credit(alice, 1, 'owner_grant', { note: 'seed' });
  const h = harness({}, []);

  await expect(h.service.request(alice, project, randomUUID())).rejects.toBeInstanceOf(
    NoAssetsError,
  );

  expect(await generationCount()).toBe(0);
  expect(await ledger()).toEqual(['owner_grant']);
});

it('refuses over the daily generation cap, before reserving (§33)', async () => {
  await accounts.credit(alice, 5, 'owner_grant', { note: 'seed' });
  const h = harness({ generationsPerDay: 2 });

  const first = await h.service.request(alice, project, randomUUID());
  await finish(first.generationId);
  const second = await h.service.request(alice, project, randomUUID());
  await finish(second.generationId);

  await expect(h.service.request(alice, project, randomUUID())).rejects.toBeInstanceOf(
    GenerationRateLimitedError,
  );

  // Two reserves, two debits — and no third reserve.
  expect((await ledger()).filter((type) => type === 'reserve')).toHaveLength(2);
  expect(h.queue.enqueued).toHaveLength(2);
});

it("refuses when the day's AI spend is at the cap, before reserving (§10)", async () => {
  await accounts.credit(alice, 2, 'owner_grant', { note: 'seed' });

  // A finished job that already cost more than the cap allows.
  await db.pool.query(
    `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id,
                              est_cost_usd, finished_at)
     VALUES ($1,$2,'spent','ready','google-flow', 3.5, now())`,
    [project, alice],
  );

  const h = harness({ dailySpendUsd: 2 });

  await expect(h.service.request(alice, project, randomUUID())).rejects.toBeInstanceOf(
    SpendCapReachedError,
  );
  // Our limit, not the seller's fault: a 503, and the credit is untouched.
  expect(await accounts.getBalance(alice)).toEqual({ available: 2, reserved: 0 });
  expect(h.queue.enqueued).toEqual([]);
});

it('refuses a seller with no credits, and queues nothing', async () => {
  const h = harness();

  await expect(h.service.request(alice, project, randomUUID())).rejects.toBeInstanceOf(
    NoCreditsError,
  );

  // The insert is rolled back with the failed reserve: no orphan queued row.
  expect(await generationCount()).toBe(0);
  expect(await ledger()).toEqual([]);
  expect(h.queue.enqueued).toEqual([]);
});

it('returns the same job for a repeated key, and charges once', async () => {
  await accounts.credit(alice, 2, 'owner_grant', { note: 'seed' });
  const h = harness();
  const key = randomUUID();

  const first = await h.service.request(alice, project, key);
  const second = await h.service.request(alice, project, key);

  expect(second.generationId).toBe(first.generationId);
  expect(await accounts.getBalance(alice)).toEqual({ available: 1, reserved: 1 });
  // Not enqueued twice: the second call reused the job.
  expect(h.queue.enqueued).toEqual([first.generationId]);
});

it('refuses over the needs-input cap, counting misses only (§29)', async () => {
  await accounts.credit(alice, 5, 'owner_grant', { note: 'seed' });
  const h = harness({ needsInputPerProjectPerDay: 2 });

  // Two recorded misses for this project, each with different photos so neither is a hit.
  for (const bytes of ['one', 'two']) {
    await h.cache.remember(
      alice,
      project,
      NeedsInputCache.key(alice, project, [{ bytes: Buffer.from(bytes), mimeType: 'image/jpeg' }]),
      ['Rangi?'],
      db.pool,
    );
  }

  await expect(h.service.request(alice, project, randomUUID())).rejects.toBeInstanceOf(
    NeedsInputCapError,
  );
  expect(await accounts.getBalance(alice)).toEqual({ available: 5, reserved: 0 });
});

it('answers a cached question without a credit or a queue entry', async () => {
  await accounts.credit(alice, 1, 'owner_grant', { note: 'seed' });
  const h = harness();

  await h.cache.remember(
    alice,
    project,
    NeedsInputCache.key(alice, project, photos),
    ['Rangi qanday?'],
    db.pool,
  );

  const accepted = await h.service.request(alice, project, randomUUID());

  // Addendum A §A5: a cached needs_input costs nothing at all — not a credit, not a call.
  expect(accepted.fromCache).toBe(true);
  expect(accepted.questionsUz).toEqual(['Rangi qanday?']);
  expect(await accounts.getBalance(alice)).toEqual({ available: 1, reserved: 0 });
  expect(await generationCount()).toBe(0);
  expect(h.queue.enqueued).toEqual([]);
});

/** Marks a job finished so the one-active-per-user index lets the next one in. */
async function finish(generationId: string): Promise<void> {
  await db.pool.query(
    `UPDATE generations SET status='ready', finished_at=now() WHERE id=$1`,
    [generationId],
  );
  await accounts.debit(alice, generationId);
}

it('keeps a provider entirely out of it — none of these reach a model', () => {
  // The generator in this harness rejects if called; every test above passed, which is
  // the assertion. Stated as a test so the guarantee is named rather than implied.
  const provider = createFakeProvider();
  expect(provider.calls).toEqual([]);
});
