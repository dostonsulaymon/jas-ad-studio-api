import { describe, expect, it } from 'vitest';
import type { Brief } from '../public/brief.schema';
import { creativeFormatSchema } from './format.schema';
import { DEFAULT_FORMAT_ID, findFormat, formatForBrief, listFormats } from './formats';

const brief = (style: Brief['style']): Brief => ({
  productName: 'X',
  description: 'Y',
  goal: 'sales',
  style,
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 8,
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

  it('maps every style to exactly one format', () => {
    const styles = listFormats().flatMap((f) => f.styles);

    expect(new Set(styles).size).toBe(styles.length);
  });
});

describe('formatForBrief', () => {
  it.each([
    ['clean-studio', 'product-film'],
    ['premium-cinematic', 'product-film'],
    ['energetic-social', 'high-energy'],
    ['lifestyle', 'lifestyle-story'],
    ['ugc', 'ugc-authentic'],
  ] as const)('resolves %s to %s', (style, expected) => {
    expect(formatForBrief(brief(style)).id).toBe(expected);
  });

  it('falls back to the restrained format, never to an energetic one', () => {
    // An unmapped style must not silently gain permission to whip-pan a product.
    const unmapped = { ...brief('clean-studio'), style: 'not-a-style' } as unknown as Brief;

    expect(formatForBrief(unmapped).id).toBe(DEFAULT_FORMAT_ID);
    expect(formatForBrief(unmapped).energy).toBe('restrained');
  });
});

describe('creativeFormatSchema', () => {
  const valid = {
    id: 't',
    version: 1,
    labelUz: 'Test',
    styles: ['clean-studio'],
    intent: 'A test format used only by this specification file.',
    sections: ['Product reference and source of truth', 'Product lock', 'Camera', 'Hero ending'],
    beats: { default: 3, max: 4 },
    shotSecondsRange: [1, 3],
    energy: 'restrained',
    cameraVocabulary: ['push-in', 'tracking', 'static'],
    transitions: ['direct cut', 'match cut'],
  };

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
