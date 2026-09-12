import { randomBytes } from 'node:crypto';
import { Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiNoContentResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { CurrentUserDto } from './auth.dto';
import type { CookieOptions, Response } from 'express';
import { GOOGLE_CONFIG, WEB_ORIGIN } from './auth.tokens';
import { User } from './public/current-user.decorator';
import {
  buildAuthorizeUrl,
  exchangeCode,
  GoogleAuthError,
  OAuthStateError,
  type GoogleConfig,
} from './google.client';
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
  @ApiOperation({
    summary: 'Start Google sign-in. Open this in a browser, not from this page.',
    description:
      'Redirects to Google. It cannot be driven from Swagger — the consent screen needs a' +
      ' real browser navigation. Once signed in, the session cookie is set on this origin' +
      ' and every route below works from here.',
  })
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
  @ApiOperation({
    summary: "Google's redirect target. Not called directly.",
    description: 'A missing or stale state is 400 OAUTH_STATE_INVALID; only a genuine' +
      ' provider failure is 502 AUTH_PROVIDER_FAILED (D-067).',
  })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    const google = this.requireGoogle();

    const expected = readCookie(request.headers.cookie, STATE_COOKIE);
    if (!code || !state || !expected || state !== expected) {
      throw new OAuthStateError('OAuth state did not match');
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
  @ApiOperation({ summary: 'Revoke the session immediately, server-side.' })
  @ApiNoContentResponse()
  async logout(@Req() request: RequestWithUser, @Res() response: Response): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) await this.sessions.revoke(token);

    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.status(204).send();
  }

  @Get('me')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'The signed-in user. The role comes from OWNER_EMAILS (D-037).' })
  @ApiOkResponse({ type: CurrentUserDto })
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
