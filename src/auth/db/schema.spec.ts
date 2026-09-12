import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../common/testing/database';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

beforeEach(async () => {
  await db.truncateAll();
});

afterAll(async () => {
  await db.drop();
});

it('refuses two users with the same google_sub', async () => {
  await db.pool.query("INSERT INTO users (google_sub, email) VALUES ('sub-1', 'a@b.com')");

  await expect(
    db.pool.query("INSERT INTO users (google_sub, email) VALUES ('sub-1', 'c@d.com')"),
  ).rejects.toThrow(/duplicate key/);
});

it("deletes a user's sessions with the user", async () => {
  const { rows } = await db.pool.query<{ id: string }>(
    "INSERT INTO users (google_sub, email) VALUES ('sub-2', 'a@b.com') RETURNING id",
  );
  const userId = rows[0]?.id;

  await db.pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h', $1, now() + interval '1 day')",
    [userId],
  );
  await db.pool.query('DELETE FROM users WHERE id = $1', [userId]);

  const left = await db.pool.query<{ count: string }>('SELECT count(*) FROM sessions');
  expect(left.rows[0]?.count).toBe('0');
});

it('defaults a new user to seller, never owner', async () => {
  const { rows } = await db.pool.query<{ role: string }>(
    "INSERT INTO users (google_sub, email) VALUES ('sub-3', 'a@b.com') RETURNING role",
  );

  expect(rows[0]?.role).toBe('seller');
});

it('refuses a role the application never issues', async () => {
  // Drizzle's enum is a TypeScript nicety and emits no constraint. P3 gates the money
  // endpoints on this column, so the database enforces it too.
  await expect(
    db.pool.query("INSERT INTO users (google_sub, email, role) VALUES ('sub-4', 'a@b.com', 'admin')"),
  ).rejects.toThrow(/users_role_check|check constraint/i);
});
