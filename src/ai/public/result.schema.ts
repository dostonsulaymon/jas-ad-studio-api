import { z } from 'zod';
import { ASPECT_RATIOS } from './video-format';
import { AD_STYLES } from './brief.schema';

/**
 * The model's output (source 01 §26), minus `editingAssets`: voiceover and overlay text
 * are deferred until after launch (D-017).
 *
 * Everything here is authored by the model and therefore untrusted. Provenance —
 * which model, which prompt version, what it cost — lives in GenerationEnvelope
 * below, stamped by the server. Source 01 §26: "Do not let the model author these as
 * trusted facts."
 */

const uzText = z.string().trim().min(1).max(400);
const uzLine = z.string().trim().min(1).max(200);

const productAnalysis = z
  .object({
    category: uzLine,
    observedDetails: z.array(uzLine).max(12),
    confirmedClaims: z.array(uzLine).max(10),
    unknownDetails: z.array(uzLine).max(12),
    referenceConflicts: z.array(uzLine).max(6),
    fidelityConstraints: z.array(uzLine).max(12),
  })
  .strict();

const concept = z
  .object({
    titleUz: uzLine,
    rationaleUz: uzText,
    style: z.enum(AD_STYLES),
    hookUz: uzLine,
    ctaUz: uzLine,
  })
  .strict();

/**
 * The model echoes the target it believes it wrote for. A validator compares this
 * against the target the server actually requested: a model that quietly renegotiates
 * its own duration is source 01 §51's "unsupported provider mode" hard failure.
 */
const targetEcho = z
  .object({
    targetId: z.string().min(1),
    durationSeconds: z.number().positive(),
    aspectRatio: z.enum(ASPECT_RATIOS),
  })
  .strict();

const shot = z
  .object({
    startSeconds: z.number().nonnegative(),
    endSeconds: z.number().positive(),
    descriptionUz: uzText,
    cameraUz: uzLine,
  })
  .strict();

export const GENERATION_STATUSES = ['ready', 'needs_input', 'refused'] as const;

export const generationResultSchema = z
  .object({
    status: z.enum(GENERATION_STATUSES),
    questionsUz: z.array(uzLine).max(2),
    messageUz: uzText.nullable(),
    product: productAnalysis,
    concept: concept.nullable(),
    target: targetEcho.nullable(),
    shots: z.array(shot).max(8),
    promptEn: z.string().trim().min(1).max(8000).nullable(),
    assumptionsUz: z.array(uzLine).max(8),
    reviewNotesUz: z.array(uzLine).max(8),
  })
  .strict();

export type GenerationResult = z.infer<typeof generationResultSchema>;
export type Shot = z.infer<typeof shot>;
export type Concept = z.infer<typeof concept>;

/**
 * Server-stamped provenance (source 01 §26). The model never writes any of it, and every
 * report and results table reads from here rather than from the model's own JSON.
 */
export const generationEnvelopeSchema = z
  .object({
    promptVersion: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    targetId: z.string().min(1),
    targetConfigVersion: z.number().int().positive(),
    requestId: z.string().min(1).nullable(),
    galleryInspirationId: z.string().min(1).nullable(),
    usage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        estimatedCostUsd: z.number().nonnegative(),
      })
      .strict(),
    attempts: z.number().int().positive(),
    result: generationResultSchema,
  })
  .strict();

export type GenerationEnvelope = z.infer<typeof generationEnvelopeSchema>;
