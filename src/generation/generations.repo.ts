import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import { generationResultSchema } from '../ai/public/result.schema';
import type { Executor } from '../common/db/transaction';
import type { GenerationDetail, GenerationView, JobStatus } from './public/generation.port';

export interface GenerationRow {
  id: string;
  project_id: string;
  user_id: string;
  status: JobStatus;
  attempts: number;
  target_id: string;
  questions_uz: unknown;
  message_uz: string | null;
  error_code: string | null;
  created_at: Date;
  finished_at: Date | null;
}

export interface ClaimedJob {
  generationId: string;
  leaseToken: string;
  attempts: number;
  projectId: string;
  userId: string;
  targetId: string;
}

export interface SettleFields {
  status: Exclude<JobStatus, 'queued' | 'running'>;
  provider: string | null;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estCostUsd: number | null;
  errorCode: string | null;
  messageUz: string | null;
  questionsUz: string[];
}

const VIEW_COLUMNS = `id, project_id, user_id, status, attempts, target_id,
  questions_uz, message_uz, error_code, created_at, finished_at`;

/** Every statement against `generations` and `packages` lives here and nowhere else. */
@Injectable()
export class GenerationsRepo {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async findByKey(
    userId: string,
    idempotencyKey: string,
    tx: Executor,
  ): Promise<GenerationView | null> {
    const { rows } = await tx.query<GenerationRow>(
      `SELECT ${VIEW_COLUMNS} FROM generations WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  /**
   * Inserts, or returns null when this (user, key) already has a job.
   *
   * `ON CONFLICT (user_id, idempotency_key) DO NOTHING` rather than letting the unique
   * index throw, because the two unique indexes on this table mean opposite things and
   * Postgres reports whichever it happens to check first:
   *
   * - `generations_user_key` means "this is a duplicate click" → reuse that job, charge
   *   nothing (§32).
   * - `generations_one_active_per_user` means "a different job is already running" → 409.
   *
   * Handling the first one here leaves a raised 23505 unambiguously the second.
   */
  async insertIfAbsent(
    input: { userId: string; projectId: string; idempotencyKey: string; targetId: string },
    tx: Executor,
  ): Promise<GenerationView | null> {
    const { rows } = await tx.query<GenerationRow>(
      `INSERT INTO generations (project_id, user_id, idempotency_key, target_id)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id, idempotency_key) DO NOTHING
       RETURNING ${VIEW_COLUMNS}`,
      [input.projectId, input.userId, input.idempotencyKey, input.targetId],
    );
    return rows[0] ? toView(rows[0]) : null;
  }

  /**
   * Claim by lease. The WHERE covers a queued job and a running one whose lease has
   * lapsed, so recovery needs no separate statement.
   *
   * `attempts` is incremented HERE, at claim time. A worker that dies mid-call never gets
   * to write anything, so a counter bumped on the way out would stay at zero and the job
   * would be retried for ever.
   */
  async claim(generationId: string, leaseMinutes: number): Promise<ClaimedJob | null> {
    const { rows } = await this.pool.query<{
      lease_token: string;
      attempts: number;
      project_id: string;
      user_id: string;
      target_id: string;
    }>(
      `UPDATE generations
          SET status = 'running',
              lease_token = gen_random_uuid(),
              lease_until = now() + ($2 * interval '1 minute'),
              attempts = attempts + 1
        WHERE id = $1
          AND (status = 'queued' OR (status = 'running' AND lease_until < now()))
        RETURNING lease_token, attempts, project_id, user_id, target_id`,
      [generationId, leaseMinutes],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      generationId,
      leaseToken: row.lease_token,
      attempts: row.attempts,
      projectId: row.project_id,
      userId: row.user_id,
      targetId: row.target_id,
    };
  }

  /**
   * The lease guard is the whole safety property: a stale worker updates 0 rows, so its
   * result is dropped rather than delivered alongside a refund (source 01 §32).
   *
   * Returns the user id when the settle took, null when the lease had moved on.
   */
  async settle(
    generationId: string,
    leaseToken: string,
    fields: SettleFields,
    tx: Executor,
  ): Promise<string | null> {
    const { rows } = await tx.query<{ user_id: string }>(
      `UPDATE generations
          SET status = $3, finished_at = now(), lease_token = NULL, lease_until = NULL,
              provider = $4, model = $5, input_tokens = $6, output_tokens = $7,
              est_cost_usd = $8, error_code = $9, message_uz = $10, questions_uz = $11
        WHERE id = $1 AND lease_token = $2
        RETURNING user_id`,
      [
        generationId,
        leaseToken,
        fields.status,
        fields.provider,
        fields.model,
        fields.inputTokens,
        fields.outputTokens,
        fields.estCostUsd,
        fields.errorCode,
        fields.messageUz,
        JSON.stringify(fields.questionsUz),
      ],
    );
    return rows[0]?.user_id ?? null;
  }

  async insertPackage(
    generationId: string,
    result: unknown,
    promptEn: string,
    tx: Executor,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO packages (generation_id, result, prompt_en) VALUES ($1,$2,$3)`,
      [generationId, JSON.stringify(result), promptEn],
    );
  }

  /**
   * Expired leases go back to the queue, or fail after three attempts.
   *
   * `lease_token = NULL` is not tidiness: it is the other half of the race guard. Once
   * the lease is cleared the old worker's `WHERE lease_token = $mine` can never match, so
   * its late success is dropped instead of arriving next to the refund.
   */
  async sweepExpired(tx: Executor): Promise<{ id: string; userId: string; status: JobStatus }[]> {
    const { rows } = await tx.query<{ id: string; user_id: string; status: JobStatus }>(
      `UPDATE generations
          SET status      = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
              finished_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END,
              error_code  = CASE WHEN attempts >= 3 THEN 'AI_TIMEOUT' ELSE NULL END,
              lease_token = NULL,
              lease_until = NULL
        WHERE status = 'running' AND lease_until < now()
        RETURNING id, user_id, status`,
      [],
    );
    return rows.map((row) => ({ id: row.id, userId: row.user_id, status: row.status }));
  }

  async countToday(userId: string, tx: Executor): Promise<number> {
    const { rows } = await tx.query<{ n: string }>(
      `SELECT count(*) AS n FROM generations
        WHERE user_id = $1 AND created_at >= now() - interval '1 day'`,
      [userId],
    );
    return Number(rows[0]?.n ?? 0);
  }

  /** Spec §10: the cap counts what was really spent, from the recorded cost. */
  async spentTodayUsd(tx: Executor): Promise<number> {
    const { rows } = await tx.query<{ total: string | null }>(
      `SELECT COALESCE(SUM(est_cost_usd), 0)::text AS total FROM generations
        WHERE created_at >= now() - interval '1 day'`,
      [],
    );
    return Number(rows[0]?.total ?? 0);
  }

  async findOwned(userId: string, generationId: string): Promise<GenerationDetail | null> {
    const { rows } = await this.pool.query<
      GenerationRow & {
        pkg_result: unknown;
        pkg_prompt: string | null;
        pkg_created: Date | null;
      }
    >(
      `SELECT ${VIEW_COLUMNS.split(', ').map((c) => 'g.' + c.trim()).join(', ')},
              p.result AS pkg_result, p.prompt_en AS pkg_prompt, p.created_at AS pkg_created
         FROM generations g
         LEFT JOIN packages p ON p.generation_id = g.id
        WHERE g.id = $2 AND g.user_id = $1`,
      [userId, generationId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      ...toView(row),
      package:
        row.pkg_prompt === null || row.pkg_created === null
          ? null
          : {
              generationId: row.id,
              promptEn: row.pkg_prompt,
              /**
               * Parsed on the way out, not cast. jsonb comes back as `unknown`, and the
               * contract now promises the web app a real §26 shape — so the promise is
               * checked rather than asserted. A package is validated before it is
               * stored, so a failure here means the schema changed incompatibly with
               * rows a seller already paid for, which should be loud.
               */
              result: generationResultSchema.parse(row.pkg_result),
              createdAt: row.pkg_created.toISOString(),
            },
    };
  }
}

function toView(row: GenerationRow | undefined): GenerationView {
  if (!row) throw new Error('a generation write returned no row');

  return {
    id: row.id,
    projectId: row.project_id,
    status: row.status,
    questionsUz: Array.isArray(row.questions_uz) ? (row.questions_uz as string[]) : [],
    messageUz: row.message_uz,
    errorCode: row.error_code,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
  };
}
