import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import type { Executor } from '../common/db/transaction';
import { PackNotAvailableError } from './public/credits.errors';
import type { AdminPack, CreditPack, PackEdit } from './public/credits.port';

interface PackDbRow {
  id: string;
  credits: number;
  price_uzs: string | number | null;
  is_active: boolean;
  sort_order: number;
}

@Injectable()
export class PacksService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * What a seller may buy. The `price_uzs IS NOT NULL` is redundant against the
   * `credit_packs_active_needs_price` CHECK — kept so the query stays correct if someone
   * later relaxes the constraint.
   */
  async listSellable(tx: Executor = this.pool): Promise<CreditPack[]> {
    const { rows } = await tx.query<PackDbRow>(
      `SELECT id, credits, price_uzs, is_active, sort_order FROM credit_packs
        WHERE is_active AND price_uzs IS NOT NULL
        ORDER BY sort_order, credits`,
    );
    return rows.map((row) => ({
      id: row.id,
      credits: row.credits,
      priceUzs: Number(row.price_uzs),
      sortOrder: row.sort_order,
    }));
  }

  /** Every pack, priced or not, for the owner panel. */
  async listAll(tx: Executor = this.pool): Promise<AdminPack[]> {
    const { rows } = await tx.query<PackDbRow>(
      `SELECT id, credits, price_uzs, is_active, sort_order FROM credit_packs
        ORDER BY sort_order, credits`,
    );
    return rows.map(toAdminPack);
  }

  /** The row an order snapshots its price from. Throws unless the pack is really for sale. */
  async getSellable(packId: string, tx: Executor = this.pool): Promise<CreditPack> {
    const { rows } = await tx.query<PackDbRow>(
      `SELECT id, credits, price_uzs, is_active, sort_order FROM credit_packs
        WHERE id = $1 AND is_active AND price_uzs IS NOT NULL`,
      [packId],
    );
    const row = rows[0];
    if (!row) throw new PackNotAvailableError(`Pack ${packId} is not for sale`);

    return {
      id: row.id,
      credits: row.credits,
      priceUzs: Number(row.price_uzs),
      sortOrder: row.sort_order,
    };
  }

  /**
   * Owner-only. `packEditSchema` has already refused `isActive: true` without a
   * `priceUzs` in the same request (D-072), so a placeholder price cannot go live by one
   * careless toggle.
   */
  async setPack(packId: string, edit: PackEdit, tx: Executor = this.pool): Promise<AdminPack> {
    const { rows } = await tx.query<PackDbRow>(
      `UPDATE credit_packs
          SET price_uzs  = COALESCE($2, price_uzs),
              is_active  = COALESCE($3, is_active),
              sort_order = COALESCE($4, sort_order),
              updated_at = now()
        WHERE id = $1
        RETURNING id, credits, price_uzs, is_active, sort_order`,
      [
        packId,
        edit.priceUzs ?? null,
        edit.isActive ?? null,
        edit.sortOrder ?? null,
      ],
    );

    const row = rows[0];
    if (!row) throw new PackNotAvailableError(`Pack ${packId} does not exist`);
    return toAdminPack(row);
  }
}

function toAdminPack(row: PackDbRow): AdminPack {
  return {
    id: row.id,
    credits: row.credits,
    priceUzs: row.price_uzs === null ? null : Number(row.price_uzs),
    isActive: row.is_active,
    sortOrder: row.sort_order,
  };
}
