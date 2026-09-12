import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import { withTransaction, type Executor } from '../common/db/transaction';
import {
  GrantNoteRequiredError,
  LedgerInvariantError,
  NoCreditsError,
} from './public/credits.errors';
import type { CreditBalance, CreditLedgerPort, LedgerType } from './public/credits.port';

interface BalanceRow {
  available: number;
  reserved: number;
}

const ZERO: CreditBalance = { available: 0, reserved: 0 };

/**
 * Every method here changes `credit_accounts` and writes `credit_ledger` in one
 * transaction, or does neither. There is no path that touches one without the other.
 *
 * R-3: the balance is a row, not a SUM over the ledger, and a reserve is one atomic
 * `UPDATE … WHERE available >= 1`. That single statement is what makes two concurrent
 * reserves safe without a lock the application has to remember to take.
 */
@Injectable()
export class AccountsService implements CreditLedgerPort {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * A caller that passes `tx` is already in a transaction and must not open another —
   * a nested BEGIN would silently not be one. A caller that passes nothing gets its own.
   */
  private run<T>(tx: Executor | undefined, fn: (ex: Executor) => Promise<T>): Promise<T> {
    return tx ? fn(tx) : withTransaction(this.pool, fn);
  }

  /**
   * Zeros for a user with no row, and a read never creates one. D-010: a new account
   * starts at zero, and there is no starter grant anywhere in the code.
   */
  async getBalance(userId: string, tx: Executor = this.pool): Promise<CreditBalance> {
    const { rows } = await tx.query<BalanceRow>(
      `SELECT available, reserved FROM credit_accounts WHERE user_id = $1`,
      [userId],
    );
    const row = rows[0];
    return row ? { available: row.available, reserved: row.reserved } : ZERO;
  }

  /**
   * Lazily, and inside credits rather than at sign-in. R-7 is the reason: `auth` owns
   * `users` and must not write a credits table. A trigger would hide a money write in
   * the schema, where no test looks for it.
   */
  private async ensureAccount(userId: string, tx: Executor): Promise<void> {
    await tx.query(
      `INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    );
  }

  /** The shared `purchase` / `owner_grant` path. Both add to `available`. */
  async credit(
    userId: string,
    amount: number,
    type: Extract<LedgerType, 'purchase' | 'owner_grant'>,
    detail: { note?: string | null; orderId?: string | null },
    tx?: Executor,
  ): Promise<CreditBalance> {
    const note = detail.note?.trim() ?? null;

    // Checked here as well as by the CHECK constraint, so the seller-facing answer is
    // GRANT_NOTE_REQUIRED rather than a raw constraint violation surfacing as a 500.
    if (type === 'owner_grant' && !note) {
      throw new GrantNoteRequiredError('An owner grant needs a note');
    }

    return this.run(tx, async (ex) => {
      await this.ensureAccount(userId, ex);

      const { rows } = await ex.query<BalanceRow>(
        `UPDATE credit_accounts
            SET available = available + $2, updated_at = now()
          WHERE user_id = $1
          RETURNING available, reserved`,
        [userId, amount],
      );

      await ex.query(
        `INSERT INTO credit_ledger (user_id, type, amount, order_id, note)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, type, amount, detail.orderId ?? null, note],
      );

      return toBalance(rows[0]);
    });
  }

  /** Atomic. The guard is in the UPDATE, not in a SELECT before it (R-3). */
  async reserveOne(
    userId: string,
    generationId: string | null,
    tx?: Executor,
  ): Promise<CreditBalance> {
    return this.run(tx, async (ex) => {
      const { rows } = await ex.query<BalanceRow>(
        `UPDATE credit_accounts
            SET available = available - 1, reserved = reserved + 1, updated_at = now()
          WHERE user_id = $1 AND available >= 1
          RETURNING available, reserved`,
        [userId],
      );

      // No row means no credit. Not a database error — a business answer, and the reserve
      // must leave no trace at all (Addendum A §A5).
      if (rows.length === 0) throw new NoCreditsError('No credits available');

      await ex.query(
        `INSERT INTO credit_ledger (user_id, type, amount, generation_id)
         VALUES ($1, 'reserve', 1, $2)`,
        [userId, generationId],
      );

      return toBalance(rows[0]);
    });
  }

  /** A package was saved. The reserved credit is spent for good. */
  async debit(
    userId: string,
    generationId: string | null,
    tx?: Executor,
  ): Promise<CreditBalance> {
    return this.consumeReservation(userId, generationId, 'debit', tx);
  }

  /** D-020: a failed, refused or needs-input job gives the credit back. */
  async release(
    userId: string,
    generationId: string | null,
    tx?: Executor,
  ): Promise<CreditBalance> {
    return this.consumeReservation(userId, generationId, 'release', tx);
  }

  private async consumeReservation(
    userId: string,
    generationId: string | null,
    type: Extract<LedgerType, 'debit' | 'release'>,
    tx?: Executor,
  ): Promise<CreditBalance> {
    const giveBack = type === 'release' ? 1 : 0;

    return this.run(tx, async (ex) => {
      const { rows } = await ex.query<BalanceRow>(
        `UPDATE credit_accounts
            SET reserved = reserved - 1, available = available + $2, updated_at = now()
          WHERE user_id = $1 AND reserved >= 1
          RETURNING available, reserved`,
        [userId, giveBack],
      );

      // A seller cannot cause this: it means we debited something we never reserved.
      if (rows.length === 0) {
        throw new LedgerInvariantError(`${type} with no reservation for user ${userId}`);
      }

      await ex.query(
        `INSERT INTO credit_ledger (user_id, type, amount, generation_id)
         VALUES ($1, $2, 1, $3)`,
        [userId, type, generationId],
      );

      return toBalance(rows[0]);
    });
  }
}

function toBalance(row: BalanceRow | undefined): CreditBalance {
  if (!row) throw new LedgerInvariantError('A balance update returned no row');
  return { available: row.available, reserved: row.reserved };
}
