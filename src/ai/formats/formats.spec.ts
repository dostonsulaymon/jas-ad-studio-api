import { describe, expect, it } from 'vitest';
import type { Brief } from '../public/brief.schema';
import { creativeFormatSchema } from './format.schema';
import { FORMAT_IDS } from '../public/creative-format';
import { DEFAULT_FORMAT_ID, findFormat, formatForBrief, listFormats } from './formats';

const brief = (formatId: Brief['formatId']): Brief => ({
  productName: 'X',
  description: 'Y',
  goal: 'sales',
  formatId,
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 10,
  audience: null,
  confirmedClaims: [],
  offer: null,
  galleryInspirationId: null,
});

describe('the shipped formats', () => {
  it('parses every format at import time', () => {
    expect(listFormats()).toHaveLength(4);
  });

  it('gives each format a different section list (D-056)', () => {
    const lists = listFormats().map((f) => JSON.stringify(f.sections));

    expect(new Set(lists).size).toBe(lists.length);
  });

  it('starts every format with the two fidelity sections', () => {
    // Whatever else a format changes, the product reference and the lock come first.
    for (const format of listFormats()) {
      expect(format.sections[0]).toBe('Product reference and source of truth');
      expect(format.sections[1]).toBe('Product lock');
    }
  });

  it('gives the energetic format more beats and shorter shots', () => {
    const film = findFormat('product-film');
    const fast = findFormat('high-energy');

    expect(fast?.beats.default).toBeGreaterThan(film?.beats.default ?? 0);
    expect(fast?.shotSecondsRange[1]).toBeLessThan(film?.shotSecondsRange[0] ?? 0);
  });

  it('reserves the aggressive camera moves for the high-energy format', () => {
    for (const format of listFormats()) {
      const aggressive = format.cameraVocabulary.some((m) => /whip|crash|snap/.test(m));

      expect(aggressive).toBe(format.energy === 'high');
    }
  });

  it('lets only high-energy float, spin or launch the product, or add atmosphere (D-096)', () => {
    for (const format of listFormats()) {
      const lifted = format.productMotion.some((m) => /float|spin|launch|glide/.test(m));

      expect(lifted).toBe(format.energy === 'high');
      expect(format.atmosphere.length > 0).toBe(format.energy === 'high');
    }
  });

  it('never lists assembly, separation or unfolding as motion in any format (D-096)', () => {
    for (const format of listFormats()) {
      for (const entry of [...format.productMotion, ...format.atmosphere]) {
        expect(entry).not.toMatch(/assembl|separat|component|unfold|exploded/i);
      }
    }
  });

  it('keeps every format’s beat limit inside the contract’s eight Uzbek shots', () => {
    for (const format of listFormats()) {
      expect(format.beats.max).toBeLessThanOrEqual(8);
    }
  });

  it('gives every format a unique id, so the picker cannot show two of the same', () => {
    const ids = listFormats().map((f) => f.id);

    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('formatForBrief', () => {
  it.each([
    ['product-film', 'product-film'],
    ['high-energy', 'high-energy'],
    ['lifestyle-story', 'lifestyle-story'],
    ['ugc-authentic', 'ugc-authentic'],
  ] as const)('resolves %s to %s', (formatId, expected) => {
    expect(formatForBrief(brief(formatId)).id).toBe(expected);
  });

  it('falls back to the restrained format, never to an energetic one', () => {
    // The brief's zod enum should make this unreachable through the API. It guards the
    // CLI and any caller that builds a brief by hand — an id nothing defines must not
    // silently gain permission to whip-pan a product.
    const unknown = { ...brief('product-film'), formatId: 'not-a-format' } as unknown as Brief;

    expect(formatForBrief(unknown).id).toBe(DEFAULT_FORMAT_ID);
    expect(formatForBrief(unknown).energy).toBe('restrained');
  });
});

describe('creativeFormatSchema', () => {
  const valid = {
    id: 't',
    version: 1,
    labelUz: 'Test',
    descriptionUz: 'Toza fonda sokin kamera bilan mahsulotni ko‘rsatadigan reklama.',
    intent: 'A test format used only by this specification file.',
    sections: ['Product reference and source of truth', 'Product lock', 'Camera', 'Hero ending'],
    beats: { default: 3, max: 4 },
    shotSecondsRange: [1, 3],
    energy: 'restrained',
    cameraVocabulary: ['push-in', 'tracking', 'static'],
    transitions: ['direct cut', 'match cut'],
    productMotion: ['resting still'],
    atmosphere: [],
  };

  it('rejects a format with no product motion listed', () => {
    expect(creativeFormatSchema.safeParse({ ...valid, productMotion: [] }).success).toBe(false);
  });

  it('accepts a well-formed format', () => {
    expect(creativeFormatSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects duplicate sections', () => {
    const dup = { ...valid, sections: [...valid.sections, 'Camera'] };

    expect(creativeFormatSchema.safeParse(dup).success).toBe(false);
  });

  it('rejects a shot range given backwards', () => {
    expect(creativeFormatSchema.safeParse({ ...valid, shotSecondsRange: [3, 1] }).success).toBe(
      false,
    );
  });

  it('rejects beats.default above beats.max', () => {
    const bad = { ...valid, beats: { default: 9, max: 4 } };

    expect(creativeFormatSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects an unknown property', () => {
    expect(creativeFormatSchema.safeParse({ ...valid, vibe: 'cool' }).success).toBe(false);
  });
});

describe('D-065: the seller picks the format directly', () => {
  it('every format carries Uzbek text, because the seller now reads this list', () => {
    for (const format of listFormats()) {
      expect(format.labelUz.length).toBeGreaterThan(0);
      expect(format.descriptionUz.length).toBeGreaterThan(0);
    }
  });

  it('keeps the seller-facing text in Latin script (D-014)', () => {
    for (const format of listFormats()) {
      expect(format.labelUz).not.toMatch(/[Ѐ-ӿ]/);
      expect(format.descriptionUz).not.toMatch(/[Ѐ-ӿ]/);
    }
  });

  it('the registry covers exactly the ids the contract allows, in both directions', () => {
    // The port declares FORMAT_IDS and the registry implements it (R-7). Without this,
    // a format could be added to one and not the other and nothing would say so.
    expect([...listFormats().map((f) => f.id)].sort()).toEqual([...FORMAT_IDS].sort());

    for (const id of FORMAT_IDS) {
      expect(findFormat(id)).toBeDefined();
    }
  });

  it('no format claims a style any more', () => {
    for (const format of listFormats()) {
      expect(format).not.toHaveProperty('styles');
    }
  });

  it('resolves a brief to the format it names', () => {
    for (const format of listFormats()) {
      expect(formatForBrief({ formatId: format.id } as never).id).toBe(format.id);
    }
  });

  it('falls back to the restrained format for an id nothing defines', () => {
    // An unknown format must never silently gain permission to whip-pan a product.
    expect(formatForBrief({ formatId: 'no-such-format' } as never).id).toBe(DEFAULT_FORMAT_ID);
    expect(findFormat(DEFAULT_FORMAT_ID)?.energy).toBe('restrained');
  });
});
