import { z } from 'zod';
import {
  ASPECT_RATIOS,
  GALLERY_CATEGORIES,
  namesProductIdentity,
  PROVENANCE_NOT_RECORDED,
  requireCompleteWhenPublished,
  SOURCE_TYPES,
} from './public/gallery.port';
import { PROMPT_ACCESS } from '../pro/public/pro.port';

/** Re-exported: the constant belongs with the publish rule that uses it, which lives in the port. */
export { PROVENANCE_NOT_RECORDED };

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

/**
 * Relative, and refused if it tries to climb. `media.ts` refuses again at read time.
 *
 * Empty is allowed because a draft may not have its video yet (R-015); publishing without one is
 * refused by `requireCompleteWhenPublished`, not here.
 */
const mediaPath = z
  .string()
  .max(200)
  .refine((value) => value === '' || /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value), {
    message: 'must be a relative media path',
  })
  .refine((value) => !value.includes('..'), { message: 'must not contain ".."' });

/**
 * A creative attribute is a short phrase, with §13's word rule shared from the port so the schema
 * that reads a row and the schema that writes one cannot disagree (D-106).
 */
const creativeAttribute = z
  .string()
  .max(120)
  .refine((value) => !namesProductIdentity(value), {
    message: 'must not name product identity (§13): brand, label, price, …',
  });

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
    /** R-017. Null means nobody supplied one, and the card shows nothing there. */
    referencePhotoPath: mediaPath.nullable().default(null),
    aspectRatio: z.enum(ASPECT_RATIOS),
    durationSeconds: z.number().min(0).max(600),

    /** The exact English prompt. §12 shows it; §48 copies this and nothing else. */
    promptEn: z.string(),
    conceptUz: z.string().max(600),

    creativePreset: creativePresetSchema,

    sourceType: z.enum(SOURCE_TYPES),
    /** The honest label shown with the card (§42). */
    sourceNote: z.string().max(200),

    /**
     * R-010: whether opening this prompt needs PRO.
     *
     * Defaulted, not required, and the default is the open one. Every example written
     * before this column existed — including the seeded record in `content/gallery.json` —
     * parses as free, so nothing became paid by a migration or by a client that has not
     * been updated. Locking an example is always something somebody chose.
     */
    promptAccess: z.enum(PROMPT_ACCESS).default('free'),

    /** D-011 records these per clip. Null is allowed only while unpublished. */
    flowModel: z.string().min(1).max(60).nullable(),
    flowMode: z.string().min(1).max(60).nullable(),

    isPublished: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict()
  /**
   * Every publish rule lives in the port, so the row schema and the owner's input schema cannot
   * drift apart — a draft this schema accepts on the way out is one the API accepted on the way in.
   */
  .superRefine(requireCompleteWhenPublished);

export const galleryContentSchema = z
  .object({ examples: z.array(galleryExampleSchema) })
  .strict();

export type GalleryExample = z.infer<typeof galleryExampleSchema>;
export type CreativePreset = z.infer<typeof creativePresetSchema>;
export type GalleryContent = z.infer<typeof galleryContentSchema>;
