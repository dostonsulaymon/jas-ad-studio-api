import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import { SESSION_TTL_DAYS, type CurrentUser, type UserRole } from './public/auth.port';

@Injectable()
export class SessionService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    // 256 bits of randomness. Guessing is not a threat model at this size.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.pool.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [hashToken(token), userId, expiresAt],
    );

    return { token, expiresAt };
  }

  async resolve(token: string): Promise<CurrentUser | null> {
    const { rows } = await this.pool.query<{
      id: string;
      email: string;
      role: UserRole;
      expired: boolean;
    }>(
      `SELECT u.id, u.email, u.role, s.expires_at <= now() AS expired
         FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1`,
      [hashToken(token)],
    );

    const row = rows[0];
    if (!row) return null;

    if (row.expired) {
      // Cleaned up on read. There is no scheduled sweeper yet and an expired row has no
      // remaining use, so the read that finds it is the cheapest place to remove it.
      await this.revoke(token);
      return null;
    }

    return { id: row.id, email: row.email, role: row.role };
  }

  async revoke(token: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
  }
}

/**
 * Plain SHA-256 rather than a password hash: the input is 256 bits of our own randomness,
 * so there is nothing to brute-force and no reason to pay bcrypt's cost on every request.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
