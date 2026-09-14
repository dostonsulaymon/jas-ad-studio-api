import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import type { ReferenceImage } from '../ai/public/provider.port';
import { PG_POOL } from '../common/db/tokens';
import type { Executor } from '../common/db/transaction';

export interface CachedQuestions {
  generationId: string;
  questionsUz: string[];
}

/**
 * Source 01 §29: "cache reference analysis where practical" and "cap repeated free
 * analysis attempts to prevent abuse".
 *
 * Without this, needs_input is an unlimited free tap: a needs_input releases the credit
 * (D-020), so a seller could ask the model the same unanswerable question for ever at
 * Doston's expense.
 */
@Injectable()
export class NeedsInputCache {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * The user id is IN the key, so two sellers with the same stock photo never share a
   * row — that would leak one seller's brief into the other's answer. The image hashes
   * are sorted, so photo order does not change the key.
   */
  static key(userId: string, projectId: string, images: ReferenceImage[]): string {
    const imageHashes = images
      .map((image) => createHash('sha256').update(image.bytes).digest('hex'))
      .sort();

    return createHash('sha256')
      .update(`${userId}|${projectId}|${imageHashes.join(',')}`)
      .digest('hex');
  }

  /** D-021: a deleted project's cached questions go with it; they were derived from its brief. */
  async forgetProject(userId: string, projectId: string, tx: Executor): Promise<void> {
    await tx.query(`DELETE FROM needs_input_cache WHERE user_id = $1 AND project_id = $2`, [
      userId,
      projectId,
    ]);
  }

  async lookup(
    userId: string,
    projectId: string,
    images: ReferenceImage[],
  ): Promise<CachedQuestions | null> {
    const { rows } = await this.pool.query<{ questions_uz: unknown; generation_id: string }>(
      `SELECT c.questions_uz, c.input_hash AS generation_id
         FROM needs_input_cache c
        WHERE c.input_hash = $1 AND c.user_id = $2`,
      [NeedsInputCache.key(userId, projectId, images), userId],
    );

    const row = rows[0];
    if (!row) return null;

    return {
      generationId: row.generation_id,
      questionsUz: Array.isArray(row.questions_uz) ? (row.questions_uz as string[]) : [],
    };
  }

  async remember(
    userId: string,
    projectId: string,
    inputHash: string,
    questionsUz: string[],
    tx: Executor,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO needs_input_cache (input_hash, user_id, project_id, questions_uz)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (input_hash) DO UPDATE SET questions_uz = $4, created_at = now()`,
      [inputHash, userId, projectId, JSON.stringify(questionsUz)],
    );
  }

  /**
   * Counts MISSES — rows written by a real call — not cache hits. Counting hits would
   * lock a seller out of reading the questions they are meant to answer.
   */
  async missesToday(projectId: string): Promise<number> {
    const { rows } = await this.pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM needs_input_cache
        WHERE project_id = $1 AND created_at >= now() - interval '1 day'`,
      [projectId],
    );
    return Number(rows[0]?.n ?? 0);
  }
}
