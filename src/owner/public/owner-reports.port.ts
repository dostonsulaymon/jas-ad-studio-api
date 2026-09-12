import { z } from 'zod';

/** One generation, as the owner panel shows it. No prompt, no brief, no photo. */
export const ownerGenerationSchema = z.object({
  id: z.uuid(),
  userEmail: z.email(),
  projectName: z.string().nullable(),
  status: z.string(),
  model: z.string().nullable(),
  /** Recorded cost of the AI call in USD. Null when the call never reached a provider. */
  estCostUsd: z.number().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});

export type OwnerGeneration = z.infer<typeof ownerGenerationSchema>;

/** One day of AI spend. This is cost in USD, never credits. */
export const ownerSpendDaySchema = z.object({
  day: z.string(),
  generations: z.number(),
  failed: z.number(),
  estCostUsd: z.number(),
});

export type OwnerSpendDay = z.infer<typeof ownerSpendDaySchema>;
