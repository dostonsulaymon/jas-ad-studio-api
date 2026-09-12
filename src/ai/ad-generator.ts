import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { createSpendTracker, generateAdPackage, SpendCapExceededError } from './generate';
import { AI_PROVIDER, type AiProvider } from './public/provider.port';
import type {
  AdGenerator,
  AdGeneratorInput,
  AdGeneratorOutcome,
} from './public/generator.port';
import { findTarget } from './targets/targets';

/**
 * Wraps P1's pure `generateAdPackage` as the injectable the worker consumes, so the
 * function itself stays testable without Nest and the boundary stays honest (R-7).
 */
@Injectable()
export class AdGeneratorService implements AdGenerator {
  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AiProvider,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async generate(input: AdGeneratorInput): Promise<AdGeneratorOutcome> {
    const target = findTarget(input.targetId);
    if (!target) {
      return {
        status: 'failed',
        code: 'CONFIG_MISSING',
        message: `Unknown video target: ${input.targetId}`,
        firstAttemptErrors: [],
        repairErrors: [],
      };
    }

    const cap = this.config.get('DAILY_AI_SPEND_LIMIT_USD', { infer: true });

    let outcome;
    try {
      outcome = await generateAdPackage(
        { brief: input.brief, target, images: input.images, inspiration: null, model: input.model },
        { provider: this.provider, spend: createSpendTracker(cap) },
      );
    } catch (error) {
      // The per-call tracker refused before spending. It is our limit, not the seller's
      // fault, so it becomes a §9 code rather than an unhandled throw in the worker.
      if (error instanceof SpendCapExceededError) {
        return {
          status: 'failed',
          code: 'SPEND_CAP_REACHED',
          message: error.message,
          firstAttemptErrors: [],
          repairErrors: [],
        };
      }
      throw error;
    }

    if (outcome.status === 'failed') {
      return {
        status: 'failed',
        code: outcome.code,
        message: outcome.message,
        firstAttemptErrors: outcome.firstAttemptErrors,
        repairErrors: outcome.repairErrors,
      };
    }

    const { envelope } = outcome;
    return {
      status: 'ok',
      result: envelope.result,
      usage: {
        inputTokens: envelope.usage.inputTokens,
        outputTokens: envelope.usage.outputTokens,
        estimatedCostUsd: envelope.usage.estimatedCostUsd,
        provider: envelope.provider,
        model: envelope.model,
        promptVersion: envelope.promptVersion,
      },
      warnings: outcome.warnings,
      repairedFrom: outcome.repairedFrom,
    };
  }
}
