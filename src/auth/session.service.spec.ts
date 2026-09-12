import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { SessionService } from './session.service';

let db: TestDatabase;
let service: SessionService;
let userId: string;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  service = new SessionService(db.pool);

  const { rows } = await db.pool.query<{ id: string }>(
    "INSERT INTO users (google_sub, email) VALUES ('s', 'a@b.com') RETURNING id",
  );
  userId = rows[0]?.id ?? '';
});

it('never stores the raw token', async () => {
  const { token } = await service.issue(userId);

  const { rows } = await db.pool.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
  expect(rows[0]?.token_hash).not.toBe(token);
  expect(rows[0]?.token_hash).toHaveLength(64);
});

it('issues a token long enough that guessing is not a threat', async () => {
  const { token } = await service.issue(userId);

  // 32 random bytes in base64url.
  expect(token.length).toBeGreaterThanOrEqual(43);
});

it('issues two different tokens for two sign-ins', async () => {
  const first = await service.issue(userId);
  const second = await service.issue(userId);

  expect(first.token).not.toBe(second.token);
});

it('resolves a live session to its user', async () => {
  const { token } = await service.issue(userId);

  await expect(service.resolve(token)).resolves.toMatchObject({
    id: userId,
    email: 'a@b.com',
    role: 'seller',
  });
});

it('resolves an unknown token to null rather than throwing', async () => {
  await expect(service.resolve('nonsense')).resolves.toBeNull();
});

it('refuses an expired session and cleans the row up', async () => {
  const { token } = await service.issue(userId);
  await db.pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'");

  await expect(service.resolve(token)).resolves.toBeNull();

  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM sessions');
  expect(rows[0]?.count).toBe('0');
});

it('revoke makes the token stop working immediately', async () => {
  const { token } = await service.issue(userId);
  await service.revoke(token);

  await expect(service.resolve(token)).resolves.toBeNull();
});

it('revoking one session leaves the other sessions alone', async () => {
  const first = await service.issue(userId);
  const second = await service.issue(userId);

  await service.revoke(first.token);

  await expect(service.resolve(second.token)).resolves.toMatchObject({ id: userId });
});

it('reports an expiry about thirty days out', async () => {
  const { expiresAt } = await service.issue(userId);
  const days = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);

  expect(days).toBeGreaterThan(29.9);
  expect(days).toBeLessThan(30.1);
});
