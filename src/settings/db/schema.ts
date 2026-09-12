import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

/**
 * Key–value rather than a column per setting, because D-023 and D-008 both say these
 * change without a deploy. The cost is that the shape of each value is validated in code
 * instead of by the schema — `SETTINGS_KEYS` in the port is that whitelist.
 */
export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export type SiteSettingRow = typeof siteSettings.$inferSelect;
