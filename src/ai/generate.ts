import { toStrictJsonSchema } from './public/strict-json-schema';
import { generationResultSchema, type GenerationEnvelope } from './public/result.schema';
import {
  ProviderError,
  type AiProvider,
  type Brief,
  type ProviderRequest,
  type ProviderResponse,
  type ReferenceImage,
} from './public/provider.port';
import { AD_DIRECTOR_PROMPT_VERSION } from './prompt/ad-director.v2';
import { buildDataBlock, buildSystemPrompt } from './prompt/assemble';
import { formatForBrief } from './formats/formats';
import type { GalleryInspiration } from './public/generator.port';
import type { VideoTarget } from './targets/target.schema';
import { normalizeResult, validateGeneration, type ValidationIssue } from './validation/validators';

export class SpendCapExceededError extends Error {
  readonly code = 'SPEND_CAP_REACHED';
}

export interface SpendTracker {
  /** Throws before the call rather than after, so the cap cannot be discovered too late. */
  reserve(estimateUsd: number): void;
  settle(actualUsd: number): void;
  readonly spentUsd: number;
}

export function createSpendTracker(capUsd: number): SpendTracker {
  let spent = 0;
  let reserved = 0;

  return {
    reserve(estimateUsd: number): void {
      if (spent + reserved + estimateUsd > capUsd) {
        throw new SpendCapExceededError(
          `This call could take the run to $${(spent + reserved + estimateUsd).toFixed(4)}, over the $${capUsd.toFixed(2)} cap`,
        );
      }
      reserved += estimateUsd;
    },
    settle(actualUsd: number): void {
      reserved = 0;
      spent += actualUsd;
    },
    get spentUsd(): number {
      return spent;
    },
  };
}

export interface GenerateInput {
  brief: Brief;
  target: VideoTarget;
  images: ReferenceImage[];
  inspiration: GalleryInspiration | null;
  model: string;
}

export type GenerateOutcome =
  | {
      status: 'ok';
      envelope: GenerationEnvelope;
      warnings: ValidationIssue[];
      /** What the first attempt got wrong, when a repair was needed. Empty otherwise. */
      repairedFrom: ValidationIssue[];
    }
  | {
      status: 'failed';
      code: string;
      message: string;
      /** Both attempts' problems, or a repair failure is debugged blind. */
      firstAttemptErrors: ValidationIssue[];
      repairErrors: ValidationIssue[];
    };

export interface GenerateDeps {
  provider: AiProvider;
  spend: SpendTracker;
}

/**
 * One call, then at most one repair (source 01 §28). There is no retry loop: a second
 * failure is terminal.
 */
export async function generateAdPackage(
  input: GenerateInput,
  deps: GenerateDeps,
): Promise<GenerateOutcome> {
  const request: ProviderRequest = {
    systemPrompt: buildSystemPrompt(input),
    dataBlock: buildDataBlock(input),
    // The repair resends the images: a repair that rewrites the prompt without seeing the
    // product is a product-lock risk, and it is capped at one attempt either way (Q-P1-5).
    images: input.images,
    jsonSchema: toStrictJsonSchema(generationResultSchema),
    model: input.model,
  };

  const first = await attempt(request, input, deps);

  if (first.kind === 'error') {
    return { status: 'failed', code: first.code, message: first.message, firstAttemptErrors: [], repairErrors: [] };
  }

  if (first.report.ok) {
    return {
      status: 'ok',
      envelope: envelope(input, first, 1, deps.provider.name),
      warnings: first.report.warnings,
      repairedFrom: [],
    };
  }

  const repair = await attempt(
    { ...request, repairErrors: first.report.errors.map(describe) },
    input,
    deps,
  );

  if (repair.kind === 'error') {
    return {
      status: 'failed',
      code: repair.code,
      message: repair.message,
      firstAttemptErrors: first.report.errors,
      repairErrors: [],
    };
  }

  if (!repair.report.ok) {
    return {
      status: 'failed',
      code: 'AI_VALIDATION_FAILED',
      message: 'The repaired answer still failed validation',
      firstAttemptErrors: first.report.errors,
      repairErrors: repair.report.errors,
    };
  }

  // A repair may legitimately answer needs_input, which is schema-valid and passes every
  // validator. Reporting that as success would hide that the asked-for work never
  // happened, so the change of status is surfaced rather than swallowed.
  if (repair.result.status !== first.result.status && first.result.status === 'ready') {
    return {
      status: 'failed',
      code: 'AI_REPAIR_CHANGED_STATUS',
      message: `The repair answered ${repair.result.status} instead of correcting the package`,
      firstAttemptErrors: first.report.errors,
      repairErrors: [],
    };
  }

  return {
    status: 'ok',
    envelope: envelope(input, repair, 2, deps.provider.name),
    warnings: repair.report.warnings,
    repairedFrom: first.report.errors,
  };
}

type Attempt =
  | {
      kind: 'answered';
      result: ReturnType<typeof normalizeResult>;
      report: ReturnType<typeof validateGeneration>;
      response: ProviderResponse;
    }
  | { kind: 'error'; code: string; message: string };

async function attempt(
  request: ProviderRequest,
  input: GenerateInput,
  deps: GenerateDeps,
): Promise<Attempt> {
  deps.spend.reserve(deps.provider.estimateCostUsd(request));

  let response: ProviderResponse;
  try {
    response = await deps.provider.generate(request);
  } catch (cause) {
    // A failed call may still have been billed, so the reservation is settled either way.
    deps.spend.settle(0);

    if (cause instanceof ProviderError) {
      return { kind: 'error', code: cause.code, message: cause.message };
    }
    throw cause;
  }

  deps.spend.settle(response.usage.estimatedCostUsd);

  const result = normalizeResult(response.result);

  return {
    kind: 'answered',
    result,
    response,
    report: validateGeneration(result, {
      target: input.target,
      format: formatForBrief(input.brief),
      requestedDurationSeconds: input.brief.durationSeconds,
      requestedAspectRatio: input.brief.aspectRatio,
    }),
  };
}

function envelope(
  input: GenerateInput,
  attempt: Extract<Attempt, { kind: 'answered' }>,
  attempts: number,
  provider: string,
): GenerationEnvelope {
  return {
    promptVersion: AD_DIRECTOR_PROMPT_VERSION,
    provider,
    model: input.model,
    targetId: input.target.id,
    targetConfigVersion: input.target.version,
    requestId: attempt.response.requestId,
    galleryInspirationId: input.inspiration?.id ?? null,
    usage: attempt.response.usage,
    attempts,
    result: attempt.result,
  };
}

function describe(issue: ValidationIssue): string {
  return `${issue.field}: ${issue.message}`;
}
