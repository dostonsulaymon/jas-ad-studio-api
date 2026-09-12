import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { assertLedgerMatchesAccounts } from '../common/testing/ledger';
import { AccountsService } from '../credits/accounts.service';
import { GenerationsRepo } from './generations.repo';

/**
 * The lease is what makes recovery safe, and these are the paths the exit gate does not
 * reach: claiming under contention, refusing a live lease, and the sweeper's requeue
 * branch below three attempts.
 */

let db: TestDatabase;
let repo: GenerationsRepo;
let accounts: AccountsService;
let alice: string;
let project: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  repo = new GenerationsRepo(db.pool);
  accounts = new AccountsService(db.pool);

  const users = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz') RETURNING id`,
  );
  alice = users.rows[0]?.id ?? '';

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO projects (user_id, name, description, goal, format_id, platform, aspect_ratio)
     VALUES ($1,'K','d','sales','product-film','instagram','9:16') RETURNING id`,
    [alice],
  );
  project = made.rows[0]?.id ?? '';
});

async function queued(key = 'k1'): Promise<string> {
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO generations (project_id, user_id, idempotency_key, target_id)
     VALUES ($1,$2,$3,'google-flow') RETURNING id`,
    [project, alice, key],
  );
  return rows[0]?.id ?? '';
}

async function row(id: string) {
  const { rows } = await db.pool.query<{
    status: string;
    attempts: number;
    lease_token: string | null;
    error_code: string | null;
  }>(`SELECT status, attempts, lease_token, error_code FROM generations WHERE id = $1`, [id]);
  return rows[0];
}

it('claims a queued job, taking a lease and counting the attempt', async () => {
  const id = await queued();

  const claimed = await repo.claim(id, 5);

  expect(claimed?.attempts).toBe(1);
  expect(claimed?.leaseToken).toBeTruthy();
  expect((await row(id))?.status).toBe('running');
});

it('lets exactly one of two concurrent claims win', async () => {
  const id = await queued();

  const [a, b] = await Promise.all([repo.claim(id, 5), repo.claim(id, 5)]);

  const won = [a, b].filter((claim) => claim !== null);
  expect(won).toHaveLength(1);
  // attempts must be 1, not 2: a lost claim must not count as an attempt, or three
  // racing workers would exhaust the retry budget instantly.
  expect((await row(id))?.attempts).toBe(1);
});

it('refuses to claim a job whose lease is still live', async () => {
  const id = await queued();
  await repo.claim(id, 5);

  expect(await repo.claim(id, 5)).toBeNull();
});

it('claims a job whose lease has lapsed, and counts a second attempt', async () => {
  const id = await queued();
  await repo.claim(id, 5);
  await db.pool.query(`UPDATE generations SET lease_until = now() - interval '1 min' WHERE id=$1`, [id]);

  const reclaimed = await repo.claim(id, 5);

  expect(reclaimed?.attempts).toBe(2);
});

it('refuses to claim a job that already finished', async () => {
  const id = await queued();
  await db.pool.query(
    `UPDATE generations SET status='ready', finished_at=now() WHERE id=$1`,
    [id],
  );

  expect(await repo.claim(id, 5)).toBeNull();
});

it('sweeps an expired job back to queued below three attempts, clearing the lease', async () => {
  const id = await queued();
  await repo.claim(id, 5);
  await db.pool.query(`UPDATE generations SET lease_until = now() - interval '1 min' WHERE id=$1`, [id]);

  const swept = await repo.sweepExpired(db.pool);

  expect(swept).toEqual([{ id, userId: alice, status: 'queued' }]);
  const after = await row(id);
  expect(after?.status).toBe('queued');
  // Clearing the lease is the other half of the race guard: the old worker's
  // `WHERE lease_token = $mine` can never match again.
  expect(after?.lease_token).toBeNull();
  expect(after?.error_code).toBeNull();
});

it('fails an expired job at three attempts, with a §9 code', async () => {
  const id = await queued();
  await db.pool.query(
    `UPDATE generations SET status='running', attempts=3, lease_token=gen_random_uuid(),
            lease_until = now() - interval '1 min' WHERE id=$1`,
    [id],
  );

  const swept = await repo.sweepExpired(db.pool);

  expect(swept[0]?.status).toBe('failed');
  const after = await row(id);
  expect(after?.error_code).toBe('AI_TIMEOUT');
  expect(after?.lease_token).toBeNull();
});

it('leaves a job with a live lease alone', async () => {
  const id = await queued();
  await repo.claim(id, 5);

  expect(await repo.sweepExpired(db.pool)).toEqual([]);
  expect((await row(id))?.status).toBe('running');
});

it('is safe to sweep twice: the second pass finds nothing', async () => {
  const id = await queued();
  await repo.claim(id, 5);
  await db.pool.query(`UPDATE generations SET lease_until = now() - interval '1 min' WHERE id=$1`, [id]);

  const [first, second] = [await repo.sweepExpired(db.pool), await repo.sweepExpired(db.pool)];

  expect(first).toHaveLength(1);
  // The WHERE clause makes the sweep idempotent, so two sweepers cannot double-release.
  expect(second).toEqual([]);
});

it('does not let a settle land once the lease has moved on', async () => {
  await accounts.credit(alice, 1, 'owner_grant', { note: 'seed' });
  const id = await queued();
  const claimed = await repo.claim(id, 5);
  await accounts.reserveOne(alice, id);

  // The sweeper takes it.
  await db.pool.query(`UPDATE generations SET lease_until = now() - interval '1 min' WHERE id=$1`, [id]);
  await repo.sweepExpired(db.pool);

  const applied = await repo.settle(
    id,
    claimed?.leaseToken ?? '',
    {
      status: 'ready',
      provider: 'fake',
      model: 'fake',
      inputTokens: 1,
      outputTokens: 1,
      estCostUsd: 0.01,
      errorCode: null,
      messageUz: null,
      questionsUz: [],
    },
    db.pool,
  );

  // 0 rows updated: the stale worker's result is dropped.
  expect(applied).toBeNull();
  expect((await row(id))?.status).toBe('queued');
  await assertLedgerMatchesAccounts(db.pool);
});
