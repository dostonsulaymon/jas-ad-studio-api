import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { ProjectNotFoundError, ProjectsService, type ProjectInput } from './projects.service';

let db: TestDatabase;
let service: ProjectsService;
let alice: string;
let bob: string;

const input: ProjectInput = {
  productName: 'Krossovka',
  description: 'Bej rangli trikotaj krossovka',
  goal: 'sales',
  formatId: 'product-film',
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 10,
  audience: null,
  offer: null,
  confirmedClaims: [],
  galleryInspirationId: null,
};

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  service = new ProjectsService(db.pool);

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz'),('b','b@x.uz') RETURNING id`,
  );
  alice = made.rows[0]?.id ?? '';
  bob = made.rows[1]?.id ?? '';
});

it('creates a project owned by its creator', async () => {
  const project = await service.create(alice, input);

  expect(project.formatId).toBe('product-film');
  expect(project.name).toBe('Krossovka');
  await expect(service.getOwned(alice, project.id)).resolves.toMatchObject({ id: project.id });
});

it('defaults the duration to 10 seconds when the brief omits it', async () => {
  const project = await service.create(alice, { ...input, durationSeconds: 10 });

  expect(project.durationSeconds).toBe(10);
});

it("hides Bob's project from Alice as not found, not as forbidden", async () => {
  const bobs = await service.create(bob, input);

  // 404 rather than 403: a 403 confirms the id exists, which leaks Bob's data.
  await expect(service.getOwned(alice, bobs.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
});

it("never lists another user's projects", async () => {
  await service.create(bob, input);

  await expect(service.listFor(alice)).resolves.toEqual([]);
});

it('lists only the requesting user, newest first', async () => {
  const first = await service.create(alice, { ...input, productName: 'Birinchi' });
  const second = await service.create(alice, { ...input, productName: 'Ikkinchi' });
  await service.create(bob, input);

  const listed = await service.listFor(alice);
  expect(listed.map((p) => p.id)).toEqual([second.id, first.id]);
});

it('refuses to update a project Alice does not own', async () => {
  const bobs = await service.create(bob, input);

  await expect(
    service.update(alice, bobs.id, { ...input, productName: 'Hijacked' }),
  ).rejects.toBeInstanceOf(ProjectNotFoundError);

  await expect(service.getOwned(bob, bobs.id)).resolves.toMatchObject({ name: 'Krossovka' });
});

it('updates a project the user owns', async () => {
  const project = await service.create(alice, input);

  const updated = await service.update(alice, project.id, { ...input, productName: 'Yangi nom' });
  expect(updated.name).toBe('Yangi nom');
});

it('refuses to delete a project Alice does not own', async () => {
  const bobs = await service.create(bob, input);

  await expect(service.softDelete(alice, bobs.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
  await expect(service.getOwned(bob, bobs.id)).resolves.toBeTruthy();
});

it('hides a soft-deleted project from its own owner', async () => {
  const project = await service.create(alice, input);
  await service.softDelete(alice, project.id);

  await expect(service.getOwned(alice, project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
  await expect(service.listFor(alice)).resolves.toEqual([]);
});

it('refuses to delete the same project twice', async () => {
  const project = await service.create(alice, input);
  await service.softDelete(alice, project.id);

  await expect(service.softDelete(alice, project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
});

it('treats a well-formed but unknown id as not found rather than erroring', async () => {
  await expect(
    service.getOwned(alice, '00000000-0000-0000-0000-000000000000'),
  ).rejects.toBeInstanceOf(ProjectNotFoundError);
});

it('treats a malformed id as not found rather than leaking a database error', async () => {
  // Postgres raises 22P02 on a bad uuid. A seller must see the same 404 as any other
  // miss, and the caller must never see a driver message.
  await expect(service.getOwned(alice, 'not-a-uuid')).rejects.toBeInstanceOf(ProjectNotFoundError);
});
