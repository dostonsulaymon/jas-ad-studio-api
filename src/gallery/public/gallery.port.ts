import { z } from 'zod';
import { PROMPT_ACCESS } from '../../pro/public/pro.port';
import type { GalleryInspiration } from '../../ai/public/generator.port';

/**
 * Source 01 §11's category list, and only it: "Do not fabricate categories for examples
 * that do not exist." A category with no real clip cannot be written down, so it can
 * never reach the page.
 *
 * These live in the port rather than beside the content schema because they are part of
 * the published contract — the web client generates an enum from them — and R-7 forbids
 * a port importing from its own module.
 */
export const GALLERY_CATEGORIES = [
  'kiyim',
  'poyabzal',
  'parfyum',
  'kosmetika',
  'uy-rozgor',
  'elektronika',
  'oziq-ovqat',
  'aksessuar',
] as const;

export const ASPECT_RATIOS = ['9:16', '16:9', '1:1'] as const;

/**
 * §42: every example carries its provenance. `app-prompt` is a clip generated from a
 * prompt this app produced — the only value that earns "made with Promptly"
 * (D-011). `studio-made` is JAS Studio's own work made some other way; `external` is
 * somebody else's, and carries the usage-rights burden §42 describes.
 */
export const SOURCE_TYPES = ['app-prompt', 'studio-made', 'external'] as const;

/**
 * The gallery module's published surface (R-7).
 *
 * Two audiences: the HTTP client, which gets the card and detail shapes below, and the
 * generation worker, which gets `GALLERY_READER` and nothing else.
 */

/**
 * What a card carries (source 01 §11). **No `promptEn`** — a prompt is 1,500-2,300 words
 * and §15 is explicit that this page must stay fast on an Uzbek phone. The prompt
 * arrives from the detail route when the seller actually opens the sheet (§12).
 */
export const galleryCardSchema = z
  .object({
    id: z.string(),
    slug: z.string(),
    titleUz: z.string(),
    category: z.enum(GALLERY_CATEGORIES),
    style: z.string(),
    /** Ready to use. The client never builds a media URL out of a path. */
    videoUrl: z.string(),
    posterUrl: z.string(),
    /** R-017: the raw product photo, or null when nobody supplied one. Ready to use. */
    referencePhotoUrl: z.string().nullable(),
    aspectRatio: z.enum(ASPECT_RATIOS),
    durationSeconds: z.number(),
    conceptUz: z.string(),
    /** §42: provenance travels with the example, never as a separate claim. */
    sourceType: z.enum(SOURCE_TYPES),
    sourceNote: z.string(),
    /**
     * R-010: on the card, so the badge and the Bepul/Pullik filter render from the list
     * alone. Saying an example is paid is not the same as handing over its prompt — that
     * is the detail route's business, and it refuses.
     */
    promptAccess: z.enum(PROMPT_ACCESS),
  })
  .strict();

export const galleryListSchema = z.object({ examples: z.array(galleryCardSchema) }).strict();

/** The card plus the prompt §12 reveals and §48 copies. */
export const galleryExampleViewSchema = galleryCardSchema
  .extend({ promptEn: z.string() })
  .strict();

export type GalleryCard = z.infer<typeof galleryCardSchema>;
export type GalleryList = z.infer<typeof galleryListSchema>;
export type GalleryExampleView = z.infer<typeof galleryExampleViewSchema>;

/**
 * Everything a published example owes, checked in one place (R-015).
 *
 * A **draft** needs almost nothing: an owner should be able to save a title and come back with the
 * video tomorrow. **Publishing** is where every rule bites, because that is the moment the example
 * becomes a claim on a public page — the source note (§42), the Flow provenance (D-011, D-089), the
 * prompt §48 copies, and the five preset fields an inspiration resolves from (§13).
 *
 * One issue per missing field, each with its own `path`, so the owner panel can mark the inputs
 * instead of saying "something is wrong".
 */
export interface PublishableExample {
  videoPath: string;
  posterPath: string;
  durationSeconds: number;
  promptEn: string;
  conceptUz: string;
  creativePreset: Record<string, string>;
  sourceNote: string;
  flowModel: string | null;
  flowMode: string | null;
  isPublished: boolean;
}

const PRESET_KEYS = ['environment', 'lighting', 'cameraLanguage', 'pacing', 'mood'] as const;

