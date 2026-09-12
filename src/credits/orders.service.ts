import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { Env } from '../common/config/env.schema';
import { PG_POOL } from '../common/db/tokens';
import { isUniqueViolation, withTransaction, type Executor } from '../common/db/transaction';
import {
  SETTINGS_READER,
  type SettingsReader,
} from '../settings/public/settings.port';
import { AccountsService } from './accounts.service';
import { PacksService } from './packs.service';
import {
  OrderNotFoundError,
  OrderNotPendingError,
  OrderRateLimitedError,
  PaymentNotConfiguredError,
} from './public/credits.errors';
import type {
  ConfirmResult,
  CreateOrderInput,
  CreditAdminPort,
  CreditBalance,
  CreditOrderSummary,
  GrantInput,
  OrderStatus,
  OwnerOrder,
  OwnerUser,
  PackEdit,
  AdminPack,
} from './public/credits.port';

interface OrderDbRow {
  id: string;
  pack_id: string;
  credits: number;
  amount_uzs: string | number;
  status: OrderStatus;
  payment_method: CreditOrderSummary['paymentMethod'];
  payer_reference: string | null;
  rejection_reason: string | null;
  created_at: Date;
  confirmed_at: Date | null;
}

const COLUMNS =
  'id, pack_id, credits, amount_uzs, status, payment_method, payer_reference, rejection_reason, created_at, confirmed_at';

@Injectable()
export class OrdersService implements CreditAdminPort {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly packs: PacksService,
    private readonly accounts: AccountsService,
    @Inject(SETTINGS_READER) private readonly settings: SettingsReader,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private run<T>(tx: Executor | undefined, fn: (ex: Executor) => Promise<T>): Promise<T> {
    return tx ? fn(tx) : withTransaction(this.pool, fn);
  }

  async create(
    userId: string,
    input: CreateOrderInput,
    tx?: Executor,
  ): Promise<CreditOrderSummary> {
    return this.run(tx, async (ex) => {
      const pack = await this.packs.getSellable(input.packId, ex);

      // Addendum A §A4 step 2. An order the seller cannot act on banks a pending row the
      // owner can never match to a payment, and a seller who believes they have bought
      // something. Better to refuse the button.
      if (!(await this.settings.isPaymentConfigured(ex))) {
        throw new PaymentNotConfiguredError('No payment instructions are configured');
      }

      const { rows: recent } = await ex.query<{ n: string }>(
        `SELECT count(*) AS n FROM credit_orders
          WHERE user_id = $1 AND created_at >= now() - interval '1 day'`,
        [userId],
      );
      const limit = this.config.get('ORDERS_PER_DAY_LIMIT', { infer: true });
      if (Number(recent[0]?.n) >= limit) {
        throw new OrderRateLimitedError(`More than ${String(limit)} orders in a day`);
      }

      const { rows } = await ex.query<OrderDbRow>(
        `INSERT INTO credit_orders
           (user_id, pack_id, credits, amount_uzs, payment_method, payer_reference)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING ${COLUMNS}`,
        // credits and amount are SNAPSHOTTED from the pack. A later price edit must never
        // rewrite an order the seller has already been shown.
        [userId, pack.id, pack.credits, pack.priceUzs, input.paymentMethod, input.payerReference],
      );

      return toSummary(rows[0]);
    });
  }

