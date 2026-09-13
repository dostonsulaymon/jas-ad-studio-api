import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Env } from '../common/config/env.schema';
import { GalleryContentStore } from './content';
import { GalleryService } from './gallery.service';
import { GalleryExampleNotFoundError } from './public/gallery.errors';

const preset = {
  environment: 'clean seamless backdrop',
  lighting: 'soft key with controlled falloff',
  cameraLanguage: 'slow orbit, one dominant move per beat',
  pacing: 'restrained',
  mood: 'composed and premium',
};

const example = (patch: Record<string, unknown> = {}) => ({
  id: 'live',
  slug: 'live',
  titleUz: 'Tirik namuna',
  category: 'parfyum',
  style: 'product-film',
  videoPath: 'ab/cd.mp4',
  posterPath: 'ab/cd.jpg',
  aspectRatio: '9:16',
  durationSeconds: 10,
  promptEn: 'A 250 ml bottle of Nocturne by Maison Verre, priced 450000 som.',
  conceptUz: 'Konsepsiya matni.',
  creativePreset: preset,
  sourceType: 'app-prompt',
  sourceNote: 'JAS Ad Studio prompti asosida tayyorlangan namuna.',
  flowModel: 'Veo 3.1',
  flowMode: 'Frames to video',
  isPublished: true,
  sortOrder: 1,
  ...patch,
});

let gallery: GalleryService;

beforeAll(() => {
  const file = join(mkdtempSync(join(tmpdir(), 'gallery-svc-')), 'gallery.json');
  writeFileSync(
    file,
    JSON.stringify({
      examples: [
        example({ sortOrder: 2 }),
        example({ id: 'first', slug: 'first', sortOrder: 1 }),
        example({
          id: 'draft',
          slug: 'draft',
          isPublished: false,
          flowModel: null,
          flowMode: null,
          sourceNote: '',
          sortOrder: 3,
        }),
      ],
    }),
  );

  const config = { get: () => file } as unknown as ConfigService<Env, true>;
  gallery = new GalleryService(new GalleryContentStore(config));
});

describe('the public list', () => {
  it('lists published examples in sort order', () => {
    expect(gallery.list().map((card) => card.id)).toEqual(['first', 'live']);
  });

  it('never lists an unpublished example', () => {
    expect(gallery.list().some((card) => card.id === 'draft')).toBe(false);
  });

  // §15: a prompt is 1,500-2,300 words and this page must stay fast on a phone.
  it('leaves the prompt out of every card', () => {
    for (const card of gallery.list()) {
      expect(card).not.toHaveProperty('promptEn');
    }
  });

  it('gives the client ready-made media URLs, not paths to assemble', () => {
    expect(gallery.list()[0]?.videoUrl).toBe('/api/gallery/media/ab/cd.mp4');
    expect(gallery.list()[0]?.posterUrl).toBe('/api/gallery/media/ab/cd.jpg');
  });

  it('carries provenance on every card (§42)', () => {
    for (const card of gallery.list()) {
      expect(card.sourceType).toBe('app-prompt');
      expect(card.sourceNote.length).toBeGreaterThan(0);
    }
  });
});

describe('one example', () => {
  it('returns the prompt §12 reveals', () => {
    expect(gallery.get('live').promptEn).toContain('Nocturne');
  });

  it('refuses an unknown slug', () => {
    expect(() => gallery.get('nope')).toThrow(GalleryExampleNotFoundError);
  });

  it('refuses an unpublished slug exactly as it refuses an unknown one', () => {
    expect(() => gallery.get('draft')).toThrow(GalleryExampleNotFoundError);
  });
});

describe('resolving an inspiration — the boundary the exit check is about', () => {
  it('returns exactly six keys, and never a seventh', () => {
    expect(Object.keys(gallery.resolveInspiration('live') ?? {}).sort()).toEqual([
      'cameraLanguage',
      'environment',
      'id',
      'lighting',
      'mood',
      'pacing',
    ]);
  });

  it('carries the creative attributes and nothing else', () => {
    expect(gallery.resolveInspiration('live')).toEqual({ id: 'live', ...preset });
  });

  // The failure this guards against: a spread would carry promptEn, which names another
  // seller's product, its brand and its price.
  it('carries no product fact from the example it came from', () => {
    const resolved = JSON.stringify(gallery.resolveInspiration('live'));

    for (const fact of ['Nocturne', 'Maison Verre', '250 ml', '450000', 'Tirik namuna']) {
      expect(resolved).not.toContain(fact);
    }
  });

  it('resolves an unpublished example to null rather than to its attributes', () => {
    expect(gallery.resolveInspiration('draft')).toBeNull();
  });

  it('resolves an unknown id to null', () => {
    expect(gallery.resolveInspiration('nope')).toBeNull();
  });
});

describe('what a seller may select', () => {
  it('allows a published id', () => {
    expect(gallery.isSelectable('live')).toBe(true);
  });

  it('refuses an unpublished id', () => {
    expect(gallery.isSelectable('draft')).toBe(false);
  });

  it('refuses an unknown id', () => {
    expect(gallery.isSelectable('nope')).toBe(false);
  });
});
