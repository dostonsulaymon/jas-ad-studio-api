import type { Pool } from 'pg';

interface DriftRow {
  user_id: string;
  available: number;
  reserved: number;
  led_available: number;
  led_reserved: number;
}

/**
 * The invariant every money test in P3 ends on: `credit_accounts` and `credit_ledger`
 * tell the same story.
 *
 *   available = Σ purchase + Σ owner_grant + Σ release − Σ reserve
 *   reserved  = Σ reserve  − Σ release     − Σ debit
 *
 * `amount` is always a positive magnitude and the `type` decides the direction, which is
 * why these are CASE expressions rather than a plain SUM.
 */
export async function assertLedgerMatchesAccounts(pool: Pool): Promise<void> {
  const { rows } = await pool.query<DriftRow>(
    `SELECT a.user_id, a.available, a.reserved, s.led_available, s.led_reserved
       FROM credit_accounts a
       JOIN (
         SELECT user_id,
                COALESCE(SUM(CASE type WHEN 'purchase'    THEN amount
                                       WHEN 'owner_grant' THEN amount
                                       WHEN 'release'     THEN amount
                                       WHEN 'reserve'     THEN -amount
                                       ELSE 0 END), 0) AS led_available,
                COALESCE(SUM(CASE type WHEN 'reserve' THEN amount
                                       WHEN 'release' THEN -amount
                                       WHEN 'debit'   THEN -amount
                                       ELSE 0 END), 0) AS led_reserved
           FROM credit_ledger
          GROUP BY user_id
       ) s ON s.user_id = a.user_id
      WHERE a.available <> s.led_available OR a.reserved <> s.led_reserved`,
  );

  if (rows.length > 0) {
    throw new Error(
      `credit_accounts disagrees with credit_ledger:\n${rows
        .map(
          (row) =>
            `  ${row.user_id}: account {available ${String(row.available)}, reserved ${String(row.reserved)}} ` +
            `vs ledger {available ${String(row.led_available)}, reserved ${String(row.led_reserved)}}`,
        )
        .join('\n')}`,
    );
  }
}

/** No account may ever be negative, whatever the ledger says. */
export async function assertNoNegativeBalances(pool: Pool): Promise<void> {
  const { rows } = await pool.query(
    `SELECT user_id FROM credit_accounts WHERE available < 0 OR reserved < 0`,
  );
  if (rows.length > 0) {
    throw new Error(`negative balances exist: ${JSON.stringify(rows)}`);
  }
}
