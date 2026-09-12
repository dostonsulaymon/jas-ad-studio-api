import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { SettingsService } from '../settings/settings.service';
import {
  buildCredits,
  openForBusiness,
  resetCredits,
  seedUsers,
  type CreditsHarness,
} from './testing/harness';
import {
  OrderNotFoundError,
  OrderNotPendingError,
  OrderRateLimitedError,
  PackNotAvailableError,
  PaymentNotConfiguredError,
} from './public/credits.errors';
import { createOrderSchema, packEditSchema } from './public/credits.port';

let db: TestDatabase;
let credits: CreditsHarness;
let alice: string;
let bob: string;
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
  ({ alice, bob, owner } = await seedUsers(db.pool));
  credits = buildCredits(db.pool, new SettingsService(db.pool));
});

async function ledgerCount(): Promise<number> {
  const { rows } = await db.pool.query<{ n: string }>(`SELECT count(*) AS n FROM credit_ledger`);
  return Number(rows[0]?.n);
}

it('creates a pending order snapshotting the pack it was bought from', async () => {
  await openForBusiness(credits, owner);

  const created = await credits.orders.create(alice, order5);

  expect(created).toMatchObject({
    packId: 'pack_5',
    credits: 5,
    amountUzs: 40000,
    status: 'pending',
    paymentMethod: 'card_transfer',
    confirmedAt: null,
  });
  // Nothing is credited by placing an order. Addendum A §A4: never show a payment as
  // successful before the owner confirms it.
  expect(await ledgerCount()).toBe(0);
  expect(await credits.accounts.getBalance(alice)).toEqual({ available: 0, reserved: 0 });
});

it('refuses an order against an inactive pack', async () => {
  await credits.settings.setKey('payment_instructions', { cardNumber: '8600123412341234' }, owner);

  await expect(credits.orders.create(alice, order5)).rejects.toBeInstanceOf(
    PackNotAvailableError,
  );
});

it('refuses an order when there is nowhere to send the money, and inserts nothing', async () => {
  await credits.packs.setPack('pack_5', packEditSchema.parse({ priceUzs: 40000, isActive: true }));

  await expect(credits.orders.create(alice, order5)).rejects.toBeInstanceOf(
    PaymentNotConfiguredError,
  );

  expect(await credits.orders.listFor(alice)).toEqual([]);
});

it('keeps the price the seller was shown when the pack price later changes', async () => {
  await openForBusiness(credits, owner);
  const created = await credits.orders.create(alice, order5);

  await credits.packs.setPack('pack_5', packEditSchema.parse({ priceUzs: 99000 }));

  const [reread] = await credits.orders.listFor(alice);
  expect(reread?.amountUzs).toBe(40000);
  expect(reread?.id).toBe(created.id);
});

it('caps how many orders a seller can place in a day (spec §10)', async () => {
  await openForBusiness(credits, owner);
  const limited = buildCredits(db.pool, new SettingsService(db.pool), 3);

  await limited.orders.create(alice, order5);
  await limited.orders.create(alice, order5);
  await limited.orders.create(alice, order5);

  await expect(limited.orders.create(alice, order5)).rejects.toBeInstanceOf(
    OrderRateLimitedError,
  );
});

it('shows a seller only their own orders', async () => {
  await openForBusiness(credits, owner);
  await credits.orders.create(alice, order5);
  await credits.orders.create(bob, order5);

  const mine = await credits.orders.listFor(alice);
  expect(mine).toHaveLength(1);

  const theirs = await credits.orders.listFor(bob);
  expect(theirs).toHaveLength(1);
  expect(theirs[0]?.id).not.toBe(mine[0]?.id);
});

it('cancels a pending order without writing a ledger row', async () => {
  await openForBusiness(credits, owner);
  const created = await credits.orders.create(alice, order5);

  const cancelled = await credits.orders.cancel(alice, created.id);

  expect(cancelled.status).toBe('cancelled');
  // A pending order never credited anything, so there is nothing to reverse.
  expect(await ledgerCount()).toBe(0);
});

it("answers 404, not 403, when a seller cancels someone else's order", async () => {
  await openForBusiness(credits, owner);
  const bobs = await credits.orders.create(bob, order5);

  // A 403 would confirm the id exists, which is itself the leak (the P2 discipline).
  await expect(credits.orders.cancel(alice, bobs.id)).rejects.toBeInstanceOf(OrderNotFoundError);

  const [stillThere] = await credits.orders.listFor(bob);
  expect(stillThere?.status).toBe('pending');
});

it('refuses to cancel an order that has already been paid', async () => {
  await openForBusiness(credits, owner);
  const created = await credits.orders.create(alice, order5);
  await credits.orders.confirmOrder(created.id, owner);

  await expect(credits.orders.cancel(alice, created.id)).rejects.toBeInstanceOf(
    OrderNotPendingError,
  );

  const [reread] = await credits.orders.listFor(alice);
  expect(reread?.status).toBe('paid');
});

it('bounds and trims the payer reference a seller submits', async () => {
  await openForBusiness(credits, owner);

  const trimmed = createOrderSchema.parse({
    packId: 'pack_5',
    paymentMethod: 'payme',
    payerReference: '   ref-123   ',
  });
  const created = await credits.orders.create(alice, trimmed);
  expect(created.payerReference).toBe('ref-123');

  expect(
    createOrderSchema.safeParse({
      packId: 'pack_5',
      paymentMethod: 'payme',
      payerReference: 'x'.repeat(121),
    }).success,
  ).toBe(false);
});
