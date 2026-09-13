import { mkdtempSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { AI_PROVIDER } from './ai/public/provider.port';
import { UZBEK_APOSTROPHE } from './ai/validation/uzbek-text';
import { FileStorage } from './assets/storage';
import { SESSION_COOKIE } from './auth/public/auth.port';
import { SessionService } from './auth/session.service';
import { applyGlobalSetup } from './bootstrap';
import { PG_POOL } from './common/db/tokens';
import { createTestDatabase, type TestDatabase } from './common/testing/database';
import {
  assertLedgerMatchesAccounts,
  assertNoNegativeBalances,
} from './common/testing/ledger';
import { AccountsService } from './credits/accounts.service';
import { GenerationWorker } from './generation/generation.worker';
import { createFakeProvider, type FakeProvider } from './generation/testing/fake-provider';

/**
 * THE P4 EXIT GATE.
 *
 * docs/PLAN.md names three checks — one credit with two concurrent jobs gives one
 * success, a success survives a disconnect, a late success cannot race a refund — and
 * source 01 §32 adds a fourth: duplicate retries reuse the same job and result.
 *
 * The real worker runs in-process against the real dev Redis, with a scripted fake
 * provider. Spec §11 forbids live AI calls in CI, and a recorded response could not be
 * made to arrive after its own lease expired, which is exactly what the late-success race
 * needs.
 */

let db: TestDatabase;
let app: INestApplication;
let origin: string;
let provider: FakeProvider;
let worker: GenerationWorker;
let accounts: AccountsService;

let aliceCookie: string;
let bobCookie: string;
let aliceId: string;
let aliceProject: string;

/**
 * The origin the CSRF guard accepts, read from the same env the app reads.
 *
 * This was hard-coded to localhost:3040 and broke all three e2e suites the moment
 * WEB_ORIGIN was legitimately pointed at the web dev server on 3042. A test that asserts
 * a guard's behaviour must take the guard's own configuration from the same place the
 * guard does, or it is testing the developer's .env.
 */
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3040';

const brief = {
  productName: 'Krossovka',
  description: 'Bej rangli trikotaj krossovka',
  goal: 'sales',
  formatId: 'product-film',
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 10,
  audience: null,
  offer: null,
  confirmedClaims: [],
  galleryInspirationId: null,
};

function send(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown; key?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: WEB_ORIGIN,
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.key) headers['Idempotency-Key'] = options.key;

  const method = options.method ?? 'GET';
  return fetch(`${origin}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  }).then((response) => {
    // Only a success counts: a 404 probe proves a door is shut, not that the room behind
    // it works.
    if (response.ok) exercised.add(`${method} ${templatePath(path)}`);
    return response;
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** D-077: every route this suite drove to a 2xx, as `METHOD /templated/path`. */
const exercised = new Set<string>();

function templatePath(path: string): string {
  const [withoutQuery = ''] = path.split('?');
  return withoutQuery.replace(
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    '/{id}',
  );
}

async function grant(userId: string, credits: number): Promise<void> {
  await accounts.credit(userId, credits, 'owner_grant', { note: 'e2e seed' });
}

async function balance(userId: string): Promise<{ available: number; reserved: number }> {
  return accounts.getBalance(userId);
}

async function request(cookie: string, project: string, key = randomUUID()) {
  const response = await send(`/api/projects/${project}/generations`, {
    cookie,
    method: 'POST',
    key,
  });
  return { response, key };
}

async function statusOf(id: string): Promise<string> {
  const { rows } = await db.pool.query<{ status: string }>(
    `SELECT status FROM generations WHERE id = $1`,
    [id],
  );
  return rows[0]?.status ?? 'missing';
}

async function packageCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM packages`);
  return Number(rows[0]?.n);
}

async function ledgerTypes(userId: string): Promise<string[]> {
  const { rows } = await db.pool.query<{ type: string }>(
    `SELECT type FROM credit_ledger WHERE user_id = $1 ORDER BY created_at`,
    [userId],
  );
  return rows.map((row) => row.type);
}

