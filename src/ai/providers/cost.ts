export interface ModelPricing {
  /** USD per million tokens. */
  inputPerMillion: number;
  outputPerMillion: number;
}

/**
 * Prices are configuration, not knowledge: they change, and a wrong figure here silently
 * mis-reports every cost and mis-sizes the spend cap. Part 5b records the real numbers
 * from a live call, and any model used in the Part 8a sweep must be listed.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // developers.openai.com/api/docs/pricing, read 2026-09-13, standard tier, <272K context.
  // Cached input ($0.50) is not modelled, so this errs slightly high.
  'gpt-5.5': { inputPerMillion: 5, outputPerMillion: 30 },
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

/**
 * Used when a model is not in the table above. Deliberately expensive: an unpriced model
 * must never make a run look cheaper than it is, because the spend cap is computed from
 * these numbers. A reported cost carrying this fallback is an estimate, and
 * `isPricingKnown` says so.
 */
export const FALLBACK_PRICING: ModelPricing = { inputPerMillion: 15, outputPerMillion: 60 };

export function pricingFor(model: string): ModelPricing {
  return MODEL_PRICING[model] ?? FALLBACK_PRICING;
}

export function isPricingKnown(model: string): boolean {
  return model in MODEL_PRICING;
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = pricingFor(model);

  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}
