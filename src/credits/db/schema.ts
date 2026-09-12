import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';
import { generations } from '../../generation/db/schema';

/** D-009: three packs, 1 / 5 / 15 credits. Jakhongir sets the prices (D-072). */
export const creditPacks = pgTable(
  'credit_packs',
  {
    /** A slug, not a uuid: it is seeded, referenced by orders, and read by a human owner. */
    id: text('id').primaryKey(),
    credits: integer('credits').notNull(),
    /** Som. Nullable because a pack with no price is not for sale (D-009). */
    priceUzs: bigint('price_uzs', { mode: 'number' }),
    /**
     * D-072: a pack is offered for sale only when an owner has activated it, and
     * activation requires the owner to state the price in the same request. So a
     * placeholder price can never be shown to a seller.
     */
    isActive: boolean('is_active').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('credit_packs_credits_check', sql`${table.credits} > 0`),
    check('credit_packs_price_check', sql`${table.priceUzs} IS NULL OR ${table.priceUzs} > 0`),
    // An active pack without a price would be an unsellable pack offered for sale.
    check(
      'credit_packs_active_needs_price',
      sql`NOT ${table.isActive} OR ${table.priceUzs} IS NOT NULL`,
    ),
  ],
);

/** Addendum A §A4. Replaces the spec's `additional_allowance_requests`. */
export const creditOrders = pgTable(
  'credit_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** restrict, not cascade: deleting a pack must never erase the record of a sale. */
    packId: text('pack_id')
      .notNull()
      .references(() => creditPacks.id, { onDelete: 'restrict' }),
    /** Snapshotted from the pack at creation, so a later price edit cannot rewrite a placed order. */
    credits: integer('credits').notNull(),
    amountUzs: bigint('amount_uzs', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('pending'),
    paymentMethod: text('payment_method').notNull(),
    payerReference: text('payer_reference'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('credit_orders_user_idx').on(table.userId, table.createdAt),
    // The owner's queue: pending orders, oldest first. Partial, because it is the only
    // listing the owner panel makes and pending is a small slice of the table.
    index('credit_orders_pending_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    check(
      'credit_orders_status_check',
      sql`${table.status} IN ('pending','paid','rejected','cancelled')`,
    ),
    check(
      'credit_orders_method_check',
      sql`${table.paymentMethod} IN ('card_transfer','payme','click','other')`,
    ),
    check(
      'credit_orders_credits_check',
      sql`${table.credits} > 0 AND ${table.amountUzs} > 0`,
    ),
    // Bounded, per Addendum A. Free text from a client always gets a ceiling.
    check(
      'credit_orders_reference_len',
      sql`${table.payerReference} IS NULL OR length(${table.payerReference}) <= 120`,
    ),
    // A paid order must say who confirmed it and when; an unpaid one must not claim to be.
    check(
      'credit_orders_paid_needs_confirmer',
      sql`(${table.status} = 'paid') = (${table.confirmedAt} IS NOT NULL)`,
    ),
    check(
      'credit_orders_rejected_needs_reason',
      sql`${table.status} <> 'rejected' OR ${table.rejectionReason} IS NOT NULL`,
    ),
  ],
);

/** R-3: the balance is a row with a CHECK, not a SUM over the ledger. */
export const creditAccounts = pgTable(
  'credit_accounts',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    available: integer('available').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The last line of defence. If any statement ever tries to overspend, the database
    // refuses the transaction rather than letting a negative balance exist.
    check(
      'credit_accounts_non_negative',
      sql`${table.available} >= 0 AND ${table.reserved} >= 0`,
    ),
  ],
);

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** Always positive. The type decides the direction — see the plan's "ledger model". */
    amount: integer('amount').notNull(),
    orderId: uuid('order_id').references(() => creditOrders.id, { onDelete: 'restrict' }),
    /**
     * P4 paid P3's debt: the constraint exists now that `generations` does.
     *
     * `set null`, not restrict or cascade. A ledger row is a money record and must
     * outlive the job it describes — but if a project is deleted and its generations
     * cascade away, the ledger row has to survive with this column blanked rather than
     * block the delete or vanish with it.
     */
    generationId: uuid('generation_id').references(() => generations.id, {
      onDelete: 'set null',
    }),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_ledger_user_idx').on(table.userId, table.createdAt),
    check(
      'credit_ledger_type_check',
      sql`${table.type} IN ('purchase','owner_grant','reserve','debit','release')`,
    ),
    check('credit_ledger_amount_check', sql`${table.amount} > 0`),
    // Addendum A §A3: a grant without a reason is not auditable.
    check(
      'credit_ledger_grant_needs_note',
      sql`${table.type} <> 'owner_grant' OR (${table.note} IS NOT NULL AND length(btrim(${table.note})) > 0)`,
    ),
    check(
      'credit_ledger_purchase_needs_order',
      sql`${table.type} <> 'purchase' OR ${table.orderId} IS NOT NULL`,
    ),
    // THE money guarantee (Addendum A §A4): one order credits exactly once, enforced by
    // the database, so a double confirm cannot depend on application code being careful.
    uniqueIndex('credit_ledger_one_purchase_per_order')
      .on(table.orderId)
      .where(sql`${table.type} = 'purchase'`),
  ],
);

export type CreditPackRow = typeof creditPacks.$inferSelect;
export type CreditOrderRow = typeof creditOrders.$inferSelect;
export type CreditAccountRow = typeof creditAccounts.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