beforeAll(async () => {
  db = await createTestDatabase();
  provider = createFakeProvider();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue(db.pool)
    .overrideProvider(FileStorage)
    .useValue(new FileStorage(mkdtempSync(join(tmpdir(), 'jas-p4-'))))
    .overrideProvider(AI_PROVIDER)
    .useValue(provider)
    .compile();

  app = moduleRef.createNestApplication();
  applyGlobalSetup(app);
  await app.listen(0);

  const address = (app.getHttpServer() as Server).address() as AddressInfo;
  origin = `http://127.0.0.1:${String(address.port)}`;

  accounts = moduleRef.get(AccountsService);
  worker = moduleRef.get(GenerationWorker);

  const made = await db.pool.query<{ id: string; email: string }>(
    `INSERT INTO users (google_sub, email, role) VALUES
       ('alice','alice@x.uz','seller'), ('bob','bob@x.uz','seller')
     RETURNING id, email`,
  );
  const idOf = (email: string) => made.rows.find((row) => row.email === email)?.id ?? '';
  aliceId = idOf('alice@x.uz');

  const sessions = moduleRef.get(SessionService);
  aliceCookie = `${SESSION_COOKIE}=${(await sessions.issue(aliceId)).token}`;
  bobCookie = `${SESSION_COOKIE}=${(await sessions.issue(idOf('bob@x.uz'))).token}`;

  // One project with one photo: a generation needs something to look at.
  const project = await send('/api/projects', {
    cookie: aliceCookie,
    method: 'POST',
    body: brief,
  });
  aliceProject = (await json<{ id: string }>(project)).id;

  const jpeg = await sharp({
    create: { width: 800, height: 600, channels: 3, background: '#c0ffee' },
  })
    .jpeg()
    .toBuffer();
  const form = new FormData();
  form.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'shoe.jpg');
  await fetch(`${origin}/api/projects/${aliceProject}/assets`, {
    method: 'POST',
    headers: { Origin: WEB_ORIGIN, 'X-Requested-With': 'XMLHttpRequest', Cookie: aliceCookie },
    body: form,
  });
}, 90_000);

afterAll(async () => {
  // The books must balance after everything every test did.
  await assertLedgerMatchesAccounts(db.pool);
  await assertNoNegativeBalances(db.pool);
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query(`DELETE FROM packages`);
  await db.pool.query(`DELETE FROM needs_input_cache`);
  await db.pool.query(`DELETE FROM credit_ledger`);
  await db.pool.query(`DELETE FROM generations`);
  await db.pool.query(`DELETE FROM credit_accounts`);
  provider.behave({ kind: 'ready' });
  provider.calls.length = 0;
});

describe("PLAN.md's P4 exit check", () => {
  it('gives one success when two concurrent jobs chase one credit', async () => {
    await grant(aliceId, 1);

    const [first, second] = await Promise.all([
      request(aliceCookie, aliceProject),
      request(aliceCookie, aliceProject),
    ]);

    const codes = [first.response.status, second.response.status].sort((a, b) => a - b);
    // One accepted; the other refused either for want of a credit or because the
    // one-active-job index caught it. Both refusals are correct.
    expect(codes[0]).toBe(202);
    expect([402, 409]).toContain(codes[1]);

    const accepted = first.response.status === 202 ? first : second;
    const { generationId } = await json<{ generationId: string }>(accepted.response);
    await worker.runOne(generationId);

    expect(await statusOf(generationId)).toBe('ready');
    expect(await packageCount()).toBe(1);
    expect(await balance(aliceId)).toEqual({ available: 0, reserved: 0 });
    await assertLedgerMatchesAccounts(db.pool);
  });

  it('keeps a success that the client never saw', async () => {
    await grant(aliceId, 1);
    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);

    // The client "disconnects" here: nothing below reads the original response again.
    await worker.runOne(generationId);

    const reread = await send(`/api/generations/${generationId}`, { cookie: aliceCookie });
    const detail = await json<{ status: string; package: { promptEn: string } | null }>(reread);

    expect(detail.status).toBe('ready');
    expect(detail.package?.promptEn).toContain('product reference');
    // §32: do not refund a stored package merely because the client missed the response.
    expect(await balance(aliceId)).toEqual({ available: 0, reserved: 0 });
  });

  it('drops a late success rather than paying it out next to the refund', async () => {
    await grant(aliceId, 1);
    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);

    // Claim the job, then expire its lease behind the worker's back and sweep it to
    // failure. The original call is still notionally in flight.
    const claimed = await db.pool.query<{ lease_token: string }>(
      `UPDATE generations
          SET status='running', lease_token=gen_random_uuid(), lease_until=now() - interval '1 min',
              attempts=3
        WHERE id=$1 RETURNING lease_token`,
      [generationId],
    );
    const staleToken = claimed.rows[0]?.lease_token ?? '';

    expect(await worker.sweepExpired()).toBe(1);
    expect(await statusOf(generationId)).toBe('failed');
    expect(await balance(aliceId)).toEqual({ available: 1, reserved: 0 });

    // Now the stale worker comes back with a perfectly good result.
    const settle = app.get((await import('./generation/settle.service')).SettleService);
    const dropped = await settle.settle({
      generationId,
      leaseToken: staleToken,
      userId: aliceId,
      projectId: aliceProject,
      images: [],
      outcome: {
        status: 'ok',
        result: (await import('./generation/testing/fake-provider')).readyResult(),
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          estimatedCostUsd: 0.01,
          provider: 'fake',
          model: 'fake',
          promptVersion: 'v2',
        },
        warnings: [],
        repairedFrom: [],
      },
    });

    expect(dropped.applied).toBe(false);
    // The seller must not end up with both the package and the credit.
    expect(await packageCount()).toBe(0);
    expect(await statusOf(generationId)).toBe('failed');
    expect(await balance(aliceId)).toEqual({ available: 1, reserved: 0 });
    expect(await ledgerTypes(aliceId)).toEqual(['owner_grant', 'reserve', 'release']);
    await assertLedgerMatchesAccounts(db.pool);
  });

  it('reuses one job and one charge for five duplicate clicks', async () => {
    await grant(aliceId, 2);
    const key = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        send(`/api/projects/${aliceProject}/generations`, {
          cookie: aliceCookie,
          method: 'POST',
          key,
        }),
      ),
    );

    const ids = new Set<string>();
    for (const response of responses) {
      expect(response.status).toBe(202);
      ids.add((await json<{ generationId: string }>(response)).generationId);
    }

    // §32: duplicate clicks create neither duplicate charges nor separate jobs.
    expect(ids.size).toBe(1);
    expect(await balance(aliceId)).toEqual({ available: 1, reserved: 1 });
    expect(await ledgerTypes(aliceId)).toEqual(['owner_grant', 'reserve']);
    await assertLedgerMatchesAccounts(db.pool);
  });
});

