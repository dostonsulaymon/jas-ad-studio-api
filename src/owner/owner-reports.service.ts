import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import type { OwnerGeneration, OwnerSpendDay } from './public/owner-reports.port';

/**
 * The two read-only views the P5 owner panel asks for: what has been generated, and
 * what it cost per day (D-037).
 *
 * Read-only on purpose. Nothing here writes, and nothing here touches the ledger: spend
 * is the recorded `est_cost_usd` of AI calls, which is a different number from credits
 * and must never be presented as one.
 */
@Injectable()
export class OwnerReportsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Recent generations across every seller, newest first. */
  async listGenerations(limit: number): Promise<OwnerGeneration[]> {
    const { rows } = await this.pool.query<{
      id: string;
      user_email: string;
      project_name: string | null;
      status: string;
      model: string | null;
      est_cost_usd: string | null;
      created_at: Date;
      finished_at: Date | null;
    }>(
      `SELECT g.id,
              u.email        AS user_email,
              p.name         AS project_name,
              g.status,
              g.model,
              g.est_cost_usd,
              g.created_at,
              g.finished_at
         FROM generations g
         JOIN users u    ON u.id = g.user_id
         LEFT JOIN projects p ON p.id = g.project_id
        ORDER BY g.created_at DESC
        LIMIT $1`,
      [limit],
    );

    return rows.map((row) => ({
      id: row.id,
      userEmail: row.user_email,
      projectName: row.project_name,
      status: row.status,
      model: row.model,
      // numeric comes back as a string from pg; the wire shape is a number, and null
      // stays null rather than becoming a misleading zero.
      estCostUsd: row.est_cost_usd === null ? null : Number(row.est_cost_usd),
      createdAt: row.created_at.toISOString(),
      finishedAt: row.finished_at === null ? null : row.finished_at.toISOString(),
    }));
  }

  /**
   * Daily AI spend, newest first. This is the number DAILY_AI_SPEND_LIMIT_USD is
   * measured against, so it counts every call that recorded a cost, not only the ones
   * that produced a package.
   */
  async listSpendByDay(days: number): Promise<OwnerSpendDay[]> {
    const { rows } = await this.pool.query<{
      day: Date;
      generations: string;
      failed: string;
      est_cost_usd: string | null;
    }>(
      `SELECT date_trunc('day', created_at)                       AS day,
              count(*)                                            AS generations,
              count(*) FILTER (WHERE status IN ('failed','refused')) AS failed,
              sum(est_cost_usd)                                   AS est_cost_usd
         FROM generations
        WHERE created_at >= now() - ($1::int * interval '1 day')
        GROUP BY 1
        ORDER BY 1 DESC`,
      [days],
    );

    return rows.map((row) => ({
      day: row.day.toISOString().slice(0, 10),
      generations: Number(row.generations),
      failed: Number(row.failed),
      estCostUsd: row.est_cost_usd === null ? 0 : Number(row.est_cost_usd),
    }));
  }
}
