import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { AuthController } from './auth.controller';
import { ALLOWED_ORIGINS, GOOGLE_CONFIG, OWNER_EMAILS, WEB_ORIGIN } from './auth.tokens';
import { CsrfGuard } from './csrf.guard';
import type { GoogleConfig } from './google.client';
import { OptionalSessionGuard, SessionGuard } from './public/session.guard';
import { SESSION_RESOLVER } from './public/auth.port';
import { SessionService } from './session.service';
import { UserService } from './user.service';

/**
 * Global so that every module can guard its routes with SessionGuard without importing
 * auth — a module-to-module import R-7 forbids, and rightly: a controller needing a
 * session should not gain access to the user table along the way.
 */
@Global()
@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    UserService,
    // The guard depends on this interface, never on SessionService directly.
    { provide: SESSION_RESOLVER, useExisting: SessionService },
    SessionGuard,
    OptionalSessionGuard,
    CsrfGuard,
    {
      provide: GOOGLE_CONFIG,
      inject: [ConfigService],
      // null rather than a half-built object: a partially configured client would fail
      // deep inside an HTTP call instead of at the one place that can say why (D-061).
      useFactory: (config: ConfigService<Env, true>): GoogleConfig | null => {
        const clientId = config.get('GOOGLE_CLIENT_ID', { infer: true });
        const clientSecret = config.get('GOOGLE_CLIENT_SECRET', { infer: true });
        if (!clientId || !clientSecret) return null;

        return {
          clientId,
          clientSecret,
          redirectUri: config.get('GOOGLE_REDIRECT_URI', { infer: true }),
        };
      },
    },
    {
      provide: OWNER_EMAILS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): string[] =>
        config.get('OWNER_EMAILS', { infer: true }),
    },
    {
      provide: WEB_ORIGIN,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): string =>
        config.get('WEB_ORIGIN', { infer: true }),
    },
    {
      provide: ALLOWED_ORIGINS,
      inject: [ConfigService],
      /**
       * D-032 puts the web app and the api behind one domain, so this is one origin in
       * production. In development the same app is reachable at both the tunnel domain
       * and localhost, and the guard matches exactly — so every additional address has
       * to be named, or writes from it are refused while reads succeed.
       *
       * Deduplicated: naming WEB_ORIGIN again in EXTRA_WEB_ORIGINS is a harmless thing
       * to do and should not produce a list with it twice.
       */
      useFactory: (config: ConfigService<Env, true>): string[] => [
        ...new Set([
          config.get('WEB_ORIGIN', { infer: true }),
          ...config.get('EXTRA_WEB_ORIGINS', { infer: true }),
        ]),
      ],
    },
  ],
  exports: [SessionService, SessionGuard, OptionalSessionGuard, SESSION_RESOLVER, ALLOWED_ORIGINS],
})
export class AuthModule {}
