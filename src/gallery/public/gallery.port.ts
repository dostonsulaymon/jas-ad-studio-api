import { z } from 'zod';
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
 * prompt this app produced — the only value that earns "made with JAS Ad Studio"
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
    aspectRatio: z.enum(ASPECT_RATIOS),
    durationSeconds: z.number(),
    conceptUz: z.string(),
    /** §42: provenance travels with the example, never as a separate claim. */
    sourceType: z.enum(SOURCE_TYPES),
    sourceNote: z.string(),
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

export const GALLERY_READER = Symbol('GALLERY_READER');

export interface GalleryReader {
  /**
   * The creative attributes of a published example, or null.
   *
   * Null for an id that names nothing **and** for one that is no longer published: the
   * caller cannot tell the difference, and neither case is an error worth failing a
   * paid generation over.
   */
  resolveInspiration(id: string): GalleryInspiration | null;

  /** Whether a seller may select this id on a brief: it exists and it is published. */
  isSelectable(id: string): boolean;
}
