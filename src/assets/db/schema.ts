import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';
import { projects } from '../../projects/db/schema';

export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /**
     * Denormalised from projects on purpose: it lets every ownership check be a single
     * indexed predicate rather than a join, and the FK cascade keeps it honest.
     */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    /** R-6: exactly these two per upload. The original is never stored. */
    kind: text('kind', { enum: ['reference', 'model_input'] }).notNull(),
    /** Random, two levels deep, relative to STORAGE_ROOT. Never derived from user input. */
    path: text('path').notNull(),

    /** The ORIGINAL dimensions, so a seller can be told what they sent. */
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    sha256: text('sha256').notNull(),

    isPrimary: boolean('is_primary').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('assets_project_idx').on(table.projectId),
    index('assets_user_idx').on(table.userId),
    // Drizzle's enum is TypeScript-only; the database enforces it too.
    check('assets_kind_check', sql`${table.kind} IN ('reference', 'model_input')`),
  ],
);

export type AssetRow = typeof assets.$inferSelect;
