import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';
import { projects } from '../../projects/db/schema';

/** Source 01 §32's explicit job states, and the lease that makes recovery safe. */
export const generations = pgTable(
  'generations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** §32: the client's retry key. A duplicate click must find this row, not make another. */
    idempotencyKey: text('idempotency_key').notNull(),
    status: text('status').notNull().default('queued'),
    /**
     * Bumped at CLAIM time, not at failure time. A worker that dies mid-call never gets
     * to write anything, so a counter incremented on the way out would stay at zero and
     * the job would be retried for ever.
     */
    attempts: integer('attempts').notNull().default(0),
    leaseToken: uuid('lease_token'),
    leaseUntil: timestamp('lease_until', { withTimezone: true }),
    targetId: text('target_id').notNull(),
    /**
     * The creative format at request time (D-097). `projects.format_id` holds only the
     * latest choice, so a project generated in several formats could not say which wrote which.
     */
    formatId: text('format_id'),
    promptVersion: text('prompt_version'),
    provider: text('provider'),
    model: text('model'),
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    /** numeric, not a float: this column is summed for the daily spend cap (spec §10). */
    estCostUsd: numeric('est_cost_usd', { precision: 10, scale: 6 }),
    errorCode: text('error_code'),
    /**
     * The model's own two outcomes, stored on the job so a poll can answer without
     * joining anything: the Uzbek questions when needs_input, the Uzbek explanation when
     * refused. Never a provider message (spec §9).
     */
    questionsUz: jsonb('questions_uz').notNull().default([]),
    messageUz: text('message_uz'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // §32: duplicate clicks and network retries reuse the same job.
    uniqueIndex('generations_user_key').on(table.userId, table.idempotencyKey),
    /**
     * Spec §10 wants at most one running job per user. A partial unique index makes that
     * the database's rule, so two simultaneous POSTs cannot both pass a count() check and
     * both insert — the second gets a unique violation, which becomes a 409.
     */
    uniqueIndex('generations_one_active_per_user')
      .on(table.userId)
      .where(sql`${table.status} IN ('queued','running')`),
    index('generations_sweep_idx')
      .on(table.leaseUntil)
      .where(sql`${table.status} = 'running'`),
    index('generations_spend_idx').on(table.createdAt),
    check(
      'generations_status_check',
      sql`${table.status} IN ('queued','running','ready','needs_input','refused','failed')`,
    ),
    // A job either holds a whole lease or none of one.
    check(
      'generations_lease_pairing',
      sql`(${table.leaseToken} IS NULL) = (${table.leaseUntil} IS NULL)`,
    ),
    check(
      'generations_finished_pairing',
      sql`(${table.status} IN ('ready','needs_input','refused','failed')) = (${table.finishedAt} IS NOT NULL)`,
    ),
  ],
);

/** The thing the seller paid for. Written only in the same transaction as the debit. */
export const packages = pgTable('packages', {
  generationId: uuid('generation_id')
    .primaryKey()
    .references(() => generations.id, { onDelete: 'cascade' }),
  result: jsonb('result').notNull(),
  promptEn: text('prompt_en').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Source 01 §29: identical inputs return the same questions without a new paid call. */
export const needsInputCache = pgTable(
  'needs_input_cache',
  {
    /**
     * sha256 of the user id, the sorted asset hashes and the brief hash. The user id is
     * in the key so two sellers with the same stock photo never share a row — that would
     * leak one seller's brief into the other's answer.
     */
    inputHash: text('input_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    questionsUz: jsonb('questions_uz').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('needs_input_project_idx').on(table.projectId, table.createdAt)],
);

export type GenerationRow = typeof generations.$inferSelect;
export type PackageRow = typeof packages.$inferSelect;
export type NeedsInputCacheRow = typeof needsInputCache.$inferSelect;
