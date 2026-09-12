import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { assertLedgerMatchesAccounts } from '../common/testing/ledger';
import { AccountsService } from './accounts.service';
import {
  GrantNoteRequiredError,
  LedgerInvariantError,
  NoCreditsError,
} from './public/credits.errors';

let db: TestDatabase;
let service: AccountsService;
let alice: string;
let gen1: string;
let gen2: string;
let gen3: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  service = new AccountsService(db.pool);

  // credit_ledger.generation_id is a uuid. P4 will pass a real generation id here; until
  // then the tests must still pass something a uuid column accepts.
  gen1 = randomUUID();
  gen2 = randomUUID();
  gen3 = randomUUID();

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz') RETURNING id`,
  );
  alice = made.rows[0]?.id ?? '';
});

async function ledgerRows(): Promise<{ type: string; amount: number; note: string | null }[]> {
  const { rows } = await db.pool.query<{ type: string; amount: number; note: string | null }>(
    `SELECT type, amount, note FROM credit_ledger WHERE user_id = $1 ORDER BY created_at, type`,
    [alice],
  );
  return rows;
}

async function accountRowCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM credit_accounts WHERE user_id = $1`,
    [alice],
  );
  return Number(rows[0]?.n);
}

it('reports zero for a user with no account row, and does not create one', async () => {
  expect(await service.getBalance(alice)).toEqual({ available: 0, reserved: 0 });

  // D-010: a new account starts at zero. The strongest form of "no starter grant exists
  // anywhere in code" is that reading a balance writes nothing at all.
  expect(await accountRowCount()).toBe(0);
  expect(await ledgerRows()).toEqual([]);
});

it('grants credits and writes one owner_grant row carrying the note', async () => {
  const balance = await service.credit(alice, 5, 'owner_grant', { note: 'pilot seller' });

  expect(balance).toEqual({ available: 5, reserved: 0 });
  expect(await ledgerRows()).toEqual([{ type: 'owner_grant', amount: 5, note: 'pilot seller' }]);
  await assertLedgerMatchesAccounts(db.pool);
});

it('refuses a grant with a whitespace-only note, and writes nothing at all', async () => {
  await expect(
    service.credit(alice, 5, 'owner_grant', { note: '   ' }),
  ).rejects.toBeInstanceOf(GrantNoteRequiredError);

  // The rollback assertion: a refused grant must not leave a balance or a ledger row.
  expect(await service.getBalance(alice)).toEqual({ available: 0, reserved: 0 });
  expect(await ledgerRows()).toEqual([]);
});

it('reserves one credit, moving it from available to reserved', async () => {
  await service.credit(alice, 1, 'owner_grant', { note: 'seed' });

  expect(await service.reserveOne(alice, null)).toEqual({ available: 0, reserved: 1 });
  expect(await ledgerRows()).toEqual([
    { type: 'owner_grant', amount: 1, note: 'seed' },
    { type: 'reserve', amount: 1, note: null },
  ]);
  await assertLedgerMatchesAccounts(db.pool);
});

it('refuses a reserve on an empty balance and leaves no trace', async () => {
  await expect(service.reserveOne(alice, null)).rejects.toBeInstanceOf(NoCreditsError);

  expect(await service.getBalance(alice)).toEqual({ available: 0, reserved: 0 });
  expect(await ledgerRows()).toEqual([]);
});

it('debits a reserved credit for good', async () => {
  await service.credit(alice, 1, 'owner_grant', { note: 'seed' });
  await service.reserveOne(alice, gen1);

  expect(await service.debit(alice, gen1)).toEqual({ available: 0, reserved: 0 });
  expect((await ledgerRows()).map((row) => row.type)).toEqual([
    'owner_grant',
    'reserve',
    'debit',
  ]);
  await assertLedgerMatchesAccounts(db.pool);
});

it('releases a reserved credit back to available (D-020)', async () => {
  await service.credit(alice, 1, 'owner_grant', { note: 'seed' });
  await service.reserveOne(alice, gen1);

  // This is the whole of "auto-refund": a failed, refused or needs-input job gives the
  // credit back, and there is no separate refund system to build.
  expect(await service.release(alice, gen1)).toEqual({ available: 1, reserved: 0 });
  expect((await ledgerRows()).map((row) => row.type)).toEqual([
    'owner_grant',
    'reserve',
    'release',
  ]);
  await assertLedgerMatchesAccounts(db.pool);
});

it('treats a debit with nothing reserved as our bug, not the seller\'s', async () => {
  await service.credit(alice, 1, 'owner_grant', { note: 'seed' });

  const error = await service.debit(alice, gen1).catch((caught: unknown) => caught);

  expect(error).toBeInstanceOf(LedgerInvariantError);
  // An InfraError: 500 and logged with its stack, never an apology to the seller.
  expect((error as LedgerInvariantError).status).toBe(500);
  expect(await ledgerRows()).toEqual([{ type: 'owner_grant', amount: 1, note: 'seed' }]);
});

it('keeps the account and the ledger in step across a full lifecycle', async () => {
  await service.credit(alice, 5, 'owner_grant', { note: 'pilot' });
  await service.reserveOne(alice, gen1);
  await service.debit(alice, gen1);
  await service.reserveOne(alice, gen2);
  await service.release(alice, gen2);
  await service.reserveOne(alice, gen3);

  expect(await service.getBalance(alice)).toEqual({ available: 3, reserved: 1 });
  await assertLedgerMatchesAccounts(db.pool);
});
