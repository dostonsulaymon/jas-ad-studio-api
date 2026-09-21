import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import type { Executor } from '../common/db/transaction';
import type { ProAccessPort, ProGrant, ProStatus } from './public/pro.port';

const NONE: ProStatus = { hasPro: false, until: null };

@Injectable()
export class ProService implements ProAccessPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * The expiry is compared in the database, not in Node. Two clocks decide one answer
   * otherwise, and the one that matters is the one the row was written against.
   */
  async status(userId: string | null, tx: Executor = this.pool): Promise<ProStatus> {
    if (!userId) return NONE;

    const { rows } = await tx.query<{ granted_until: Date; has_pro: boolean }>(
      `SELECT granted_until, granted_until > now() AS has_pro
         FROM pro_access WHERE user_id = $1`,
      [userId],
    );

    const row = rows[0];
    if (!row) return NONE;

    return { hasPro: row.has_pro, until: row.granted_until.toISOString() };
  }

  async hasPro(userId: string | null, tx: Executor = this.pool): Promise<boolean> {
    return (await this.status(userId, tx)).hasPro;
  }

  /**
   * Upsert, so granting twice moves the date rather than failing or stacking. The owner
   * sends the date they mean; there is no arithmetic here to get wrong.
   */
  async grant(input: ProGrant, ownerId: string, tx: Executor = this.pool): Promise<ProStatus> {
    await tx.query(
      `INSERT INTO pro_access (user_id, granted_until, source, note, updated_at, updated_by)
            VALUES ($1, $2, 'owner_grant', $3, now(), $4)
       ON CONFLICT (user_id) DO UPDATE
               SET granted_until = EXCLUDED.granted_until,
                   source        = EXCLUDED.source,
                   note          = EXCLUDED.note,
                   updated_at    = now(),
                   updated_by    = EXCLUDED.updated_by`,
      [input.userId, input.until, input.note, ownerId],
    );

    return this.status(input.userId, tx);
  }
}
