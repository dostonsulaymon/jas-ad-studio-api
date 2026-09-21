import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { GalleryMediaStore } from './gallery.media-store';
import { GalleryRepo, type GalleryExampleInput } from './gallery.repo';
import { GalleryService } from './gallery.service';
import { GalleryExampleNotFoundError } from './public/gallery.errors';

/**
 * Against a real Postgres, not a faked repository (R-4's argument, applied here because
 * since D-090 the SQL *is* the thing that could be wrong). A fake repo would prove the
 * mapping and nothing about the query that decides what a signed-out visitor sees.
 */

let db: TestDatabase;
let repo: GalleryRepo;
let gallery: GalleryService;
let ownerId: string;

const preset = {
  environment: 'clean seamless backdrop',
  lighting: 'soft key with controlled falloff',
  cameraLanguage: 'slow orbit, one dominant move per beat',
  pacing: 'restrained',
  mood: 'composed and premium',
};

const example = (patch: Partial<GalleryExampleInput> = {}): GalleryExampleInput => ({
  slug: 'live',
  titleUz: 'Tirik namuna',
  category: 'parfyum',
  style: 'product-film',
  videoPath: 'ab/cd.mp4',
  posterPath: 'ab/cd.jpg',
  referencePhotoPath: null,
  aspectRatio: '9:16',
  durationSeconds: 10,
  promptEn: 'A 250 ml bottle of Nocturne by Maison Verre, priced 450000 som.',
  conceptUz: 'Konsepsiya matni.',
  creativePreset: preset,
  sourceType: 'app-prompt',
  sourceNote: 'Namuna.',
  promptAccess: 'free',
  flowModel: 'Veo 3.1',
  flowMode: 'Frames to video',
  isPublished: true,
  sortOrder: 1,
  ...patch,
});

beforeAll(async () => {
  db = await createTestDatabase();
  repo = new GalleryRepo(db.pool);
  gallery = new GalleryService(
    repo,
    // This suite is about the query and the resolution boundary; nothing here uploads.
    new GalleryMediaStore({ get: () => mkdtempSync(join(tmpdir(), 'jas-gallery-')) } as never),
    // Nobody in this suite has PRO, which is the interesting half: a locked prompt is refused.
    {
      hasPro: () => Promise.resolve(false),
      status: () => Promise.resolve({ hasPro: false, until: null }),
      grant: () => Promise.reject(new Error('this suite never grants')),
    },
  );
}, 60_000);

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.truncateAll();
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email, role) VALUES ('o','o@x.uz','owner') RETURNING id`,
  );
  ownerId = rows[0]?.id ?? '';

  await repo.insert(example({ sortOrder: 2 }), ownerId);
  await repo.insert(example({ slug: 'first', sortOrder: 1 }), ownerId);
  await repo.insert(
    example({
      slug: 'draft',
      isPublished: false,
      flowModel: null,
      flowMode: null,
      sourceNote: '',
      sortOrder: 3,
    }),
    ownerId,
  );
});

describe('the public list', () => {
  it('lists published examples in sort order', async () => {
    expect((await gallery.list()).map((card) => card.id)).toEqual(['first', 'live']);
  });

  it('never lists an unpublished example', async () => {
    expect((await gallery.list()).some((card) => card.id === 'draft')).toBe(false);
  });

  // §15: a prompt is 1,500-2,300 words and this page must stay fast on a phone.
  it('leaves the prompt out of every card', async () => {
    for (const card of await gallery.list()) {
      expect(card).not.toHaveProperty('promptEn');
    }
  });

  it('gives the client ready-made media URLs, not paths to assemble', async () => {
    const [first] = await gallery.list();
    expect(first?.videoUrl).toBe('/api/gallery/media/ab/cd.mp4');
    expect(first?.posterUrl).toBe('/api/gallery/media/ab/cd.jpg');
  });
});

describe('one example', () => {
  it('returns the prompt §12 reveals', async () => {
    expect((await gallery.get('live')).promptEn).toContain('Nocturne');
  });

  it('refuses an unknown slug', async () => {
    await expect(gallery.get('nope')).rejects.toBeInstanceOf(GalleryExampleNotFoundError);
  });

  it('refuses an unpublished slug exactly as it refuses an unknown one', async () => {
    await expect(gallery.get('draft')).rejects.toBeInstanceOf(GalleryExampleNotFoundError);
  });
});

describe('resolving an inspiration — the boundary the exit check is about', () => {
  it('returns exactly six keys, and never a seventh', async () => {
    expect(Object.keys((await gallery.resolveInspiration('live')) ?? {}).sort()).toEqual([
      'cameraLanguage',
      'environment',
      'id',
      'lighting',
      'mood',
      'pacing',
    ]);
  });

  it('carries the creative attributes and nothing else', async () => {
    expect(await gallery.resolveInspiration('live')).toEqual({ id: 'live', ...preset });
  });

  // The failure this guards against: a spread would carry promptEn, which names another
  // seller's product, its brand and its price.
  it('carries no product fact from the example it came from', async () => {
    const resolved = JSON.stringify(await gallery.resolveInspiration('live'));

    for (const fact of ['Nocturne', 'Maison Verre', '250 ml', '450000', 'Tirik namuna']) {
      expect(resolved).not.toContain(fact);
    }
  });

  it('resolves an unpublished example to null rather than to its attributes', async () => {
    expect(await gallery.resolveInspiration('draft')).toBeNull();
  });

  it('resolves an unknown id to null', async () => {
    expect(await gallery.resolveInspiration('nope')).toBeNull();
  });
});

describe('what a seller may select', () => {
  it('allows a published id', async () => {
    expect(await gallery.isSelectable('live')).toBe(true);
  });

  it('refuses an unpublished id', async () => {
    expect(await gallery.isSelectable('draft')).toBe(false);
  });

  it('refuses an unknown id', async () => {
    expect(await gallery.isSelectable('nope')).toBe(false);
  });
});

describe('the owner writes', () => {
  it('updates a row and reads the change back', async () => {
    const all = await repo.listAll();
    const draft = all.find((e) => e.slug === 'draft');
    if (!draft) throw new Error('fixture missing');

    const updated = await repo.update(
      draft.rowId,
      example({ slug: 'draft', titleUz: 'Endi chiqdi', sortOrder: 3 }),
      ownerId,
    );

    expect(updated?.titleUz).toBe('Endi chiqdi');
    expect((await gallery.list()).map((c) => c.id)).toContain('draft');
  });

  it('deletes a row, and says so when there was nothing to delete', async () => {
    const all = await repo.listAll();
    const live = all.find((e) => e.slug === 'live');
    if (!live) throw new Error('fixture missing');

    expect(await repo.remove(live.rowId)).toBe(true);
    expect(await repo.remove(live.rowId)).toBe(false);
    expect((await gallery.list()).map((c) => c.id)).toEqual(['first']);
  });

  it('refuses a duplicate slug at the database, not in application code', async () => {
    await expect(repo.insert(example({ slug: 'first' }), ownerId)).rejects.toThrow(
      /gallery_examples_slug_unique/,
    );
  });
});
