import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { ProjectNotFoundError, ProjectsService, type ProjectInput } from '../projects/projects.service';
import { AssetNotFoundError, AssetsService, MAX_PHOTOS_PER_PROJECT } from './assets.service';
import { FileStorage } from './storage';

let db: TestDatabase;
let projects: ProjectsService;
let assets: AssetsService;
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

function jpeg(width = 800, height = 600): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c0ffee' } })
    .jpeg()
    .toBuffer();
}

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  projects = new ProjectsService(db.pool);
  assets = new AssetsService(
    db.pool,
    projects,
    new FileStorage(mkdtempSync(join(tmpdir(), 'jas-assets-'))),
  );

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz'),('b','b@x.uz') RETURNING id`,
  );
  alice = made.rows[0]?.id ?? '';
  bob = made.rows[1]?.id ?? '';
});

it('stores exactly two rows per upload and no original', async () => {
  const project = await projects.create(alice, input);
  await assets.upload(alice, project.id, await jpeg(3000, 2000));

  const { rows } = await db.pool.query<{ kind: string }>('SELECT kind FROM assets ORDER BY kind');
  expect(rows.map((r) => r.kind)).toEqual(['model_input', 'reference']);
});

it('records each row at the dimensions of the file it points at', async () => {
  const project = await projects.create(alice, input);
  const asset = await assets.upload(alice, project.id, await jpeg(3000, 2000));

  expect(asset.width).toBe(2048);
  expect(asset.height).toBe(1365);

  const { rows } = await db.pool.query<{ kind: string; width: number; height: number }>(
    'SELECT kind, width, height FROM assets ORDER BY kind',
  );
  expect(rows).toEqual([
    { kind: 'model_input', width: 1024, height: 683 },
    { kind: 'reference', width: 2048, height: 1365 },
  ]);
});

// Delete is soft, so the project row survives. The photo must not keep serving: the
// listing route already 404s, and two routes disagreeing about one asset is the bug.
it('stops serving a reference once its project is deleted', async () => {
  const project = await projects.create(alice, input);
  const asset = await assets.upload(alice, project.id, await jpeg());

  await expect(assets.readReference(alice, asset.id)).resolves.toMatchObject({
    contentType: 'image/jpeg',
  });

  await projects.softDelete(alice, project.id);

  await expect(assets.readReference(alice, asset.id)).rejects.toBeInstanceOf(AssetNotFoundError);
});

it('marks the first photo primary and later ones not', async () => {
  const project = await projects.create(alice, input);

  const first = await assets.upload(alice, project.id, await jpeg());
  const second = await assets.upload(alice, project.id, await jpeg());

  expect(first.isPrimary).toBe(true);
  expect(second.isPrimary).toBe(false);
});

it('rejects an upload to a project the user does not own, before decoding anything', async () => {
  const bobs = await projects.create(bob, input);

  await expect(assets.upload(alice, bobs.id, await jpeg())).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );

  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM assets');
  expect(rows[0]?.count).toBe('0');
});

it('refuses more than the per-project photo limit', async () => {
  const project = await projects.create(alice, input);

  for (let n = 0; n < MAX_PHOTOS_PER_PROJECT; n += 1) {
    await assets.upload(alice, project.id, await jpeg());
  }

  await expect(assets.upload(alice, project.id, await jpeg())).rejects.toMatchObject({
    code: 'TOO_MANY_PHOTOS',
  });
});

it("refuses to serve Bob's photo to Alice", async () => {
  const bobs = await projects.create(bob, input);
  const asset = await assets.upload(bob, bobs.id, await jpeg());

  await expect(assets.readReference(alice, asset.id)).rejects.toBeInstanceOf(AssetNotFoundError);
});

it('serves the reference copy to its owner as JPEG', async () => {
  const project = await projects.create(alice, input);
  const asset = await assets.upload(alice, project.id, await jpeg());

  const served = await assets.readReference(alice, asset.id);
  expect(served.contentType).toBe('image/jpeg');
  expect((await sharp(served.bytes).metadata()).format).toBe('jpeg');
});

it('never serves a model-input copy through the reference endpoint', async () => {
  const project = await projects.create(alice, input);
  await assets.upload(alice, project.id, await jpeg());

  const { rows } = await db.pool.query<{ id: string }>(
    "SELECT id FROM assets WHERE kind = 'model_input'",
  );

  await expect(assets.readReference(alice, rows[0]?.id ?? '')).rejects.toBeInstanceOf(
    AssetNotFoundError,
  );
});

it("refuses to list another user's project assets", async () => {
  const bobs = await projects.create(bob, input);
  await assets.upload(bob, bobs.id, await jpeg());

  await expect(assets.listFor(alice, bobs.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
});

it("refuses to delete Bob's asset, and leaves it intact", async () => {
  const bobs = await projects.create(bob, input);
  const asset = await assets.upload(bob, bobs.id, await jpeg());

  await expect(assets.delete(alice, asset.id)).rejects.toBeInstanceOf(AssetNotFoundError);
  await expect(assets.readReference(bob, asset.id)).resolves.toBeTruthy();
});

it('deletes both copies together, so no model-input copy outlives its reference', async () => {
  const project = await projects.create(alice, input);
  const asset = await assets.upload(alice, project.id, await jpeg());

  await assets.delete(alice, asset.id);

  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM assets');
  expect(rows[0]?.count).toBe('0');
});

it('deleting a project deletes its asset rows', async () => {
  const project = await projects.create(alice, input);
  await assets.upload(alice, project.id, await jpeg());

  await db.pool.query('DELETE FROM projects WHERE id = $1', [project.id]);

  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM assets');
  expect(rows[0]?.count).toBe('0');
});

it('treats a malformed asset id as not found rather than leaking a database error', async () => {
  await expect(assets.readReference(alice, 'not-a-uuid')).rejects.toBeInstanceOf(
    AssetNotFoundError,
  );
});

it('rejects a non-image without writing anything', async () => {
  const project = await projects.create(alice, input);

  // DAMAGED rather than TYPE: sharp cannot decode a PDF at all, so there is no format to
  // reject. UPLOAD_TYPE is for something sharp reads happily but we do not allow, which
  // is the GIF case in image.pipeline.spec.ts.
  await expect(
    assets.upload(alice, project.id, Buffer.from('%PDF-1.7 not an image')),
  ).rejects.toMatchObject({ code: 'UPLOAD_DAMAGED' });

  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM assets');
  expect(rows[0]?.count).toBe('0');
});
