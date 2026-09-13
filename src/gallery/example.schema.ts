import { z } from 'zod';
import { ASPECT_RATIOS, GALLERY_CATEGORIES, SOURCE_TYPES } from './public/gallery.port';

/**
 * One gallery example, as it appears in `content/gallery.json` (R-5, source 01 §14).
 *
 * The file is committed content, not user input, so this schema is not a security
 * boundary — it is the thing that stops a human writing an entry that would quietly
 * break a rule the product cannot break. Every refusal below maps to a source rule.
 */


const slug = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug');

/** Relative, and refused if it tries to climb. `media.ts` refuses again at read time. */
const mediaPath = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, 'must be a relative media path')
  .refine((value) => !value.includes('..'), { message: 'must not contain ".."' });

/**
 * Words that are never a creative attribute. Source 01 §13 lists what must never cross
 * from an example to a seller's prompt; these are the members of that list that cannot
 * appear in an honest description of lighting or camera work.
 *
 * Deliberately short. This is a tripwire for a human pasting product prose into a preset
 * field, **not** the mechanism that keeps product facts out of a seller's prompt — that
 * is the six-key resolution boundary in `gallery.port.ts` and the isolation test that
 * asserts on the assembled prompt. A longer list would start refusing legitimate
 * phrasing ("light that flatters matte materials") and teach whoever writes content to
 * fight the schema, which is how filters end up disabled.
 */
const PRODUCT_IDENTITY_WORDS = [
  'brand',
  'logo',
  'label',
  'trademark',
  'price',
  'som',
  'uzs',
] as const;

/**
 * A creative attribute is a short phrase. Product prose is long, and length is a better
 * signal of "somebody pasted the wrong thing here" than any word list.
 */
const creativeAttribute = z
  .string()
  .min(3)
  .max(120)
  .refine(
    (value) => {
      const words = value.toLowerCase().match(/[a-z]+/g) ?? [];
      return !words.some((word) =>
        (PRODUCT_IDENTITY_WORDS as readonly string[]).includes(word),
      );
    },
    { message: 'must not name product identity (§13): brand, logo, label, price, …' },
  );

/**
 * The only part of an example that may ever reach the model (§13, §14). Kept in its own
 * object precisely so that resolving an inspiration can name this field and nothing
 * around it: "Do not include product-specific factual claims inside reusable preset
 * fields."
 */
export const creativePresetSchema = z
  .object({
    environment: creativeAttribute,
    lighting: creativeAttribute,
    cameraLanguage: creativeAttribute,
    pacing: creativeAttribute,
    mood: creativeAttribute,
  })
  .strict();

export const galleryExampleSchema = z
  .object({
    id: slug,
    slug,
    /** The concept title on the card (§11), in Uzbek. */
    titleUz: z.string().min(1).max(120),
    category: z.enum(GALLERY_CATEGORIES),
    /** The creative format it was generated with (D-058), for the small style label. */
    style: z.string().min(1).max(40),

    videoPath: mediaPath,
    posterPath: mediaPath,
    aspectRatio: z.enum(ASPECT_RATIOS),
    durationSeconds: z.number().positive().max(600),

    /** The exact English prompt. §12 shows it; §48 copies this and nothing else. */
    promptEn: z.string().min(1),
    conceptUz: z.string().min(1).max(600),

    creativePreset: creativePresetSchema,

    sourceType: z.enum(SOURCE_TYPES),
    /** The honest label shown with the card (§42). */
    sourceNote: z.string().max(200),

    /** D-011 records these per clip. Null is allowed only while unpublished. */
    flowModel: z.string().min(1).max(60).nullable(),
    flowMode: z.string().min(1).max(60).nullable(),

    isPublished: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict()
  /**
   * D-011: a published clip states which Flow model and mode made it. Enforced here
   * rather than trusted to whoever edits the file, so a clip cannot go live without its
   * provenance — the record either exists or the gallery refuses to boot.
   */
  .refine((e) => !e.isPublished || (e.flowModel !== null && e.flowMode !== null), {
    message: 'a published example must record flowModel and flowMode (D-011)',
    path: ['flowModel'],
  })
  /** §42: "If an example is produced internally by JAS Studio, label it as an example." */
  .refine((e) => !e.isPublished || e.sourceNote.trim().length > 0, {
    message: 'a published example must carry its honest source note (§42)',
    path: ['sourceNote'],
  });

export const galleryContentSchema = z
  .object({ examples: z.array(galleryExampleSchema) })
  .strict();

export type GalleryExample = z.infer<typeof galleryExampleSchema>;
export type CreativePreset = z.infer<typeof creativePresetSchema>;
export type GalleryContent = z.infer<typeof galleryContentSchema>;
