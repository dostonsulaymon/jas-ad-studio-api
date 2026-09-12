import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import { OWNER_EMAILS } from './auth.tokens';
import type { GoogleIdentity } from './google.client';
import type { CurrentUser, UserRole } from './public/auth.port';

@Injectable()
export class UserService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(OWNER_EMAILS) private readonly ownerEmails: string[],
  ) {}

  /**
   * Keyed on google_sub, not email: a seller can change their Google address and must
   * stay the same user, with the same projects and the same credits.
   *
   * The role is recomputed on every sign-in so OWNER_EMAILS stays the single source of
   * truth (D-037) — taking an address out of the allowlist actually takes the power away,
   * rather than leaving an owner row behind.
   */
  async upsertFromGoogle(identity: GoogleIdentity): Promise<CurrentUser> {
    const role: UserRole = this.ownerEmails.includes(identity.email) ? 'owner' : 'seller';

    const { rows } = await this.pool.query<{ id: string; email: string; role: UserRole }>(
      `INSERT INTO users (google_sub, email, name, role)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_sub)
       DO UPDATE SET email = EXCLUDED.email,
                     name  = EXCLUDED.name,
                     role  = EXCLUDED.role
         RETURNING id, email, role`,
      [identity.sub, identity.email, identity.name, role],
    );

    const row = rows[0];
    if (!row) throw new Error('User upsert returned no row');

    return row;
  }
}
