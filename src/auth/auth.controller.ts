import { randomBytes } from 'node:crypto';
import { Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { GOOGLE_CONFIG, WEB_ORIGIN } from './auth.tokens';
import { User } from './public/current-user.decorator';
import { buildAuthorizeUrl, exchangeCode, GoogleAuthError, type GoogleConfig } from './google.client';
import { SESSION_COOKIE, SESSION_TTL_DAYS, type CurrentUser } from './public/auth.port';
import { readCookie, SessionGuard, type RequestWithUser } from './public/session.guard';
import { SessionService } from './session.service';
import { UserService } from './user.service';

const STATE_COOKIE = 'jas_oauth_state';
const STATE_TTL_MS = 10 * 60 * 1000;
const STATE_PATH = '/api/auth';

@Controller()
export class AuthController {
  constructor(
    @Inject(GOOGLE_CONFIG) private readonly google: GoogleConfig | null,
    @Inject(WEB_ORIGIN) private readonly webOrigin: string,
    private readonly sessions: SessionService,
    private readonly users: UserService,
  ) {}

  @Get('auth/google')
  start(@Res() response: Response): void {
    const google = this.requireGoogle();

    // The state parameter is what stops an attacker feeding us their own authorization
    // code. It lives in a short httpOnly cookie, so only this browser can complete it.
    const state = randomBytes(16).toString('base64url');

    response.cookie(STATE_COOKIE, state, {
      ...this.cookieOptions(),
      maxAge: STATE_TTL_MS,
      path: STATE_PATH,
    });
    response.redirect(buildAuthorizeUrl(google, state));
  }

  @Get('auth/google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const google = this.requireGoogle();

    const expected = readCookie(request.headers.cookie, STATE_COOKIE);
    if (!code || !state || !expected || state !== expected) {
      throw new GoogleAuthError('OAuth state did not match');
    }
    response.clearCookie(STATE_COOKIE, { path: STATE_PATH });

    const identity = await exchangeCode(google, code);
    const user = await this.users.upsertFromGoogle(identity);
    const { token } = await this.sessions.issue(user.id);

    response.cookie(SESSION_COOKIE, token, {
      ...this.cookieOptions(),
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });
    response.redirect(this.webOrigin);
  }

  @Post('auth/logout')
  @UseGuards(SessionGuard)
  async logout(@Req() request: RequestWithUser, @Res() response: Response): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) await this.sessions.revoke(token);

    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.status(204).send();
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@User() user: CurrentUser): CurrentUser {
    return user;
  }

  private requireGoogle(): GoogleConfig {
    // D-061: the keys are optional at boot so CI starts without them. This is the point
    // of use, where their absence becomes a failed sign-in rather than a failed process.
    if (!this.google) throw new GoogleAuthError('Google sign-in is not configured');
    return this.google;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      // Lax rather than Strict: the Google callback is a cross-site GET back into our
      // origin, and Strict would drop the cookie exactly then.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    };
  }
}
