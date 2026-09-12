import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export interface TestDatabase {
  pool: Pool;
  url: string;
  truncateAll(): Promise<void>;
  drop(): Promise<void>;
}

const MIGRATIONS_FOLDER = join(process.cwd(), 'drizzle', 'migrations');

/**
 * R-4: money and job logic only reveal their races against a real Postgres.
 *
 * A database per run rather than per file: creating one costs about 200ms, and suites
 * that share a run share a schema but never rows, because each calls truncateAll().
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL must be set to create a test database');

  const name = `jas_test_${randomBytes(6).toString('hex')}`;

  // Connect to the maintenance database rather than the configured one: CREATE DATABASE
  // cannot run inside a transaction and cannot target the database you are connected to.
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.href });

  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(base);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.href });

  if (existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))) {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  }

  return {
    pool,
    url: url.href,

    async truncateAll(): Promise<void> {
      const { rows } = await pool.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
      );
      if (rows.length === 0) return;
      const list = rows.map((row) => `"${row.tablename}"`).join(', ');
      await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    },

    async drop(): Promise<void> {
      await pool.end();
      const cleanup = new Pool({ connectionString: adminUrl.href });
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