describe('the four outcomes', () => {
  it('debits on ready and writes exactly one package', async () => {
    await grant(aliceId, 1);
    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);

    await worker.runOne(generationId);

    expect(await ledgerTypes(aliceId)).toEqual(['owner_grant', 'reserve', 'debit']);
    expect(await packageCount()).toBe(1);
  });

  it('releases the credit and caches the questions on needs_input', async () => {
    await grant(aliceId, 1);
    // U+2018 in, U+02BB out: the ai module normalises Uzbek apostrophes to the standard
    // MODIFIER LETTER TURNED COMMA (uzbek-text.ts), so the expectation uses the
    // normalised form rather than what the fake was handed.
    provider.behave({ kind: 'needs_input', questions: ['Rangi qanday?', 'O‘lchami bormi?'] });

    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);
    await worker.runOne(generationId);

    expect(await statusOf(generationId)).toBe('needs_input');
    // D-020 / §A5: questions do not consume a credit.
    expect(await balance(aliceId)).toEqual({ available: 1, reserved: 0 });
    expect(await ledgerTypes(aliceId)).toEqual(['owner_grant', 'reserve', 'release']);
    expect(await packageCount()).toBe(0);

    const detail = await json<{ questionsUz: string[] }>(
      await send(`/api/generations/${generationId}`, { cookie: aliceCookie }),
    );
    expect(detail.questionsUz).toEqual(['Rangi qanday?', `O${UZBEK_APOSTROPHE}lchami bormi?`]);
  });

  it('answers a repeated identical request from the cache, with no second call', async () => {
    await grant(aliceId, 2);
    provider.behave({ kind: 'needs_input', questions: ['Rangi qanday?'] });

    const first = await request(aliceCookie, aliceProject);
    await worker.runOne((await json<{ generationId: string }>(first.response)).generationId);
    const callsAfterFirst = provider.calls.length;

    const second = await request(aliceCookie, aliceProject);
    const body = await json<{ fromCache: boolean; questionsUz: string[] }>(second.response);

    // §29: identical inputs return the same questions without a new paid call.
    expect(body.fromCache).toBe(true);
    expect(body.questionsUz).toEqual(['Rangi qanday?']);
    expect(provider.calls.length).toBe(callsAfterFirst);
    // And it cost nothing: still one grant, one reserve, one release.
    expect(await ledgerTypes(aliceId)).toEqual(['owner_grant', 'reserve', 'release']);
  });

  it('releases the credit on a refusal, with an Uzbek message and no provider text', async () => {
    await grant(aliceId, 1);
    provider.behave({ kind: 'refused', messageUz: 'Rasmda mahsulot ko‘rinmaydi' });

    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);
    await worker.runOne(generationId);

    const detail = await json<{ status: string; messageUz: string; errorCode: string | null }>(
      await send(`/api/generations/${generationId}`, { cookie: aliceCookie }),
    );
    expect(detail.status).toBe('refused');
    expect(detail.messageUz).toBe(`Rasmda mahsulot ko${UZBEK_APOSTROPHE}rinmaydi`);
    expect(detail.errorCode).toBeNull();
    expect(await balance(aliceId)).toEqual({ available: 1, reserved: 0 });
  });

  it('releases the credit on a provider failure and reports a §9 code, not the message', async () => {
    await grant(aliceId, 1);
    provider.behave({ kind: 'error', code: 'AI_TIMEOUT' });

    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);
    await worker.runOne(generationId);

    const detail = await json<{ status: string; errorCode: string; messageUz: string | null }>(
      await send(`/api/generations/${generationId}`, { cookie: aliceCookie }),
    );
    expect(detail.status).toBe('failed');
    expect(detail.errorCode).toBe('AI_TIMEOUT');
    // Spec §9: a raw provider message never reaches a seller.
    expect(detail.messageUz).toBeNull();
    expect(await balance(aliceId)).toEqual({ available: 1, reserved: 0 });
  });

  it('repairs once and still debits exactly one credit', async () => {
    await grant(aliceId, 1);
    provider.behave({ kind: 'repair-then-ready' });

    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);
    await worker.runOne(generationId);

    expect(await statusOf(generationId)).toBe('ready');
    expect(provider.calls.length).toBe(2);
    expect(provider.calls[1]?.repairErrors).toBeDefined();
    expect(await ledgerTypes(aliceId)).toEqual(['owner_grant', 'reserve', 'debit']);
  });
});

