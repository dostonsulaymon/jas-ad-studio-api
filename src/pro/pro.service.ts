import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import type { Executor } from '../common/db/transaction';
import { withTransaction } from '../common/db/transaction';
import { CREDIT_ADMIN, type CreditAdminPort } from '../credits/public/credits.port';
import { SETTINGS_READER, type SettingsReader } from '../settings/public/settings.port';
import {
  ProNotForSaleError,
  ProOrderNotFoundError,
  ProOrderNotPendingError,
} from './public/pro.errors';
import type {
  OwnerProOrder,
  ProAccessPort,
  ProAdminPort,
  ProGrant,
  ProOrder,
  ProOrderStatus,
  ProStatus,
} from './public/pro.port';

interface OrderRow {
  id: string;
  amount_uzs: string | number;
  days: number;
  generations: number;
  status: ProOrderStatus;
  rejection_reason: string | null;
  created_at: Date;
  confirmed_at: Date | null;
}

const ORDER_COLUMNS =
  'id, amount_uzs, days, generations, status, rejection_reason, created_at, confirmed_at';

function toOrder(row: OrderRow): ProOrder {
  return {
    id: row.id,
    amountUzs: Number(row.amount_uzs),
    days: row.days,
    generations: row.generations,
    status: row.status,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at.toISOString(),
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
  };
}

const NONE: ProStatus = { hasPro: false, until: null };

@Injectable()
export class ProService implements ProAccessPort, ProAdminPort {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(SETTINGS_READER) private readonly settings: SettingsReader,
    @Inject(CREDIT_ADMIN) private readonly credits: CreditAdminPort,
  ) {}

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
   * A seller asks to buy PRO. The price and the length are copied onto the row now, so a price
   * the owner changes tomorrow cannot alter what somebody already agreed to pay.
   *
   * One pending order per seller, enforced by a partial unique index: pressing the button twice
   * returns the order that already exists rather than queueing a second payment for the same
   * thing. That is the same idempotency rule `confirm_credit_order` lives by, one table over.
   */
  async placeOrder(userId: string): Promise<ProOrder> {
    const plan = await this.settings.getProSubscription();
    if (plan.priceUzs === null) throw new ProNotForSaleError('PRO has no price yet');

    const existing = await this.pool.query<OrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM pro_orders WHERE user_id = $1 AND status = 'pending'`,
      [userId],
    );
    const pending = existing.rows[0];
    if (pending) return toOrder(pending);

    const { rows } = await this.pool.query<OrderRow>(
      `INSERT INTO pro_orders (user_id, amount_uzs, days, generations) VALUES ($1, $2, $3, $4)
       RETURNING ${ORDER_COLUMNS}`,
      [userId, plan.priceUzs, plan.days, plan.generationsIncluded],
    );
    return toOrder(rows[0] as OrderRow);
  }

  async listMyOrders(userId: string): Promise<ProOrder[]> {
    const { rows } = await this.pool.query<OrderRow>(
      `SELECT ${ORDER_COLUMNS} FROM pro_orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [userId],
    );
    return rows.map(toOrder);
  }

  async listOrders(status: ProOrderStatus | null, limit: number): Promise<OwnerProOrder[]> {
    const { rows } = await this.pool.query<OrderRow & { user_id: string; email: string }>(
      `SELECT o.${ORDER_COLUMNS.split(', ').join(', o.')}, o.user_id, u.email
         FROM pro_orders o JOIN users u ON u.id = o.user_id
        WHERE ($1::text IS NULL OR o.status = $1)
        ORDER BY o.created_at DESC LIMIT $2`,
      [status, limit],
    );
    return rows.map((row) => ({ ...toOrder(row), userId: row.user_id, email: row.email }));
  }

  /**
   * Confirming grants the access. Exactly once: the UPDATE only matches a pending row, so two
   * owners pressing the button at the same time produce one grant and one refusal.
   *
   * Access extends from whichever is later, now or the date the seller already has, so buying a
   * second month while the first is running adds to it rather than replacing it.
   */
  async confirmOrder(orderId: string, ownerId: string): Promise<ProStatus> {
    return withTransaction(this.pool, async (tx) => {
      const { rows } = await tx.query<{ user_id: string; days: number; generations: number }>(
        `UPDATE pro_orders SET status = 'confirmed', confirmed_at = now(), confirmed_by = $2
          WHERE id = $1 AND status = 'pending'
        RETURNING user_id, days, generations`,
        [orderId, ownerId],
      );

      const order = rows[0];
      if (!order) {
        const exists = await tx.query(`SELECT 1 FROM pro_orders WHERE id = $1`, [orderId]);
        throw exists.rowCount
          ? new ProOrderNotPendingError(`Order ${orderId} is not pending`)
          : new ProOrderNotFoundError(`No order ${orderId}`);
      }

      await tx.query(
        `INSERT INTO pro_access (user_id, granted_until, source, note, updated_at, updated_by)
              VALUES ($1, now() + make_interval(days => $2), 'order', $3, now(), $4)
         ON CONFLICT (user_id) DO UPDATE
                 SET granted_until = greatest(pro_access.granted_until, now())
                                     + make_interval(days => $2),
                     source = 'order', note = EXCLUDED.note,
                     updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [order.user_id, order.days, `pro_order ${orderId}`, ownerId],
      );

      /**
       * R-021: the generations a PRO month includes arrive as ordinary credits, in the same
       * transaction as the access. One ledger, one balance, and the existing reserve, debit and
       * refund paths work on them unchanged — a second counter would need a second refund rule
       * the day a generation fails.
       */
      if (order.generations > 0) {
        await this.credits.grant(
          { userId: order.user_id, credits: order.generations, note: `PRO ${orderId}` },
          tx,
        );
      }

      return this.status(order.user_id, tx);
    });
  }

  async rejectOrder(orderId: string, reason: string, ownerId: string): Promise<void> {
    const { rowCount } = await this.pool.query(
      `UPDATE pro_orders SET status = 'rejected', rejection_reason = $2, confirmed_by = $3
        WHERE id = $1 AND status = 'pending'`,
      [orderId, reason, ownerId],
    );
    if (!rowCount) throw new ProOrderNotPendingError(`Order ${orderId} is not pending`);
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
