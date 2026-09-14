import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { EventsService, MAX_PROP_LENGTH } from './events.service';

let db: TestDatabase;
let events: EventsService;
let alice: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  events = new EventsService(db.pool);
  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz') RETURNING id`,
  );
  alice = made.rows[0]?.id ?? '';
});

async function stored() {
  const { rows } = await db.pool.query<{ name: string; user_id: string | null; props: Record<string, unknown> }>(
    `SELECT name, user_id, props FROM events ORDER BY created_at`,
  );
  return rows;
}

it('records an event with its user and props', async () => {
  await events.record('generation_settled', alice, { status: 'ready', formatId: 'high-energy' });

  expect(await stored()).toEqual([
    { name: 'generation_settled', user_id: alice, props: { status: 'ready', formatId: 'high-energy' } },
  ]);
});

it('cuts every string prop short, so a prompt or brief can never be stored whole (source 01 §37)', async () => {
  await events.record('project_created', alice, { formatId: 'x'.repeat(5000) });

  const [row] = await stored();
  expect(String(row?.props.formatId)).toHaveLength(MAX_PROP_LENGTH);
});

it('never throws: a failed write is swallowed, so a seller action cannot fail because of analytics', async () => {
  await expect(events.record('sign_in', 'not-a-uuid')).resolves.toBeUndefined();
  expect(await stored()).toEqual([]);
});

it('keeps the event when its user is deleted, dropping only the link', async () => {
  await events.record('sign_in', alice);
  await db.pool.query(`DELETE FROM users WHERE id = $1`, [alice]);

  expect(await stored()).toEqual([{ name: 'sign_in', user_id: null, props: {} }]);
});

it('records an anonymous event with no user', async () => {
  await events.record('generation_settled', '', { status: 'failed' });

  expect((await stored())[0]?.user_id).toBeNull();
});
