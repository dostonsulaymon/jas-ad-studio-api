import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import { PG_POOL } from './tokens';

/**
 * Arbitrary but fixed. Any process running migrations takes this same lock, so `api`
 * and `worker` booting together serialise instead of racing.
 */
const MIGRATION_LOCK_KEY = 7_314_902;

const MIGRATIONS_FOLDER = join(process.cwd(), 'drizzle', 'migrations');
const JOURNAL = join(MIGRATIONS_FOLDER, 'meta', '_journal.json');

@Injectable()
export class MigrationRunner implements OnApplicationBootstrap {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MigrationRunner.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    // P0 declares no tables yet, so there is no journal to apply. drizzle's migrate()
    // throws on a missing folder, which would make an empty schema look like a broken
    // deployment. From P2 this branch stops being taken.
    if (!existsSync(JOURNAL)) {
      this.logger.info({ folder: MIGRATIONS_FOLDER }, 'No migrations to apply');
      return;
    }

    const client = await this.pool.connect();

    try {
      // Blocks until whoever else is migrating finishes, rather than failing.
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);

      const startedAt = Date.now();
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });

      this.logger.info({ durationMs: Date.now() - startedAt }, 'Migrations up to date');
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
      client.release();
    }
  }
}
