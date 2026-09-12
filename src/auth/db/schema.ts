import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Google's stable subject id. A seller's email can change; this cannot. */
    googleSub: text('google_sub').notNull().unique(),
    email: text('email').notNull(),
    name: text('name'),
    locale: text('locale').notNull().default('uz-Latn'),
    /** D-037: set only from OWNER_EMAILS at sign-in, never from a request body. */
    role: text('role', { enum: ['seller', 'owner'] })
      .notNull()
      .default('seller'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('users_email_idx').on(table.email),
    // Drizzle's enum is TypeScript-only and emits no constraint. P3 gates the owner
    // endpoints and the credit ledger on this column, so the database enforces it too.
    check('users_role_check', sql`${table.role} IN ('seller', 'owner')`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    /**
     * The SHA-256 of the cookie value, never the value itself (D-036). A database leak
     * then hands an attacker hashes rather than usable sessions.
     */
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
