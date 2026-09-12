import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { assertLedgerMatchesAccounts, assertNoNegativeBalances } from '../common/testing/ledger';
import { AccountsService } from './accounts.service';
import { NoCreditsError } from './public/credits.errors';

/**
 * R-4 exists for this file. None of these tests can be written with a mock: the thing
 * under test is what Postgres does when two transactions touch one row at once.
 */

let db: TestDatabase;
let service: AccountsService;
let alice: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  service = new AccountsService(db.pool);

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz') RETURNING id`,
  );
  alice = made.rows[0]?.id ?? '';
});

async function countLedger(type: string, userId = alice): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM credit_ledger WHERE user_id = $1 AND type = $2`,
    [userId, type],
  );
  return Number(rows[0]?.n);
}

it('one credit, two concurrent reserves: exactly one wins', async () => {
  await service.credit(alice, 1, 'owner_grant', { note: 'seed' });

  const results = await Promise.allSettled([
    service.reserveOne(alice, randomUUID()),
    service.reserveOne(alice, randomUUID()),
  ]);

  const won = results.filter((result) => result.status === 'fulfilled');
  const lost = results.filter((result) => result.status === 'rejected');

  expect(won).toHaveLength(1);
  expect(lost).toHaveLength(1);
  expect((lost[0] as PromiseRejectedResult).reason).toBeInstanceOf(NoCreditsError);

  // Addendum A §A8, at the level where it is actually decided.
  expect(await service.getBalance(alice)).toEqual({ available: 0, reserved: 1 });
  expect(await countLedger('reserve')).toBe(1);
  await assertLedgerMatchesAccounts(db.pool);
});

it('three credits, ten concurrent reserves: exactly three win', async () => {
  await service.credit(alice, 3, 'owner_grant', { note: 'seed' });

  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => service.reserveOne(alice, randomUUID())),
  );

  // The two-way case can pass by luck of scheduling. Ten cannot.
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
  expect(results.filter((result) => result.status === 'rejected')).toHaveLength(7);
  for (const result of results) {
    if (result.status === 'rejected') expect(result.reason).toBeInstanceOf(NoCreditsError);
  }

  expect(await service.getBalance(alice)).toEqual({ available: 0, reserved: 3 });
  expect(await countLedger('reserve')).toBe(3);
  await assertLedgerMatchesAccounts(db.pool);
});

it('a grant racing a reserve: either order is correct, the invariant is not optional', async () => {
  const results = await Promise.allSettled([
    service.credit(alice, 1, 'owner_grant', { note: 'seed' }),
    service.reserveOne(alice, randomUUID()),
  ]);

  // Asserting one ordering here would be testing the scheduler, not the code. Both
  // outcomes are legitimate; what must hold either way is that the books agree.
  const balance = await service.getBalance(alice);
  const reserveWon = results[1].status === 'fulfilled';

  expect(balance).toEqual(reserveWon ? { available: 0, reserved: 1 } : { available: 1, reserved: 0 });
  await assertLedgerMatchesAccounts(db.pool);
  await assertNoNegativeBalances(db.pool);
});

it('fifty interleaved operations across five users leave the books balanced', async () => {
  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email)
     VALUES ('u1','u1@x.uz'),('u2','u2@x.uz'),('u3','u3@x.uz'),('u4','u4@x.uz'),('u5','u5@x.uz')
     RETURNING id`,
  );
  const users = made.rows.map((row) => row.id);

  for (const user of users) {
    await service.credit(user, 3, 'owner_grant', { note: 'seed' });
  }

  // Deterministic pseudo-random, so a failure is reproducible rather than a ghost.
  let seed = 42;
  const pick = <T>(items: T[]): T => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return items[seed % items.length] as T;
  };

  const operations = Array.from({ length: 50 }, () => {
    const user = pick(users);
    const gen = randomUUID();
    switch (pick(['grant', 'reserve', 'debit', 'release'] as const)) {
      case 'grant':
        return service.credit(user, 1, 'owner_grant', { note: 'storm' });
      case 'reserve':
        return service.reserveOne(user, gen);
      case 'debit':
        return service.debit(user, gen);
      case 'release':
        return service.release(user, gen);
    }
  });

  // Every rejection is swallowed on purpose: a NoCredits or a LedgerInvariant is a
  // legitimate outcome of a random storm. What is not legitimate is the books drifting.
  await Promise.allSettled(operations);

  await assertLedgerMatchesAccounts(db.pool);
  await assertNoNegativeBalances(db.pool);
});
