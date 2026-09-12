import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../common/testing/database';

let db: TestDatabase;
let alice: string;
let bob: string;
let project: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();

  const users = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz'),('b','b@x.uz') RETURNING id`,
  );
  alice = users.rows[0]?.id ?? '';
  bob = users.rows[1]?.id ?? '';

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO projects (user_id, name, description, goal, format_id, platform, aspect_ratio)
     VALUES ($1,'Krossovka','Bej krossovka','sales','product-film','instagram','9:16')
     RETURNING id`,
    [alice],
  );
  project = made.rows[0]?.id ?? '';
});

/** Asserts the DATABASE refuses the write, and names which rule did it. */
async function refusedBy(constraint: string, sqlText: string, params: unknown[] = []) {
  let caught: unknown;
  try {
    await db.pool.query(sqlText, params);
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected ${constraint} to refuse this write`).toBeDefined();
  expect((caught as { constraint?: string }).constraint).toBe(constraint);
}

const TERMINAL = ['ready', 'needs_input', 'refused', 'failed'];

function insertGeneration(
  userId: string,
  key: string,
  status = 'queued',
): { text: string; values: unknown[] } {
  // generations_finished_pairing: a terminal status must carry finished_at, and a live
  // one must not, so the fixture has to agree with the constraint it is not testing.
  const finished = TERMINAL.includes(status) ? 'now()' : 'NULL';
  return {
    text: `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id, finished_at)
           VALUES ($1,$2,$3,$4,'flow-veo-3.1',${finished})`,
    values: [project, userId, key, status],
  };
}

async function add(userId: string, key: string, status = 'queued'): Promise<void> {
  const query = insertGeneration(userId, key, status);
  await db.pool.query(query.text, query.values);
}

it('allows a user only one queued job at a time', async () => {
  await add(alice, 'key-1');
  const second = insertGeneration(alice, 'key-2');

  await refusedBy('generations_one_active_per_user', second.text, second.values);
});

it('counts a running job against the same limit as a queued one', async () => {
  await db.pool.query(
    `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id, lease_token, lease_until)
     VALUES ($1,$2,'key-1','running','flow-veo-3.1', gen_random_uuid(), now() + interval '5 min')`,
    [project, alice],
  );

  // The partial predicate covers both states, or a worker mid-call would not stop a second job.
  const second = insertGeneration(alice, 'key-2');
  await refusedBy('generations_one_active_per_user', second.text, second.values);
});

it('does not let one seller block another', async () => {
  await add(alice, 'key-1');

  const bobsProject = await db.pool.query<{ id: string }>(
    `INSERT INTO projects (user_id, name, description, goal, format_id, platform, aspect_ratio)
     VALUES ($1,'Bob','x','sales','product-film','instagram','9:16') RETURNING id`,
    [bob],
  );
  await db.pool.query(
    `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id)
     VALUES ($1,$2,'key-1','queued','flow-veo-3.1')`,
    [bobsProject.rows[0]?.id, bob],
  );

  const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM generations`);
  expect(Number(rows[0]?.n)).toBe(2);
});

it('reuses one job per idempotency key rather than making a second', async () => {
  await add(alice, 'key-1', 'ready');
  const duplicate = insertGeneration(alice, 'key-1');

  // §32: duplicate clicks and network retries must not create separate successful jobs.
  await refusedBy('generations_user_key', duplicate.text, duplicate.values);
});

it('lets two different sellers use the same idempotency key', async () => {
  await add(alice, 'shared-key', 'ready');

  const bobsProject = await db.pool.query<{ id: string }>(
    `INSERT INTO projects (user_id, name, description, goal, format_id, platform, aspect_ratio)
     VALUES ($1,'Bob','x','sales','product-film','instagram','9:16') RETURNING id`,
    [bob],
  );
  await db.pool.query(
    `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id)
     VALUES ($1,$2,'shared-key','queued','flow-veo-3.1')`,
    [bobsProject.rows[0]?.id, bob],
  );

  const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM generations`);
  expect(Number(rows[0]?.n)).toBe(2);
});

it('lets a seller generate again once the last job finished', async () => {
  await add(alice, 'key-1', 'ready');

  // If the index counted terminal jobs, a seller could never generate twice.
  await add(alice, 'key-2');

  const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM generations`);
  expect(Number(rows[0]?.n)).toBe(2);
});

it('refuses half a lease', async () => {
  await refusedBy(
    'generations_lease_pairing',
    `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id, lease_token)
     VALUES ($1,$2,'key-1','running','flow-veo-3.1', gen_random_uuid())`,
    [project, alice],
  );
});

it('refuses a finished job that does not say when it finished', async () => {
  await refusedBy(
    'generations_finished_pairing',
    `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id)
     VALUES ($1,$2,'key-1','ready','flow-veo-3.1')`,
    [project, alice],
  );
});

it('refuses a queued job that claims to have finished', async () => {
  await refusedBy(
    'generations_finished_pairing',
    `INSERT INTO generations (project_id, user_id, idempotency_key, status, target_id, finished_at)
     VALUES ($1,$2,'key-1','queued','flow-veo-3.1', now())`,
    [project, alice],
  );
});

it('allows only one package per generation', async () => {
  await add(alice, 'key-1', 'ready');
  const { rows } = await db.pool.query<{ id: string }>(`SELECT id FROM generations`);
  const generationId = rows[0]?.id;

  await db.pool.query(
    `INSERT INTO packages (generation_id, result, prompt_en) VALUES ($1,'{}'::jsonb,'a prompt')`,
    [generationId],
  );

  // A second package for one generation would be a second thing sold for one credit.
  await refusedBy(
    'packages_pkey',
    `INSERT INTO packages (generation_id, result, prompt_en) VALUES ($1,'{}'::jsonb,'another')`,
    [generationId],
  );
});

it('refuses a ledger row pointing at a generation that never existed', async () => {
  let caught: unknown;
  try {
    await db.pool.query(
      `INSERT INTO credit_ledger (user_id, type, amount, generation_id)
       VALUES ($1,'reserve',1,'00000000-0000-0000-0000-000000000000')`,
      [alice],
    );
  } catch (error) {
    caught = error;
  }
  // The foreign key P3 owed and P4 paid.
  expect((caught as { code?: string }).code).toBe('23503');
});

it('keeps the ledger row when its generation is deleted, blanking the link', async () => {
  await add(alice, 'key-1', 'ready');
  const { rows } = await db.pool.query<{ id: string }>(`SELECT id FROM generations`);
  const generationId = rows[0]?.id;

  await db.pool.query(
    `INSERT INTO credit_ledger (user_id, type, amount, generation_id) VALUES ($1,'debit',1,$2)`,
    [alice, generationId],
  );
  await db.pool.query(`DELETE FROM generations WHERE id = $1`, [generationId]);

  // A money record must outlive the job it describes: set null, not cascade.
  const ledger = await db.pool.query<{ type: string; generation_id: string | null }>(
    `SELECT type, generation_id FROM credit_ledger WHERE user_id = $1`,
    [alice],
  );
  expect(ledger.rows).toEqual([{ type: 'debit', generation_id: null }]);
});
