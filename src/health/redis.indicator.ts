import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/tokens';
import type { ReadinessIndicator } from './health.types';

@Injectable()
export class RedisIndicator implements ReadinessIndicator {
  readonly name = 'redis';

  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async check(): Promise<void> {
    await this.client.ping();
  }
}
