import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SessionExpiredError } from './auth.errors';
import { readCookie, SessionGuard, type RequestWithUser } from './session.guard';
import type { SessionResolver } from './auth.port';

describe('readCookie', () => {
  it('finds a cookie among several', () => {
    expect(readCookie('a=1; jas_session=tok; b=2', 'jas_session')).toBe('tok');
  });

  it('returns null when the header is absent', () => {
    expect(readCookie(undefined, 'jas_session')).toBeNull();
  });

  it('returns null when the cookie is absent', () => {
    expect(readCookie('a=1; b=2', 'jas_session')).toBeNull();
  });

  it('does not match a cookie whose name merely ends with the target', () => {
    expect(readCookie('evil_jas_session=bad', 'jas_session')).toBeNull();
  });

  it('decodes a percent-encoded value', () => {
    expect(readCookie('jas_session=a%2Bb', 'jas_session')).toBe('a+b');
  });

  it('handles a value containing an equals sign', () => {
    expect(readCookie('jas_session=abc=def', 'jas_session')).toBe('abc=def');
  });
});

describe('SessionGuard', () => {
  function context(cookie?: string): ExecutionContext {
    const request: RequestWithUser = { headers: cookie ? { cookie } : {} };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  it('refuses a request with no cookie', async () => {
    const sessions = { resolve: vi.fn() } as unknown as SessionResolver;
    await expect(new SessionGuard(sessions).canActivate(context())).rejects.toBeInstanceOf(
      SessionExpiredError,
    );
  });

  it('refuses a cookie the session service does not recognise', async () => {
    const sessions = { resolve: vi.fn().mockResolvedValue(null) } as unknown as SessionResolver;
    await expect(
      new SessionGuard(sessions).canActivate(context('jas_session=stale')),
    ).rejects.toBeInstanceOf(SessionExpiredError);
  });

  it('attaches the user to the request on success', async () => {
    const user = { id: 'u1', email: 'a@b.uz', role: 'seller' as const };
    const sessions = { resolve: vi.fn().mockResolvedValue(user) } as unknown as SessionResolver;
    const ctx = context('jas_session=good');

    await expect(new SessionGuard(sessions).canActivate(ctx)).resolves.toBe(true);
    expect(ctx.switchToHttp().getRequest<RequestWithUser>().user).toEqual(user);
  });
});
