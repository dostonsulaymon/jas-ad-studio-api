import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

/**
 * Spec §4 `events`, source 01 §37: our own product events, no third-party analytics.
 * Never prompts, briefs, images or free text: props are short primitives (P8 Part 5).
 */
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** set null: deleting an account removes the person from the log but keeps the counts. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    props: jsonb('props').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('events_name_created_idx').on(table.name, table.createdAt)],
);

export type EventRow = typeof events.$inferSelect;
