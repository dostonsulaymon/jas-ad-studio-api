import { z } from 'zod';
export { countWords, estimateTokens } from '../public/text';


const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

export const videoTargetSchema = z
  .object({
    id: z.string().min(1),
    version: z.number().int().positive(),
    sourceUrl: z.url(),
    checkedAt: isoDate,
    provisional: z.boolean(),

    maxPromptTokens: z.number().int().positive(),
    tokensPerWord: z.number().positive(),
    maxWords: z.number().int().positive(),
    maxChars: z.number().int().positive(),
    recommendedWords: z.number().int().positive(),

    beats: z.object({
      default: z.number().int().positive(),
      max: z.number().int().positive(),
    }),

    /**
     * How many photos we send, which is our decision rather than the generator's
     * (D-050). Duration and aspect ratio are not here: the seller picks those in Flow,
     * so they travel with the brief and there is no capability list to check them
     * against.
     */
    maxReferenceImages: z.number().int().positive(),
    highEnergyCameraAllowed: z.boolean(),
  })
  .strict()
  .refine((t) => t.beats.default <= t.beats.max, {
    message: 'beats.default must not exceed beats.max',
    path: ['beats', 'default'],
  });

export type VideoTarget = z.infer<typeof videoTargetSchema>;

