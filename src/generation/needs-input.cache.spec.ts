import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { ReferenceImage } from '../ai/public/provider.port';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { NeedsInputCache } from './needs-input.cache';

/** Source 01 §29. The key's shape is the whole security property here. */

let db: TestDatabase;
let cache: NeedsInputCache;
let alice: string;
let bob: string;
let project: string;

const photo = (name: string): ReferenceImage => ({
  bytes: Buffer.from(name),
  mimeType: 'image/jpeg',
});

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  cache = new NeedsInputCache(db.pool);

  const users = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz'),('b','b@x.uz') RETURNING id`,
  );
  alice = users.rows[0]?.id ?? '';
  bob = users.rows[1]?.id ?? '';

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO projects (user_id, name, description, goal, format_id, platform, aspect_ratio)
     VALUES ($1,'K','d','sales','product-film','instagram','9:16') RETURNING id`,
    [alice],
  );
  project = made.rows[0]?.id ?? '';
});

it('returns nothing for inputs it has never seen', async () => {
  expect(await cache.lookup(alice, project, [photo('a')])).toBeNull();
});

it('returns the same questions for the identical inputs', async () => {
  const images = [photo('a'), photo('b')];
  await cache.remember(
    alice,
    project,
    NeedsInputCache.key(alice, project, images),
    ['Rangi qanday?'],
    db.pool,
  );

  const hit = await cache.lookup(alice, project, images);
  expect(hit?.questionsUz).toEqual(['Rangi qanday?']);
});

it('ignores the order the photos arrive in', async () => {
  await cache.remember(
    alice,
    project,
    NeedsInputCache.key(alice, project, [photo('a'), photo('b')]),
    ['Rangi qanday?'],
    db.pool,
  );

  // The hashes are sorted, so re-uploading the same two photos the other way round must
  // not look like a new question and charge a fresh call.
  const hit = await cache.lookup(alice, project, [photo('b'), photo('a')]);
  expect(hit?.questionsUz).toEqual(['Rangi qanday?']);
});

it('treats an added photo as different inputs', async () => {
  await cache.remember(
    alice,
    project,
    NeedsInputCache.key(alice, project, [photo('a')]),
    ['Rangi qanday?'],
    db.pool,
  );

  expect(await cache.lookup(alice, project, [photo('a'), photo('b')])).toBeNull();
});

it("never serves one seller another's cached questions", async () => {
  const images = [photo('same-stock-photo')];
  await cache.remember(
    alice,
    project,
    NeedsInputCache.key(alice, project, images),
    ["Alisaning savoli"],
    db.pool,
  );

  // The user id is in the key precisely for this: two sellers with the same stock photo
  // must not share a row, or one seller's brief leaks into the other's answer.
  expect(await cache.lookup(bob, project, images)).toBeNull();
  expect(NeedsInputCache.key(alice, project, images)).not.toBe(
    NeedsInputCache.key(bob, project, images),
  );
});

it('counts misses for the cap, and a repeated question does not add to them', async () => {
  const key = NeedsInputCache.key(alice, project, [photo('a')]);
  await cache.remember(alice, project, key, ['Rangi?'], db.pool);
  await cache.remember(alice, project, key, ['Rangi?'], db.pool);

  // Re-remembering the same inputs upserts one row: answering the questions a seller was
  // asked must not count against them twice (§29's cap is on misses).
  expect(await cache.missesToday(project)).toBe(1);

  await cache.remember(
    alice,
    project,
    NeedsInputCache.key(alice, project, [photo('b')]),
    ['O‘lchami?'],
    db.pool,
  );
  expect(await cache.missesToday(project)).toBe(2);
});

it('does not count another project towards this project\'s cap', async () => {
  const other = await db.pool.query<{ id: string }>(
    `INSERT INTO projects (user_id, name, description, goal, format_id, platform, aspect_ratio)
     VALUES ($1,'Other','d','sales','product-film','instagram','9:16') RETURNING id`,
    [alice],
  );
  const otherId = other.rows[0]?.id ?? '';

  await cache.remember(
    alice,
    otherId,
    NeedsInputCache.key(alice, otherId, [photo('a')]),
    ['Rangi?'],
    db.pool,
  );

  expect(await cache.missesToday(project)).toBe(0);
  expect(await cache.missesToday(otherId)).toBe(1);
});
