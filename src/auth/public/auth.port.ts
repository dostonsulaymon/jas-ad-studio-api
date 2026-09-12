/**
 * The auth module's only export to other modules (R-7). Types and constants, no
 * implementation and no database access.
 */

export type UserRole = 'seller' | 'owner';

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

/**
 * D-036: an opaque id in an httpOnly cookie, never a JWT, so a session can be revoked
 * the instant a seller logs out or an account is banned.
 */
export const SESSION_COOKIE = 'jas_session';
export const SESSION_TTL_DAYS = 30;
