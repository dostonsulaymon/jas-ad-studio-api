import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../common/testing/database';

let db: TestDatabase;
let alice: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz') RETURNING id`,
  );
  alice = made.rows[0]?.id ?? '';

  await db.pool.query(
    `INSERT INTO credit_packs (id, credits, price_uzs) VALUES ('pack_5', 5, 40000)`,
  );
});

/**
 * Asserts the DATABASE refuses the write, and names which rule did it. Checking the
 * constraint name matters: a test that only asserts "it threw" passes just as happily
 * when the write fails for an unrelated reason, such as a typo in the column list.
 */
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

async function newOrder(status = 'pending'): Promise<string> {
  const confirmed = status === 'paid' ? 'now()' : 'NULL';
  const reason = status === 'rejected' ? `'no money arrived'` : 'NULL';
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO credit_orders
       (user_id, pack_id, credits, amount_uzs, status, payment_method, confirmed_at, rejection_reason)
     VALUES ($1,'pack_5',5,40000,$2,'card_transfer',${confirmed},${reason})
     RETURNING id`,
    [alice, status],
  );
  return rows[0]?.id ?? '';
}

it('refuses a negative available balance', async () => {
  await refusedBy(
    'credit_accounts_non_negative',
    `INSERT INTO credit_accounts (user_id, available) VALUES ($1, -1)`,
    [alice],
  );
});

it('refuses a negative reserved balance', async () => {
  await refusedBy(
    'credit_accounts_non_negative',
    `INSERT INTO credit_accounts (user_id, reserved) VALUES ($1, -1)`,
    [alice],
  );
});

it('credits one order exactly once, however many times it is confirmed', async () => {
  const order = await newOrder('paid');

  await db.pool.query(
    `INSERT INTO credit_ledger (user_id, type, amount, order_id) VALUES ($1,'purchase',5,$2)`,
    [alice, order],
  );

  // The whole money guarantee of Addendum A §A4, enforced by the database rather than by
  // application code remembering to check.
  await refusedBy(
    'credit_ledger_one_purchase_per_order',
    `INSERT INTO credit_ledger (user_id, type, amount, order_id) VALUES ($1,'purchase',5,$2)`,
    [alice, order],
  );

  const { rows } = await db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM credit_ledger WHERE order_id = $1 AND type = 'purchase'`,
    [order],
  );
  expect(Number(rows[0]?.n)).toBe(1);
});

it('is a PARTIAL unique index: non-purchase rows may share an order', async () => {
  const order = await newOrder('paid');

  // If the index were a blanket UNIQUE(order_id), this second row would be refused and
  // P4 could never release a reservation twice against the same order.
  await db.pool.query(
    `INSERT INTO credit_ledger (user_id, type, amount, order_id) VALUES ($1,'reserve',1,$2), ($1,'release',1,$2)`,
    [alice, order],
  );

  const { rows } = await db.pool.query<{ n: string }>(
    `SELECT count(*) AS n FROM credit_ledger WHERE order_id = $1`,
    [order],
  );
  expect(Number(rows[0]?.n)).toBe(2);
});

it('refuses an owner grant with no note', async () => {
  await refusedBy(
    'credit_ledger_grant_needs_note',
    `INSERT INTO credit_ledger (user_id, type, amount) VALUES ($1,'owner_grant',5)`,
    [alice],
  );
});

it('refuses an owner grant whose note is only whitespace', async () => {
  await refusedBy(
    'credit_ledger_grant_needs_note',
    `INSERT INTO credit_ledger (user_id, type, amount, note) VALUES ($1,'owner_grant',5,'   ')`,
    [alice],
  );
});

it('refuses a ledger row of zero credits', async () => {
  await refusedBy(
    'credit_ledger_amount_check',
    `INSERT INTO credit_ledger (user_id, type, amount, note) VALUES ($1,'owner_grant',0,'pilot')`,
    [alice],
  );
});

it('refuses a purchase with no order behind it', async () => {
  await refusedBy(
    'credit_ledger_purchase_needs_order',
    `INSERT INTO credit_ledger (user_id, type, amount) VALUES ($1,'purchase',5)`,
    [alice],
  );
});

it('refuses an unknown ledger type', async () => {
  await refusedBy(
    'credit_ledger_type_check',
    `INSERT INTO credit_ledger (user_id, type, amount) VALUES ($1,'refund',5)`,
    [alice],
  );
});

it('refuses an active pack with no price (A8: no invented prices)', async () => {
  await refusedBy(
    'credit_packs_active_needs_price',
    `INSERT INTO credit_packs (id, credits, price_uzs, is_active) VALUES ('pack_x', 1, NULL, true)`,
  );
});

it('refuses a paid order that does not say when it was confirmed', async () => {
  await refusedBy(
    'credit_orders_paid_needs_confirmer',
    `INSERT INTO credit_orders (user_id, pack_id, credits, amount_uzs, status, payment_method)
     VALUES ($1,'pack_5',5,40000,'paid','card_transfer')`,
    [alice],
  );
});

it('refuses a pending order that claims a confirmation time', async () => {
  await refusedBy(
    'credit_orders_paid_needs_confirmer',
    `INSERT INTO credit_orders (user_id, pack_id, credits, amount_uzs, status, payment_method, confirmed_at)
     VALUES ($1,'pack_5',5,40000,'pending','card_transfer', now())`,
    [alice],
  );
});

it('refuses a rejected order with no reason for the seller', async () => {
  await refusedBy(
    'credit_orders_rejected_needs_reason',
    `INSERT INTO credit_orders (user_id, pack_id, credits, amount_uzs, status, payment_method)
     VALUES ($1,'pack_5',5,40000,'rejected','card_transfer')`,
    [alice],
  );
});

it('refuses an unknown payment method', async () => {
  await refusedBy(
    'credit_orders_method_check',
    `INSERT INTO credit_orders (user_id, pack_id, credits, amount_uzs, payment_method)
     VALUES ($1,'pack_5',5,40000,'bitcoin')`,
    [alice],
  );
});

it('bounds the payer reference a seller can submit', async () => {
  await refusedBy(
    'credit_orders_reference_len',
    `INSERT INTO credit_orders (user_id, pack_id, credits, amount_uzs, payment_method, payer_reference)
     VALUES ($1,'pack_5',5,40000,'card_transfer',$2)`,
    [alice, 'x'.repeat(121)],
  );
});

it('will not let a pack be deleted out from under a sale', async () => {
  await newOrder();

  // ON DELETE restrict. A cascade here would erase the record of money changing hands.
  let caught: unknown;
  try {
    await db.pool.query(`DELETE FROM credit_packs WHERE id = 'pack_5'`);
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeDefined();
  expect((caught as { code?: string }).code).toBe('23503');
});
