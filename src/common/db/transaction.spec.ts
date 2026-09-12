import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../testing/database';
import { isUniqueViolation, withTransaction } from './transaction';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query(`DROP TABLE IF EXISTS tx_probe`);
  await db.pool.query(`CREATE TABLE tx_probe (id int primary key)`);
});

async function probeCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM tx_probe`);
  return Number(rows[0]?.n ?? -1);
}

it('commits the writes of a function that returns', async () => {
  const returned = await withTransaction(db.pool, async (tx) => {
    await tx.query(`INSERT INTO tx_probe (id) VALUES (1), (2)`);
    return 'done';
  });

  expect(returned).toBe('done');
  expect(await probeCount()).toBe(2);
});

it('rolls back every write when the function throws, and rethrows unchanged', async () => {
  const boom = new Error('deliberate');

  await expect(
    withTransaction(db.pool, async (tx) => {
      await tx.query(`INSERT INTO tx_probe (id) VALUES (1)`);
      throw boom;
    }),
  ).rejects.toBe(boom);

  expect(await probeCount()).toBe(0);
});

it('releases the client on both paths, so the pool does not leak', async () => {
  await withTransaction(db.pool, async (tx) => {
    await tx.query(`SELECT 1`);
  });
  await withTransaction(db.pool, () => Promise.reject(new Error('x'))).catch(() => undefined);

  // A missing release() leaves the client checked out: totalCount stays 1 but idleCount
  // drops to 0, and the next connect() would wait forever.
  expect(db.pool.totalCount).toBe(1);
  expect(db.pool.idleCount).toBe(1);
});

it('recognises a unique violation and nothing else', async () => {
  let duplicate: unknown;
  try {
    await db.pool.query(`INSERT INTO tx_probe (id) VALUES (1), (1)`);
  } catch (error) {
    duplicate = error;
  }

  let syntax: unknown;
  try {
    await db.pool.query(`SELECT FROM WHERE`);
  } catch (error) {
    syntax = error;
  }

  expect(isUniqueViolation(duplicate)).toBe(true);
  expect(isUniqueViolation(syntax)).toBe(false);
  expect(isUniqueViolation(new Error('plain'))).toBe(false);
  expect(isUniqueViolation(null)).toBe(false);
});
