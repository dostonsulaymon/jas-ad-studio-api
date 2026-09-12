import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { PostgresIndicator } from './postgres.indicator';
import { RedisIndicator } from './redis.indicator';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  READINESS_INDICATORS,
  type ReadinessIndicator,
} from './health.types';

@Module({
  controllers: [HealthController],
  providers: [
    HealthService,
    PostgresIndicator,
    RedisIndicator,
    {
      provide: READINESS_INDICATORS,
      inject: [PostgresIndicator, RedisIndicator],
      useFactory: (postgres: PostgresIndicator, redis: RedisIndicator): ReadinessIndicator[] => [
        postgres,
        redis,
      ],
    },
    {
      provide: HEALTH_CHECK_TIMEOUT_MS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): number =>
        config.get('HEALTH_CHECK_TIMEOUT_MS', { infer: true }),
    },
  ],
})
export class HealthModule {}
