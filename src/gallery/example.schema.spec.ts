import { describe, expect, it } from 'vitest';
import { galleryExampleSchema, PROVENANCE_NOT_RECORDED } from './example.schema';

const valid = {
  id: 'wipes-lifestyle',
  slug: 'wipes-lifestyle',
  titleUz: "Har kuni qo'l yetadigan tozalik",
  category: 'uy-rozgor',
  style: 'lifestyle-story',
  videoPath: 'a1b2c3.mp4',
  posterPath: 'a1b2c3.jpg',
  aspectRatio: '9:16',
  durationSeconds: 10,
  promptEn: 'Product reference and source of truth: ...',
  conceptUz: 'Yosh ota-onalar uchun kundalik uy vaziyati.',
  creativePreset: {
    environment: 'bright domestic surface, tidy and uncluttered',
    lighting: 'soft daylight, gentle falloff',
    cameraLanguage: 'slow push-in, one dominant move per beat',
    pacing: 'calm, unhurried',
    mood: 'warm everyday realism',
  },
  sourceType: 'app-prompt',
  sourceNote: "JAS Ad Studio prompti asosida Google Flow'da tayyorlangan namuna.",
  flowModel: 'Veo 3.1',
  flowMode: 'Frames to video',
  isPublished: true,
  sortOrder: 1,
};

const parse = (patch: Record<string, unknown>) =>
  galleryExampleSchema.safeParse({ ...valid, ...patch });

it('accepts a complete, published example', () => {
  expect(parse({}).success).toBe(true);
});

describe('a published example must carry its provenance (D-011)', () => {
  it('refuses a published example with no flowModel', () => {
    const result = parse({ flowModel: null });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('flowModel and flowMode');
  });

  it('refuses a published example with no flowMode', () => {
    expect(parse({ flowMode: null }).success).toBe(false);
  });

  // The point of the rule: content can exist before its provenance does, it just cannot
  // go live. This is what lets Task 6 seed the file from out/pack before Doston answers.
  it('allows an UNpublished example to have neither', () => {
    expect(parse({ isPublished: false, flowModel: null, flowMode: null }).success).toBe(true);
  });

  /**
   * D-089. Sometimes the record genuinely does not exist — the P1 clips were made with a
   * mix of Omni and Veo 3.1 and nobody wrote down which. Saying so is honest; picking one
   * at random would be a claim that is wrong half the time, in the one file whose job is
   * to say where the content came from.
   */
  it('accepts an explicit "not recorded" on a published example', () => {
    expect(
      parse({ flowModel: PROVENANCE_NOT_RECORDED, flowMode: PROVENANCE_NOT_RECORDED }).success,
    ).toBe(true);
  });

  it('still refuses null, which means a draft rather than an answer', () => {
    expect(parse({ flowMode: null }).success).toBe(false);
  });
});

describe('a published example must be labelled honestly (§42)', () => {
  it('refuses an empty source note', () => {
    const result = parse({ sourceNote: '   ' });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('honest source note');
  });

  it('allows an unpublished example to have none yet', () => {
    expect(parse({ isPublished: false, sourceNote: '' }).success).toBe(true);
  });
});

/**
 * R-015. Jakhongir could not save an example at all until every one of fourteen fields was
 * filled, and the panel only told him that something was wrong. A draft is now allowed to be
 * as empty as the work actually is; publishing is where the rules bite.
 */
describe('a draft may be as unfinished as the work is (R-015)', () => {
  const bare = {
    id: 'bare-draft',
    slug: 'bare-draft',
    titleUz: 'Hali tayyor emas',
    category: 'aksessuar',
    style: 'product-film',
    videoPath: '',
    posterPath: '',
    aspectRatio: '9:16',
    durationSeconds: 0,
    promptEn: '',
    conceptUz: '',
    creativePreset: { environment: '', lighting: '', cameraLanguage: '', pacing: '', mood: '' },
    sourceType: 'app-prompt',
    sourceNote: '',
    flowModel: null,
    flowMode: null,
    isPublished: false,
    sortOrder: 0,
  };

  it('accepts a draft carrying only what identifies and orders it', () => {
    expect(galleryExampleSchema.safeParse(bare).success).toBe(true);
  });

  it('still refuses a draft with no title or no slug, because a row needs a key', () => {
    expect(galleryExampleSchema.safeParse({ ...bare, titleUz: '' }).success).toBe(false);
    expect(galleryExampleSchema.safeParse({ ...bare, slug: '' }).success).toBe(false);
  });

  it('names every field that is missing when that draft is published', () => {
    const result = galleryExampleSchema.safeParse({ ...bare, isPublished: true });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual([
      'videoPath',
      'posterPath',
      'durationSeconds',
      'promptEn',
      'conceptUz',
      'creativePreset.environment',
      'creativePreset.lighting',
      'creativePreset.cameraLanguage',
      'creativePreset.pacing',
      'creativePreset.mood',
      'flowModel',
      'sourceNote',
    ]);
  });

  // The §13 tripwire still fires on a draft: a preset that names a brand is wrong whether or
  // not the example is live, and catching it late means catching it after it is public.
  it('keeps the product-identity rule on a draft', () => {
    const result = galleryExampleSchema.safeParse({
      ...bare,
      creativePreset: { ...bare.creativePreset, environment: 'a premium brand shelf' },
    });

    expect(result.success).toBe(false);
  });
});

describe('a creative preset carries no product identity (§13)', () => {
  it.each([
    ['brand', 'a premium brand shelf'],
    ['logo', 'logo catches the light'],
    ['label', 'label faces the camera'],
    ['price', 'price card beside the product'],
  ])('refuses a preset naming the %s', (_word, value) => {
    const result = parse({ creativePreset: { ...valid.creativePreset, environment: value } });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('product identity');
  });

  it('refuses prose pasted into a preset field', () => {
    const result = parse({
      creativePreset: {
        ...valid.creativePreset,
        lighting:
          'Use the supplied reference image as the single visual authority for the product. ' +
          'The product is an unbranded white soft pack shown as a low pillow-like pouch with ' +
          'folded and sealed-looking side edges and a rounded opening on the upper face.',
      },
    });

    expect(result.success).toBe(false);
  });

  // The filter must not fight legitimate cinematography, or whoever writes content learns
  // to work around it. "materials" is generic; it is not the example product's material.
  it('allows generic phrasing that happens to mention materials or numbers', () => {
    expect(
      parse({
        creativePreset: {
          ...valid.creativePreset,
          lighting: 'hard key at 45 degrees, flattering matte materials',
        },
      }).success,
    ).toBe(true);
  });

  it('refuses an unknown key in the preset', () => {
    const result = parse({
      creativePreset: { ...valid.creativePreset, promptEn: 'the whole prompt' },
    });

    expect(result.success).toBe(false);
  });
});

describe('the rest of the shape', () => {
  it('refuses a category outside the §11 list', () => {
    expect(parse({ category: 'avtomobil' }).success).toBe(false);
  });

  it('refuses a media path that climbs', () => {
    expect(parse({ videoPath: '../../etc/passwd' }).success).toBe(false);
    expect(parse({ posterPath: '/etc/passwd' }).success).toBe(false);
  });

  it('refuses an unknown field, so a typo is not silently ignored', () => {
    expect(parse({ videoUrl: 'https://example.com/a.mp4' }).success).toBe(false);
  });
});