describe('the gates before any money moves', () => {
  it('refuses a generation with no credits, and makes no call', async () => {
    const { response } = await request(aliceCookie, aliceProject);

    expect(response.status).toBe(402);
    await expect(json(response)).resolves.toMatchObject({ code: 'NO_CREDITS' });
    // Addendum A §A5: no paid model call for a seller with nothing to spend.
    expect(provider.calls).toHaveLength(0);
    expect(await ledgerTypes(aliceId)).toEqual([]);
  });

  it('requires an Idempotency-Key', async () => {
    await grant(aliceId, 1);

    const response = await send(`/api/projects/${aliceProject}/generations`, {
      cookie: aliceCookie,
      method: 'POST',
    });

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    expect(await ledgerTypes(aliceId)).toEqual(['owner_grant']);
  });

  it("refuses another seller's project without reserving anything", async () => {
    await grant(aliceId, 1);

    const response = await send(`/api/projects/${aliceProject}/generations`, {
      cookie: bobCookie,
      method: 'POST',
      key: randomUUID(),
    });

    expect(response.status).toBe(404);
    expect(await balance(aliceId)).toEqual({ available: 1, reserved: 0 });
  });

  it("will not show one seller another's generation", async () => {
    await grant(aliceId, 1);
    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);

    const peek = await send(`/api/generations/${generationId}`, { cookie: bobCookie });

    expect(peek.status).toBe(404);
    await expect(json(peek)).resolves.toMatchObject({ code: 'GENERATION_NOT_FOUND' });
  });
});

/**
 * R-002. A seller who reopens a project must be able to get back every prompt they paid
 * for — they are all in Postgres, but until this route nothing could find them without an
 * id the client had already lost.
 */
describe("a project's generations", () => {
  async function readyGeneration(): Promise<string> {
    const { response } = await request(aliceCookie, aliceProject);
    const { generationId } = await json<{ generationId: string }>(response);
    await worker.runOne(generationId);
    return generationId;
  }

  it('lists every package made for the project, newest first', async () => {
    await grant(aliceId, 2);
    const first = await readyGeneration();
    const second = await readyGeneration();

    const response = await send(`/api/projects/${aliceProject}/generations`, {
      cookie: aliceCookie,
    });

    expect(response.status).toBe(200);
    const list = await json<{ id: string; status: string; package: { promptEn: string } | null }[]>(
      response,
    );
    expect(list.map((generation) => generation.id)).toEqual([second, first]);
    expect(list.every((generation) => generation.status === 'ready')).toBe(true);
    expect(list.every((generation) => Boolean(generation.package?.promptEn))).toBe(true);
  });

  it("is a 404, never a 403, for another seller's project", async () => {
    const peek = await send(`/api/projects/${aliceProject}/generations`, { cookie: bobCookie });

    // A 403 would confirm the project exists, which is the leak P2's isolation test refuses.
    expect(peek.status).toBe(404);
    await expect(json(peek)).resolves.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });
});

/**
 * D-077, extended to P4. The route list comes from the generated contract, so a
 * generation route added without a test that drives it to a 2xx fails the build.
 */
describe('endpoint coverage', () => {
  it('drives every P4 route in the contract to a success at least once', () => {
    const contract = JSON.parse(readFileSync('openapi.json', 'utf8')) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const routes: string[] = [];
    for (const [path, methods] of Object.entries(contract.paths)) {
      // The owner tree is D-037's, not P4's, and money.e2e.spec.ts drives it. Without
      // this, /api/owner/generations would be demanded here purely because its path
      // contains the same word.
      if (path.startsWith('/api/owner/')) continue;
      if (!path.includes('generations')) continue;
      for (const method of Object.keys(methods)) {
        routes.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(routes.length).toBeGreaterThan(0);
    const untested = routes.filter((route) => !exercised.has(route));
    expect(untested, `never driven to a 2xx: ${untested.join(', ')}`).toEqual([]);
  });
});
