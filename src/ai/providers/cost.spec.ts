import { describe, expect, it } from 'vitest';
import { costUsd, FALLBACK_PRICING, isPricingKnown, pricingFor } from './cost';

describe('model pricing', () => {
  it('prices gpt-5.5 at its published rate, not the deliberately high fallback (D-097)', () => {
    expect(isPricingKnown('gpt-5.5')).toBe(true);
    expect(pricingFor('gpt-5.5')).toEqual({ inputPerMillion: 5, outputPerMillion: 30 });
  });

  it('costs a typical v3 generation at about $0.17', () => {
    // 20:28 on 2026-09-13: 4,270 input and 5,254 output tokens.
    expect(costUsd('gpt-5.5', 4270, 5254)).toBeCloseTo(0.17897, 5);
  });

  it('still falls back high for a model nobody priced', () => {
    expect(isPricingKnown('gpt-9-unpriced')).toBe(false);
    expect(pricingFor('gpt-9-unpriced')).toBe(FALLBACK_PRICING);
  });
});
