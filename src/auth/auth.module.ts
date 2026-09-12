import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { AuthController } from './auth.controller';
import { ALLOWED_ORIGINS, GOOGLE_CONFIG, OWNER_EMAILS, WEB_ORIGIN } from './auth.tokens';
import { CsrfGuard } from './csrf.guard';
import type { GoogleConfig } from './google.client';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';
import { UserService } from './user.service';

@Module({
  controllers: [AuthController],
  providers: [
    SessionService,
    UserService,
    SessionGuard,
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
      // One origin today (D-032 puts the web app and the api behind one domain). A list
      // because dev and production differ, not because cross-origin is ever allowed.
      useFactory: (config: ConfigService<Env, true>): string[] => [
        config.get('WEB_ORIGIN', { infer: true }),
      ],
    },
  ],
  exports: [SessionService, SessionGuard, ALLOWED_ORIGINS],
})
export class AuthModule {}
