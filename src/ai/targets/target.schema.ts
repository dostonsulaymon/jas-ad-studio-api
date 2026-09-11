import { z } from 'zod';
import { ASPECT_RATIOS, REFERENCE_MODES } from '../public/video-format';

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

    durations: z.array(z.number().positive()).min(1),
    aspectRatios: z.array(z.enum(ASPECT_RATIOS)).min(1),
    referenceImages: z.object({
      supported: z.boolean(),
      max: z.number().int().nonnegative(),
    }),
    referenceMode: z.enum(REFERENCE_MODES),
    highEnergyCameraAllowed: z.boolean(),
  })
  .strict()
  .refine((t) => t.beats.default <= t.beats.max, {
    message: 'beats.default must not exceed beats.max',
    path: ['beats', 'default'],
  })
  .refine((t) => t.recommendedWords <= t.maxWords, {
    message: 'recommendedWords must not exceed maxWords',
    path: ['recommendedWords'],
  })
  // D-012 puts both a token ceiling and a word ceiling in the config. If maxWords could
  // exceed the token ceiling, a prompt could satisfy one validator and violate the other.
  .refine((t) => Math.ceil(t.maxWords * t.tokensPerWord) <= t.maxPromptTokens, {
    message: 'maxWords x tokensPerWord must not exceed maxPromptTokens',
    path: ['maxWords'],
  })
  .refine((t) => !t.referenceImages.supported || t.referenceImages.max > 0, {
    message: 'a target supporting reference images must accept at least one',
    path: ['referenceImages', 'max'],
  });

export type VideoTarget = z.infer<typeof videoTargetSchema>;

export function estimateTokens(text: string, tokensPerWord: number): number {
  return Math.ceil(countWords(text) * tokensPerWord);
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}
