import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import type { Env } from '../config/env.schema';
import { MigrationRunner } from './migration.runner';
import { PG_POOL } from './tokens';

/**
 * Owns the connection pool and nothing else. R-7 keeps this free of domain knowledge:
 * modules import the pool and bind their own schema to it, so common/ never learns what
 * a credit or a generation is.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService, PinoLogger],
      useFactory: (config: ConfigService<Env, true>, logger: PinoLogger): Pool => {
        logger.setContext(DatabaseModule.name);

        const pool = new Pool({
          connectionString: config.get('DATABASE_URL', { infer: true }),
        });

        // An idle client dropping — a database restart, a network blip — emits 'error'
        // on the pool. Unhandled, Node turns that into an uncaught exception and the
        // process dies, which defeats the point of a readiness check: the app must stay
        // up and report not_ready instead.
        pool.on('error', (error: Error) => {
          logger.error({ err: error }, 'Postgres pool error');
        });

        return pool;
      },
    },
    MigrationRunner,
  ],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
