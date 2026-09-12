import { z } from 'zod';
import { FORMAT_IDS } from './creative-format';
import { ASPECT_RATIOS } from './video-format';

/**
 * The seller's brief. This is the wizard's input contract (source 01 §8, §9), not a
 * fixture format: P2-P4 build the upload and wizard against it, and Session B generates
 * its client types from it (D-031). Fields the seller cannot see or verify do not belong
 * here.
 */

export const AD_GOALS = ['awareness', 'sales', 'launch', 'trust'] as const;
export const PLATFORMS = ['instagram', 'telegram', 'tiktok', 'youtube-shorts'] as const;

const shortText = z.string().trim().min(1).max(200);
const longText = z.string().trim().min(1).max(2000);

/**
 * Anything the seller asserts that the photos cannot show. Kept apart from the photos so
 * the model can tell evidence from assertion (source 01 §25, "evidence before
 * invention") and so a claim can be traced to whoever made it.
 */
const confirmedClaim = z
  .object({
    claim: shortText,
    /** Sellers over-claim. An unverified claim may still be used, but never as fact. */
    verified: z.boolean(),
  })
  .strict();

const offer = z
  .object({
    description: shortText,
    priceUzs: z.number().int().positive().nullable(),
    validUntil: z.iso.date().nullable(),
  })
  .strict();

export const briefSchema = z
  .object({
    productName: shortText,
    description: longText,
    goal: z.enum(AD_GOALS),
    /**
     * D-065. The seller names the creative format themselves. This replaced `style`,
     * which asked nearly the same question one level of indirection away: two of the
     * five styles resolved to the same format, so the picker could not express three of
     * the four formats and nine of ten test products silently landed on one (D-063).
     */
    formatId: z.enum(FORMAT_IDS),
    platform: z.enum(PLATFORMS),
    aspectRatio: z.enum(ASPECT_RATIOS),
    /**
     * Default 10, because Flow generates 10-second clips: every one of the eight judged
     * videos measured 10.00s against an 8s brief, leaving two unscripted seconds that
     * Flow filled by holding the last framing (D-063, D-064).
     */
    durationSeconds: z.number().positive().default(10),
    audience: shortText.nullable(),
    /** Empty is normal and honest; the product lock depends on not inventing claims. */
    confirmedClaims: z.array(confirmedClaim).max(10),
    offer: offer.nullable(),
    /**
     * A gallery example used as creative inspiration only. The id is resolved
     * server-side; the model never receives a client-supplied example body, or a seller
     * could smuggle in arbitrary instructions (source 01 §25).
     */
    galleryInspirationId: z.string().min(1).nullable(),
  })
  .strict();

export type Brief = z.infer<typeof briefSchema>;
export type ConfirmedClaim = z.infer<typeof confirmedClaim>;
