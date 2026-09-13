import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadExamples } from './content';

const example = (patch: Record<string, unknown> = {}) => ({
  id: 'a',
  slug: 'a',
  titleUz: 'Namuna',
  category: 'kiyim',
  style: 'product-film',
  videoPath: 'a.mp4',
  posterPath: 'a.jpg',
  aspectRatio: '9:16',
  durationSeconds: 10,
  promptEn: 'prompt',
  conceptUz: 'konsepsiya',
  creativePreset: {
    environment: 'clean seamless backdrop',
    lighting: 'soft key with controlled falloff',
    cameraLanguage: 'slow orbit',
    pacing: 'restrained',
    mood: 'composed and premium',
  },
  sourceType: 'app-prompt',
  sourceNote: 'namuna',
  flowModel: 'Veo 3.1',
  flowMode: 'Frames to video',
  isPublished: true,
  sortOrder: 1,
  ...patch,
});

function write(content: unknown): string {
  const file = join(mkdtempSync(join(tmpdir(), 'gallery-')), 'gallery.json');
  writeFileSync(file, JSON.stringify(content));
  return file;
}

/**
 * Nothing reads this file at runtime since D-090 — it is the record of what migration
 * 0009 seeded. Keeping it valid means that record cannot rot into something the schema
 * would reject if anyone seeds from it again.
 */
it('keeps the committed seed record valid', () => {
  expect(() => loadExamples('content/gallery.json')).not.toThrow();
});

it('sorts by sortOrder rather than file order', () => {
  const file = write({
    examples: [
      example({ id: 'b', slug: 'b', sortOrder: 2 }),
      example({ id: 'a', slug: 'a', sortOrder: 1 }),
    ],
  });

  expect(loadExamples(file).map((e) => e.id)).toEqual(['a', 'b']);
});

it('refuses a duplicate id by name', () => {
  const file = write({ examples: [example(), example({ slug: 'b' })] });

  expect(() => loadExamples(file)).toThrow(/duplicate id "a"/);
});

it('refuses a duplicate slug by name', () => {
  const file = write({ examples: [example(), example({ id: 'b' })] });

  expect(() => loadExamples(file)).toThrow(/duplicate slug "a"/);
});

it('names the field and the reason when an entry is invalid', () => {
  const file = write({ examples: [example({ flowModel: null })] });

  expect(() => loadExamples(file)).toThrow(/flowModel and flowMode/);
});

it('refuses a file that is not readable rather than starting empty', () => {
  expect(() => loadExamples('/nowhere/gallery.json')).toThrow(/could not be read/);
});

it('refuses a file that is not JSON', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'gallery-')), 'gallery.json');
  writeFileSync(file, 'not json');

  expect(() => loadExamples(file)).toThrow(/could not be read/);
});
