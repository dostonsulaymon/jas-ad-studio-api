/**
 * The ai module's published entry point (R-7).
 *
 * P1 built `generateAdPackage` as a library for the CLI, so it lived in `ai/generate.ts`
 * with no port and no Nest module — fine while only a script called it. P4's worker is
 * the first caller in another module, and the boundary lint correctly refused the direct
 * import, so the contract lives here and `AiModule` provides it.
 *
 * The target is named by id, not passed in: resolving it is the ai module's business, and
 * the worker has no reason to know what a video target is.
 */
import type { Brief } from './brief.schema';
import type { GenerationResult } from './result.schema';
import type { ReferenceImage } from './provider.port';
import type { ValidationIssue } from './validation.types';

/**
 * The only part of a gallery example that may ever reach the model (source 01 §13).
 *
 * It lives here, in the ai module's port, rather than in the gallery's: `ai` is the
 * lower layer and owns the shape of its own input, so the dependency points
 * gallery -> ai and `ai` stays free of any product surface. The gallery imports this
 * type to build its return value, which is legal under R-7 and the right direction.
 *
 * Six fields, and no room for a seventh that happens to carry prose.
 */
export interface GalleryInspiration {
  id: string;
  environment: string;
  lighting: string;
  cameraLanguage: string;
  pacing: string;
  mood: string;
}

export interface AdGeneratorInput {
  brief: Brief;
  targetId: string;
  images: ReferenceImage[];
  model: string;
  /**
   * Resolved server-side from `brief.galleryInspirationId`, never sent by a client —
   * otherwise a seller smuggles arbitrary instructions into the prompt (§25).
   */
  inspiration: GalleryInspiration | null;
}

export interface AdGeneratorUsage {
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  provider: string;
  model: string;
  promptVersion: string;
}

export type AdGeneratorOutcome =
  | {
      status: 'ok';
      result: GenerationResult;
      usage: AdGeneratorUsage;
      warnings: ValidationIssue[];
      /** What the first attempt got wrong, when a repair was needed. Empty otherwise. */
      repairedFrom: ValidationIssue[];
    }
  | {
      status: 'failed';
      /** A spec §9 code. Never a provider message — that stays in the worker's log. */
      code: string;
      message: string;
      firstAttemptErrors: ValidationIssue[];
      repairErrors: ValidationIssue[];
    };

/**
 * D-013/D-050: Google Flow is the only launch target. Published here because a caller
 * has to name a target and must not reach into `ai/targets/` to find one (R-7).
 */
export const LAUNCH_TARGET_ID = 'google-flow';

export const AD_GENERATOR = Symbol('AD_GENERATOR');

export interface AdGenerator {
  /** One call, then at most one repair (source 01 §28). Never inside a transaction. */
  generate(input: AdGeneratorInput): Promise<AdGeneratorOutcome>;
}
