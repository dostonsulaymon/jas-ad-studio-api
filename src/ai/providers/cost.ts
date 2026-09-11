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
  'gpt-4.1': { inputPerMillion: 2, outputPerMillion: 8 },
  'gpt-4.1-mini': { inputPerMillion: 0.4, outputPerMillion: 1.6 },
  'gpt-4o': { inputPerMillion: 2.5, outputPerMillion: 10 },
  'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.6 },
};

export function pricingFor(model: string): ModelPricing | undefined {
  return MODEL_PRICING[model];
}

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = pricingFor(model);
  if (!pricing) return 0;

  return (
    (inputTokens / 1_000_000) * pricing.inputPerMillion +
    (outputTokens / 1_000_000) * pricing.outputPerMillion
  );
}
