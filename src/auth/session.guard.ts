import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { SessionExpiredError } from './auth.errors';
import { SESSION_COOKIE, type CurrentUser } from './public/auth.port';
import { SessionService } from './session.service';

export interface RequestWithUser {
  headers: Record<string, string | undefined>;
  user?: CurrentUser;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);

    // Spec §9: one code for both cases. "No cookie" and "dead cookie" look the same to a
    // seller — they signed out or timed out — and telling them apart helps nobody but an
    // attacker probing for valid session names.
    if (!token) throw new SessionExpiredError('No session cookie');

    const user = await this.sessions.resolve(token);
    if (!user) throw new SessionExpiredError('Session is unknown or expired');

    request.user = user;
    return true;
  }
}

/**
 * One header, split once. cookie-parser would add a dependency and a global middleware to
 * do exactly this.
 *
 * Splits on the FIRST '=' only, because a base64url token can contain none but a future
 * cookie value might.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }

  return null;
}
