import type { Pool, PoolClient } from 'pg';

/**
 * Anything that can run a statement.
 *
 * Money methods take one of these rather than reaching for their own pool, so a caller in
 * another module can enlist them in a transaction it already owns. Two callers need that:
 * the owner endpoints write their audit row in the same transaction as the credit move,
 * and P4's POST /generations must reserve a credit and insert the generation row, or
 * neither.
 *
 * `Pick<Pool, 'query'>` rather than `Pool | PoolClient`: the union's overloads do not
 * collapse into one callable signature, so every call site would need a cast.
 */
export type Executor = Pick<Pool, 'query'>;

/** Postgres unique-violation. The only way to tell "already credited" from a real failure. */
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === UNIQUE_VIOLATION
  );
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // A failed ROLLBACK must not mask the error that caused it.
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the original error is the one worth reporting */
    }
    throw error;
  } finally {
    client.release();
  }
}
