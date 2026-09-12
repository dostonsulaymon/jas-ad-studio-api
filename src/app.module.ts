import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/db/database.module';
import { ApiErrorFilter } from './common/filters/api-error.filter';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { ALLOWED_ORIGINS } from './auth/auth.tokens';
import { CsrfGuard } from './auth/csrf.guard';

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, RedisModule, HealthModule, AuthModule, ProjectsModule],
  providers: [
    { provide: APP_FILTER, useClass: ApiErrorFilter },
    // Spec §10: every state-changing request is checked, so a new controller cannot
    // forget to opt in. Safe methods pass straight through.
    {
      provide: APP_GUARD,
      inject: [ALLOWED_ORIGINS],
      useFactory: (allowedOrigins: string[]): CsrfGuard => new CsrfGuard(allowedOrigins),
    },
  ],
})
export class AppModule {}
