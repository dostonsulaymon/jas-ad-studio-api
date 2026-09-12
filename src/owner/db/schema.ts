import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

/** D-037: every owner action is written here. Append-only — there is no update or delete path. */
export const ownerAuditLog = pgTable(
  'owner_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /**
     * restrict, not cascade: an audit trail that can be erased by deleting a user is not
     * an audit trail.
     */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    /** 'order.confirm', 'order.reject', 'credits.grant', 'pack.update', 'setting.update' */
    action: text('action').notNull(),
    targetType: text('target_type').notNull(),
    targetId: text('target_id').notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('owner_audit_log_created_idx').on(table.createdAt)],
);

export type OwnerAuditRow = typeof ownerAuditLog.$inferSelect;
