import { defineConfig } from 'drizzle-kit';

// Schemas stay per module (R-7); migrations land in one ordered folder so cross-module
// foreign keys can be enforced by the database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/*/db/schema.ts',
  out: './drizzle/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
  },
});
