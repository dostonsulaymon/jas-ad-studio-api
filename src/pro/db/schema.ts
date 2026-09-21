import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
