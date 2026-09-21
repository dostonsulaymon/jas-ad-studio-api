import { bigint, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

/**
 * Who may open a PRO gallery prompt, and until when (R-010, P8c Layer 1).
 *
 * One row per seller, rewritten when access is extended. This is deliberately **not** the
 * subscription table: it records the *fact* of access, not how it was bought. Q-18 has yet
 * to answer what a subscription costs, how it is paid for or what a lapse does, and
 * guessing any of that here would put a made-up money model in the schema. When Layer 2
 * lands it writes `source = 'order'` rows through the same port.
 *
 * `grantedUntil` in the past means expired, not deleted: the record of who once had access
 * is worth keeping, and a row that vanishes on expiry cannot be explained to a seller.
 */
export const proAccess = pgTable('pro_access', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),

  grantedUntil: timestamp('granted_until', { withTimezone: true }).notNull(),

  /** How it was come by. Only 'owner_grant' exists until Q-18 is answered. */
  source: text('source').notNull().default('owner_grant'),
  note: text('note').notNull().default(''),

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export type ProAccessRow = typeof proAccess.$inferSelect;

/**
 * A seller's request to buy PRO, confirmed by hand (D-102, mirroring D-008's credit orders).
 *
 * The amount and the length are copied onto the row at the moment it is placed, not read from
 * settings at confirmation time: a price the owner changes tomorrow must not silently change what
 * somebody already agreed to pay. Same reason `credit_orders` carries its own `amount_uzs`.
 */
export const proOrders = pgTable('pro_orders', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  amountUzs: bigint('amount_uzs', { mode: 'number' }).notNull(),
  days: integer('days').notNull(),

  /** pending → confirmed | rejected. One order grants access exactly once. */
  status: text('status').notNull().default('pending'),
  payerReference: text('payer_reference'),
  rejectionReason: text('rejection_reason'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
});

/**
 * One pending order per seller, as a partial unique index added by hand in migration 0014.
 * Declared here as a comment rather than in the table definition because drizzle-kit does not
 * emit partial indexes; the migration is the source of truth and `db:generate` leaves it alone.
 */

export type ProOrderRow = typeof proOrders.$inferSelect;
