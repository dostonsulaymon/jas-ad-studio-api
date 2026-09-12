import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/db/database.module';
import { ApiErrorFilter } from './common/filters/api-error.filter';
import { LoggerModule } from './common/logger/logger.module';
import { RedisModule } from './common/redis/redis.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ConfigModule, LoggerModule, DatabaseModule, RedisModule, HealthModule],
  providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule {}
