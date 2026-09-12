/**
 * The auth module's public contract (R-7). Types, tokens, and the guard other modules
 * put on their routes — never an implementation and never a database query.
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

/** What the guard needs from the session store. SessionService implements it. */
export const SESSION_RESOLVER = Symbol('SESSION_RESOLVER');

export interface SessionResolver {
  resolve(token: string): Promise<CurrentUser | null>;
}
