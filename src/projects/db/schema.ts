import { sql } from 'drizzle-orm';
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    description: text('description').notNull(),
    goal: text('goal').notNull(),
    /** D-062, D-065: the seller's own choice, no longer derived from a style. */
    formatId: text('format_id').notNull(),
    platform: text('platform').notNull(),
    aspectRatio: text('aspect_ratio').notNull(),
    /** D-064: Flow generates 10-second clips. */
    durationSeconds: integer('duration_seconds').notNull().default(10),

    audience: text('audience'),
    offer: jsonb('offer'),
    confirmedClaims: jsonb('confirmed_claims').notNull().default([]),
    galleryInspirationId: text('gallery_inspiration_id'),
    briefVersion: integer('brief_version').notNull().default(1),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * D-021: photos live until the project is deleted. Soft delete, so a deletion can be
     * reconciled against the credit ledger in P3 rather than leaving orphan rows.
     */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    // Every listing is "this user's live projects, newest first".
    index('projects_user_idx').on(table.userId, table.createdAt),
    check('projects_duration_check', sql`${table.durationSeconds} > 0`),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
