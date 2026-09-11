import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../config/env.schema';
import { REDIS_CLIENT } from './tokens';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService, PinoLogger],
      useFactory: (config: ConfigService<Env, true>, logger: PinoLogger): Redis => {
        logger.setContext(RedisModule.name);

        const client = new Redis(config.get('REDIS_URL', { infer: true }), {
          // BullMQ requires this: its blocking commands must not be aborted by
          // ioredis' own retry limit, or workers stall (D-030).
          maxRetriesPerRequest: null,
        });

        // Same reasoning as the pg pool: an unhandled 'error' event would take the
        // process down during exactly the outage readiness exists to report.
        client.on('error', (error: Error) => {
          logger.error({ err: error }, 'Redis connection error');
        });

        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}
