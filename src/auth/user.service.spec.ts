import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import type { GoogleIdentity } from './google.client';
import { UserService } from './user.service';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
});

const identity: GoogleIdentity = {
  sub: 'g-1',
  email: 'seller@shop.uz',
  name: 'Seller',
  emailVerified: true,
};

it('creates a seller on first sign-in', async () => {
  const service = new UserService(db.pool, []);

  await expect(service.upsertFromGoogle(identity)).resolves.toMatchObject({
    email: 'seller@shop.uz',
    role: 'seller',
  });
});

it('gives the same user back on a second sign-in, not a duplicate', async () => {
  const service = new UserService(db.pool, []);

  const first = await service.upsertFromGoogle(identity);
  const second = await service.upsertFromGoogle(identity);

  expect(second.id).toBe(first.id);
  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM users');
  expect(rows[0]?.count).toBe('1');
});

it('promotes an allowlisted email to owner', async () => {
  const service = new UserService(db.pool, ['seller@shop.uz']);

  await expect(service.upsertFromGoogle(identity)).resolves.toMatchObject({ role: 'owner' });
});

it('demotes an owner whose email left the allowlist', async () => {
  await new UserService(db.pool, ['seller@shop.uz']).upsertFromGoogle(identity);

  // Recomputed on every sign-in, so removing an address actually removes the power.
  const after = await new UserService(db.pool, []).upsertFromGoogle(identity);
  expect(after.role).toBe('seller');
});

it('follows the google_sub when the email changes, and creates no second user', async () => {
  const service = new UserService(db.pool, []);

  const first = await service.upsertFromGoogle(identity);
  const renamed = await service.upsertFromGoogle({ ...identity, email: 'new@shop.uz' });

  expect(renamed.id).toBe(first.id);
  expect(renamed.email).toBe('new@shop.uz');
  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM users');
  expect(rows[0]?.count).toBe('1');
});

it('does not promote someone whose email merely resembles an allowlisted one', async () => {
  const service = new UserService(db.pool, ['seller@shop.uz']);

  await expect(
    service.upsertFromGoogle({ ...identity, sub: 'g-2', email: 'seller@shop.uz.evil.com' }),
  ).resolves.toMatchObject({ role: 'seller' });
});

it('treats the allowlist case-insensitively, because Google addresses arrive lowercased', async () => {
  const service = new UserService(db.pool, ['seller@shop.uz']);

  await expect(service.upsertFromGoogle({ ...identity, email: 'seller@shop.uz' })).resolves.toMatchObject(
    { role: 'owner' },
  );
});