  /** This user's orders, newest first. The user id is in the WHERE, never checked after. */
  async listFor(userId: string, tx: Executor = this.pool): Promise<CreditOrderSummary[]> {
    const { rows } = await tx.query<OrderDbRow>(
      `SELECT ${COLUMNS} FROM credit_orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(toSummary);
  }

  async cancel(userId: string, orderId: string, tx?: Executor): Promise<CreditOrderSummary> {
    return this.run(tx, async (ex) => {
      const { rows } = await ex.query<OrderDbRow>(
        `UPDATE credit_orders SET status = 'cancelled'
          WHERE id = $1 AND user_id = $2 AND status = 'pending'
          RETURNING ${COLUMNS}`,
        [orderId, userId],
      );

      // A cancel writes no ledger row: a pending order never credited anything, so there
      // is nothing to reverse.
      if (rows[0]) return toSummary(rows[0]);

      // Nothing updated. Distinguish "not yours / not there" from "already moved on",
      // but only within this user's own rows — a 403 would confirm the id exists.
      const { rows: found } = await ex.query<{ status: OrderStatus }>(
        `SELECT status FROM credit_orders WHERE id = $1 AND user_id = $2`,
        [orderId, userId],
      );
      if (!found[0]) throw new OrderNotFoundError('No such order');
      throw new OrderNotPendingError(`Order is ${found[0].status}`);
    });
  }

  // ---- CreditAdminPort ----

  async listOrders(
    status: OrderStatus | null,
    limit: number,
    tx: Executor = this.pool,
  ): Promise<OwnerOrder[]> {
    const { rows } = await tx.query<OrderDbRow & { user_id: string; email: string }>(
      `SELECT o.${COLUMNS.split(', ').join(', o.')}, o.user_id, u.email
         FROM credit_orders o
         JOIN users u ON u.id = o.user_id
        WHERE $1::text IS NULL OR o.status = $1
        ORDER BY o.created_at ASC
        LIMIT $2`,
      [status, limit],
    );
    return rows.map((row) => ({ ...toSummary(row), userId: row.user_id, userEmail: row.email }));
  }

  /**
   * Addendum A §A4: atomic, and idempotent. Two independent guards on purpose —
   * `FOR UPDATE` serialises two sequential confirms, and the partial unique index on
   * `(order_id) WHERE type = 'purchase'` catches a genuine race by rolling the whole
   * transaction back.
   */
  async confirmOrder(orderId: string, ownerId: string, tx?: Executor): Promise<ConfirmResult> {
    try {
      return await this.run(tx, async (ex) => {
        const { rows } = await ex.query<OrderDbRow & { user_id: string }>(
          `SELECT ${COLUMNS}, user_id FROM credit_orders WHERE id = $1 FOR UPDATE`,
          [orderId],
        );
        const order = rows[0];
        if (!order) throw new OrderNotFoundError('No such order');

        if (order.status === 'paid') {
          return { order: toSummary(order), credited: 0, alreadyPaid: true };
        }
        if (order.status !== 'pending') {
          throw new OrderNotPendingError(`Order is ${order.status}`);
        }

        const { rows: updated } = await ex.query<OrderDbRow>(
          `UPDATE credit_orders
              SET status = 'paid', confirmed_at = now(), confirmed_by = $2
            WHERE id = $1 AND status = 'pending'
            RETURNING ${COLUMNS}`,
          [orderId, ownerId],
        );

        await this.accounts.credit(
          order.user_id,
          order.credits,
          'purchase',
          { orderId },
          ex,
        );

        return { order: toSummary(updated[0]), credited: order.credits, alreadyPaid: false };
      });
    } catch (error) {
      // The unique index fired: another transaction credited this order first. Its work
      // stands and ours rolled back entirely, which is the correct outcome — not an error
      // to report to the owner.
      if (isUniqueViolation(error)) return this.readAsAlreadyPaid(orderId);
      throw error;
    }
  }

  private async readAsAlreadyPaid(orderId: string): Promise<ConfirmResult> {
    const { rows } = await this.pool.query<OrderDbRow>(
      `SELECT ${COLUMNS} FROM credit_orders WHERE id = $1`,
      [orderId],
    );
    if (!rows[0]) throw new OrderNotFoundError('No such order');
    return { order: toSummary(rows[0]), credited: 0, alreadyPaid: true };
  }

  async rejectOrder(
    orderId: string,
    ownerId: string,
    reason: string,
    tx?: Executor,
  ): Promise<CreditOrderSummary> {
    return this.run(tx, async (ex) => {
      const { rows } = await ex.query<OrderDbRow>(
        `UPDATE credit_orders
            SET status = 'rejected', rejection_reason = $3, confirmed_by = $2
          WHERE id = $1 AND status = 'pending'
          RETURNING ${COLUMNS}`,
        [orderId, ownerId, reason],
      );

      // No ledger row: a rejected order never credited anything.
      if (rows[0]) return toSummary(rows[0]);

      const { rows: found } = await ex.query<{ status: OrderStatus }>(
        `SELECT status FROM credit_orders WHERE id = $1`,
        [orderId],
      );
      if (!found[0]) throw new OrderNotFoundError('No such order');
      throw new OrderNotPendingError(`Order is ${found[0].status}`);
    });
  }

  /** D-010's pilot credits and D-020's goodwill credits are the same operation. */
  grant(input: GrantInput, tx?: Executor): Promise<CreditBalance> {
    return this.accounts.credit(
      input.userId,
      input.credits,
      'owner_grant',
      { note: input.note },
      tx,
    );
  }

  setPack(packId: string, edit: PackEdit, tx: Executor = this.pool): Promise<AdminPack> {
    return this.packs.setPack(packId, edit, tx);
  }

  /** A support view, not an export: no session token, no project, no photo. */
  async listUsers(limit: number, tx: Executor = this.pool): Promise<OwnerUser[]> {
    const { rows } = await tx.query<{
      id: string;
      email: string;
      role: string;
      created_at: Date;
      available: number | null;
      reserved: number | null;
    }>(
      `SELECT u.id, u.email, u.role, u.created_at,
              a.available, a.reserved
         FROM users u
         LEFT JOIN credit_accounts a ON a.user_id = u.id
        ORDER BY u.created_at DESC
        LIMIT $1`,
      [limit],
    );

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      createdAt: row.created_at.toISOString(),
      available: row.available ?? 0,
      reserved: row.reserved ?? 0,
    }));
  }
}

function toSummary(row: OrderDbRow | undefined): CreditOrderSummary {
  if (!row) throw new OrderNotFoundError('No such order');
  return {
    id: row.id,
    packId: row.pack_id,
    credits: row.credits,
    amountUzs: Number(row.amount_uzs),
    status: row.status,
    paymentMethod: row.payment_method,
    payerReference: row.payer_reference,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at.toISOString(),
    confirmedAt: row.confirmed_at?.toISOString() ?? null,
  };
}
