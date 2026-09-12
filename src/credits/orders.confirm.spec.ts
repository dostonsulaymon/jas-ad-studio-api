import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { SettingsService } from '../settings/settings.service';
import { assertLedgerMatchesAccounts } from '../common/testing/ledger';
import {
  buildCredits,
  openForBusiness,
  resetCredits,
  seedUsers,
  type CreditsHarness,
} from './testing/harness';
import { GrantNoteRequiredError, OrderNotPendingError } from './public/credits.errors';
import { createOrderSchema, grantSchema } from './public/credits.port';

let db: TestDatabase;
let credits: CreditsHarness;
let alice: string;
let owner: string;

const order5 = createOrderSchema.parse({ packId: 'pack_5', paymentMethod: 'card_transfer' });

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await resetCredits(db.pool);
  ({ alice, owner } = await seedUsers(db.pool));
  credits = buildCredits(db.pool, new SettingsService(db.pool));
  await openForBusiness(credits, owner);
});

async function purchaseRows(orderId: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM credit_ledger WHERE order_id = $1 AND type = 'purchase'`,
    [orderId],
  );
  return Number(rows[0]?.n);
}

it('confirming a pending order credits exactly the pack it was sold at', async () => {
  const placed = await credits.orders.create(alice, order5);

  const result = await credits.orders.confirmOrder(placed.id, owner);

  expect(result.alreadyPaid).toBe(false);
  expect(result.credited).toBe(5);
  expect(result.order.status).toBe('paid');
  expect(result.order.confirmedAt).not.toBeNull();
  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 5, reserved: 0 });
  expect(await purchaseRows(placed.id)).toBe(1);

  const { rows } = await db.pool.query<{ confirmed_by: string }>(
    `SELECT confirmed_by FROM credit_orders WHERE id = $1`,
    [placed.id],
  );
  expect(rows[0]?.confirmed_by).toBe(owner);
  await assertLedgerMatchesAccounts(db.pool);
});

it('confirming twice in sequence changes nothing the second time (A8)', async () => {
  const placed = await credits.orders.create(alice, order5);

  await credits.orders.confirmOrder(placed.id, owner);
  const second = await credits.orders.confirmOrder(placed.id, owner);

  expect(second.alreadyPaid).toBe(true);
  expect(second.credited).toBe(0);
  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 5, reserved: 0 });
  expect(await purchaseRows(placed.id)).toBe(1);
  await assertLedgerMatchesAccounts(db.pool);
});

it('confirming twice CONCURRENTLY still credits exactly once', async () => {
  const placed = await credits.orders.create(alice, order5);

  // The case the FOR UPDATE alone cannot be trusted for, and the reason the partial
  // unique index on (order_id) WHERE type = 'purchase' exists.
  const results = await Promise.allSettled([
    credits.orders.confirmOrder(placed.id, owner),
    credits.orders.confirmOrder(placed.id, owner),
  ]);

  // Neither call may fail: a double confirm is a no-op, not an error for the owner.
  expect(results.every((result) => result.status === 'fulfilled')).toBe(true);

  const credited = results
    .map((result) => (result as PromiseFulfilledResult<{ credited: number }>).value.credited)
    .reduce((sum, value) => sum + value, 0);
  expect(credited).toBe(5);

  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 5, reserved: 0 });
  expect(await purchaseRows(placed.id)).toBe(1);
  await assertLedgerMatchesAccounts(db.pool);
});

it('refuses to confirm a cancelled order, and credits nothing', async () => {
  const placed = await credits.orders.create(alice, order5);
  await credits.orders.cancel(alice, placed.id);

  await expect(credits.orders.confirmOrder(placed.id, owner)).rejects.toBeInstanceOf(
    OrderNotPendingError,
  );
  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 0, reserved: 0 });
});

it('rejects a pending order with a reason and no ledger row', async () => {
  const placed = await credits.orders.create(alice, order5);

  const rejected = await credits.orders.rejectOrder(placed.id, owner, 'no transfer found');

  expect(rejected.status).toBe('rejected');
  expect(rejected.rejectionReason).toBe('no transfer found');
  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 0, reserved: 0 });
  expect(await purchaseRows(placed.id)).toBe(0);
});

it('refuses to reject an order that was already paid, and the credit stays', async () => {
  const placed = await credits.orders.create(alice, order5);
  await credits.orders.confirmOrder(placed.id, owner);

  await expect(
    credits.orders.rejectOrder(placed.id, owner, 'changed my mind'),
  ).rejects.toBeInstanceOf(OrderNotPendingError);

  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 5, reserved: 0 });
});

it('grants credits by hand with a note (D-010 pilots, D-020 goodwill)', async () => {
  const balance = await credits.orders.grant(
    grantSchema.parse({ userId: alice, credits: 3, note: 'pilot seller, Samarqand' }),
  );

  expect(balance).toEqual({ available: 3, reserved: 0 });

  const { rows } = await db.pool.query<{ type: string; note: string }>(
    `SELECT type, note FROM credit_ledger WHERE user_id = $1`,
    [alice],
  );
  expect(rows).toEqual([{ type: 'owner_grant', note: 'pilot seller, Samarqand' }]);
  await assertLedgerMatchesAccounts(db.pool);
});

it('refuses a grant with a blank note and writes nothing', async () => {
  // The schema stops it first; this asserts the service refuses it too, so a caller that
  // bypasses the DTO still cannot write an unauditable grant.
  await expect(
    credits.orders.grant({ userId: alice, credits: 3, note: '   ' }),
  ).rejects.toBeInstanceOf(GrantNoteRequiredError);

  expect(grantSchema.safeParse({ userId: alice, credits: 3, note: '  ' }).success).toBe(false);
  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 0, reserved: 0 });
});

it("lists the owner's queue oldest first, with the seller's identity", async () => {
  const first = await credits.orders.create(alice, order5);
  await credits.orders.create(alice, order5);
  await credits.orders.confirmOrder(first.id, owner);

  const pending = await credits.orders.listOrders('pending', 50);
  expect(pending).toHaveLength(1);
  expect(pending[0]?.userEmail).toBe('alice@x.uz');

  const all = await credits.orders.listOrders(null, 50);
  expect(all).toHaveLength(2);
  expect(all[0]?.id).toBe(first.id);
});

it('shows the owner a balance for a user who has never had an account row', async () => {
  const users = await credits.orders.listUsers(50);

  expect(users).toHaveLength(3);
  for (const user of users) {
    expect(user).toMatchObject({ available: 0, reserved: 0 });
  }
});
