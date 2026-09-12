/**
 * The generation module's public contract (R-7). Types and DI tokens only.
 */
import { z } from 'zod';
import { generationResultSchema } from '../../ai/public/result.schema';

/**
 * The JOB's states (source 01 §32). Named JOB_STATUSES, not GENERATION_STATUSES, because
 * `ai/public/result.schema.ts` already exports that name for the MODEL's three outcomes
 * (ready | needs_input | refused) and the two lists are not the same thing.
 */
export const JOB_STATUSES = [
  'queued',
  'running',
  'ready',
  'needs_input',
  'refused',
  'failed',
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** The states from which nothing more will happen on its own. */
export const TERMINAL_STATUSES: readonly JobStatus[] = [
  'ready',
  'needs_input',
  'refused',
  'failed',
];

export const generationViewSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  status: z.enum(JOB_STATUSES),
  /** Uzbek questions when needs_input, otherwise empty. */
  questionsUz: z.array(z.string()),
  /** The Uzbek explanation when refused. Never a provider message (spec §9). */
  messageUz: z.string().nullable(),
  /** A spec §9 code the web app translates. Never raw provider text. */
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});
export type GenerationView = z.infer<typeof generationViewSchema>;

/**
 * Present only on a ready generation. This is the thing the seller paid for.
 *
 * `result` is the real §26 schema, not `z.unknown()`. It was unknown first, and that
 * left `"result": {}` in the contract — so the generated client (D-031) typed the ad
 * package as `any` on the one screen P5 exists to render: the concept, the Uzbek shot
 * plan and the prompt. That is the T-09 defect again, on the most important payload in
 * the app.
 *
 * The shape is the ai module's, so it is imported rather than restated and cannot drift
 * from what the validators actually enforce.
 */
export const adPackageViewSchema = z.object({
  generationId: z.uuid(),
  promptEn: z.string(),
  result: generationResultSchema,
  createdAt: z.iso.datetime(),
});
export type AdPackageView = z.infer<typeof adPackageViewSchema>;

export const generationDetailSchema = generationViewSchema.extend({
  package: adPackageViewSchema.nullable(),
});
export type GenerationDetail = z.infer<typeof generationDetailSchema>;

export const acceptedGenerationSchema = z.object({
  generationId: z.uuid(),
  status: z.enum(JOB_STATUSES),
  /** True when a §29 cache hit answered without a model call or a credit. */
  fromCache: z.boolean(),
  questionsUz: z.array(z.string()),
});
export type AcceptedGeneration = z.infer<typeof acceptedGenerationSchema>;

/** What the worker process needs from the module that owns the jobs. */
export const GENERATION_RUNNER = Symbol('GENERATION_RUNNER');

export interface GenerationRunner {
  /**
   * Begins consuming jobs and sweeping expired leases. Called by the WORKER entrypoint
   * only — the api process registers the module for its routes but must never start the
   * processor.
   */
  start(): void;
  runOne(generationId: string): Promise<void>;
  sweepExpired(): Promise<number>;
}