export function requireCompleteWhenPublished(value: PublishableExample, ctx: z.RefinementCtx): void {
  if (!value.isPublished) return;

  const missing = (path: (string | number)[], message: string) => {
    ctx.addIssue({ code: 'custom', message, path });
  };

  if (value.videoPath.trim() === '') missing(['videoPath'], 'a published example needs its video');
  if (value.posterPath.trim() === '') missing(['posterPath'], 'a published example needs its poster');
  if (!(value.durationSeconds > 0)) missing(['durationSeconds'], 'a published example needs its duration');
  if (value.promptEn.trim() === '') missing(['promptEn'], 'a published example needs the prompt it was made with (§48)');
  if (value.conceptUz.trim() === '') missing(['conceptUz'], 'a published example needs its Uzbek concept');

  for (const key of PRESET_KEYS) {
    if ((value.creativePreset[key] ?? '').trim().length < 3) {
      missing(['creativePreset', key], 'a published example needs all five creative attributes (§13)');
    }
  }

  /**
   * D-011: a published clip states which Flow model and mode made it. Enforced here rather than
   * trusted to whoever edits it, so a clip cannot go live without its provenance.
   */
  if (value.flowModel === null || value.flowMode === null) {
    missing(
      ['flowModel'],
      'a published example must record flowModel and flowMode (D-011) — ' +
        `use "${PROVENANCE_NOT_RECORDED}" if it genuinely was not written down, never a guess`,
    );
  }

  /** §42: "If an example is produced internally by JAS Studio, label it as an example." */
  if (value.sourceNote.trim() === '') {
    missing(['sourceNote'], 'a published example must carry its honest source note (§42)');
  }
}

/**
 * An honest "we did not write it down" for `flowModel` / `flowMode` (D-089).
 *
 * A named value rather than free prose, so it is greppable and so nobody has to decide how to
 * phrase not knowing. It is deliberately NOT the same as `null`: null means the example is still a
 * draft, this means somebody looked and the record does not exist. A guess is never an acceptable
 * third option — the field exists to be true.
 */
export const PROVENANCE_NOT_RECORDED = 'not-recorded';

/**
 * What the owner sends when creating or editing an example. The id is the table's, the
 * slug is the caller's, and `isPublished` is the only field that changes what a visitor
 * sees — which is why nothing here defaults it to true.
 *
 * R-015: the fields a draft may leave empty are empty-able *here*, and required by
 * `requireCompleteWhenPublished` above. What identifies and orders an example — slug, title,
 * category, style, ratio, sort order — is required either way, because a row needs a key.
 */
export const galleryExampleInputSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be a lowercase slug'),
    titleUz: z.string().min(1).max(120),
    category: z.enum(GALLERY_CATEGORIES),
    style: z.string().min(1).max(40),
    videoPath: z.string().max(200),
    posterPath: z.string().max(200),
    referencePhotoPath: z.string().max(200).nullable().default(null),
    aspectRatio: z.enum(ASPECT_RATIOS),
    durationSeconds: z.number().min(0).max(600),
    promptEn: z.string(),
    conceptUz: z.string().max(600),
    creativePreset: z.object({
      environment: z.string().max(120),
      lighting: z.string().max(120),
      cameraLanguage: z.string().max(120),
      pacing: z.string().max(120),
      mood: z.string().max(120),
    }),
    sourceType: z.enum(SOURCE_TYPES),
    sourceNote: z.string().max(200),
    /** Defaults to free: an owner who never touches this switch never locks anything. */
    promptAccess: z.enum(PROMPT_ACCESS).default('free'),
    flowModel: z.string().min(1).max(60).nullable(),
    flowMode: z.string().min(1).max(60).nullable(),
    isPublished: z.boolean(),
    sortOrder: z.number().int(),
  })
  .strict()
  .superRefine(requireCompleteWhenPublished);

export type GalleryExampleInputDto = z.infer<typeof galleryExampleInputSchema>;

/** The owner's view: every example, published or not, with the row id to address it. */
export const ownerGalleryExampleSchema = galleryExampleInputSchema.extend({
  id: z.string(),
});
export const ownerGalleryListSchema = z
  .object({ examples: z.array(ownerGalleryExampleSchema) })
  .strict();

export type OwnerGalleryExample = z.infer<typeof ownerGalleryExampleSchema>;
export type OwnerGalleryList = z.infer<typeof ownerGalleryListSchema>;

/** What an upload returns: the path an example's videoPath/posterPath then points at. */
export const galleryMediaSchema = z.object({ path: z.string(), contentType: z.string() }).strict();
export type GalleryMediaUpload = z.infer<typeof galleryMediaSchema>;

export const GALLERY_ADMIN = Symbol('GALLERY_ADMIN');

export interface GalleryAdmin {
  listForOwner(): Promise<OwnerGalleryExample[]>;
  create(input: GalleryExampleInputDto, ownerId: string): Promise<OwnerGalleryExample>;
  edit(id: string, input: GalleryExampleInputDto, ownerId: string): Promise<OwnerGalleryExample>;
  remove(id: string): Promise<void>;
  storeMedia(bytes: Buffer, filename: string): Promise<GalleryMediaUpload>;
}

export const GALLERY_READER = Symbol('GALLERY_READER');

export interface GalleryReader {
  /**
   * The creative attributes of a published example, or null.
   *
   * Null for an id that names nothing **and** for one that is no longer published: the
   * caller cannot tell the difference, and neither case is an error worth failing a
   * paid generation over.
   */
  resolveInspiration(id: string): Promise<GalleryInspiration | null>;

  /** Whether a seller may select this id on a brief: it exists and it is published. */
  isSelectable(id: string): Promise<boolean>;
}
