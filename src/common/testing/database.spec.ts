import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './database';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

it('gives each run its own database', async () => {
  const { rows } = await db.pool.query<{ current_database: string }>('SELECT current_database()');
  expect(rows[0]?.current_database).toMatch(/^jas_test_/);
});

it('truncateAll empties tables without dropping them', async () => {
  await db.pool.query('CREATE TABLE IF NOT EXISTS probe (id int)');
  await db.pool.query('INSERT INTO probe VALUES (1)');
  await db.truncateAll();
  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM probe');
  expect(rows[0]?.count).toBe('0');
});
