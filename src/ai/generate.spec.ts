import { describe, expect, it } from 'vitest';
import type { Brief } from './public/brief.schema';
import type { GenerationResult } from './public/result.schema';
import {
  ProviderError,
  type AiProvider,
  type ProviderRequest,
  type ProviderResponse,
} from './public/provider.port';
import { DEFAULT_TARGET_ID, findTarget } from './targets/targets';
import { createSpendTracker, generateAdPackage, SpendCapExceededError } from './generate';

const target = findTarget(DEFAULT_TARGET_ID);
if (!target) throw new Error('launch target missing');

const brief: Brief = {
  productName: 'Termos 500ml',
  description: 'Po‘lat termos.',
  goal: 'sales',
  formatId: 'product-film',
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 8,
  audience: null,
  confirmedClaims: [],
  offer: null,
  galleryInspirationId: null,
};

const englishPrompt =
  'Use the supplied product reference as the single visual source of truth for this commercial. ' +
  'The camera begins with a slow push-in on the bottle as soft light rakes across the surface.';

function goodResult(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    status: 'ready',
    questionsUz: [],
    messageUz: null,
    product: {
      category: 'Termos',
      observedDetails: ['Po‘lat korpus'],
      confirmedClaims: [],
      unknownDetails: [],
      referenceConflicts: [],
      fidelityConstraints: ['Qopqoq saqlansin'],
    },
    concept: {
      titleUz: 'Kun bo‘yi issiq',
      rationaleUz: 'Foydani ko‘rsatadi.',
      formatId: 'product-film',
      hookUz: 'Bug‘',
      ctaUz: 'Buyurtma bering',
    },
    target: { targetId: 'google-flow', durationSeconds: 8, aspectRatio: '9:16' },
    shots: [{ startSeconds: 0, endSeconds: 8, descriptionUz: 'Aylanadi.', cameraUz: 'Push-in' }],
    promptEn: englishPrompt,
    assumptionsUz: [],
    reviewNotesUz: [],
    ...overrides,
  };
}

const badTimeline = goodResult({
  shots: [{ startSeconds: 2, endSeconds: 6, descriptionUz: 'Aylanadi.', cameraUz: 'Push-in' }],
});

function fakeProvider(
  answers: (GenerationResult | ProviderError)[],
  costPerCall = 0.01,
): AiProvider & { calls: ProviderRequest[] } {
  const calls: ProviderRequest[] = [];

  return {
    name: 'fake',
    calls,
    estimateCostUsd: () => costPerCall,
    generate: (request: ProviderRequest): Promise<ProviderResponse> => {
      calls.push(request);
      const answer = answers[calls.length - 1];

      if (answer === undefined) throw new Error('provider called more times than scripted');
      if (answer instanceof ProviderError) return Promise.reject(answer);

      return Promise.resolve({
        result: answer,
        requestId: `req_${String(calls.length)}`,
        usage: { inputTokens: 1000, outputTokens: 500, estimatedCostUsd: costPerCall },
      });
    },
  };
}

const input = { brief, target, images: [], inspiration: null, model: 'gpt-4.1-mini' };

function run(provider: AiProvider, capUsd = 1): ReturnType<typeof generateAdPackage> {
  return generateAdPackage(input, { provider, spend: createSpendTracker(capUsd) });
}

describe('a clean first answer', () => {
  it('succeeds without a repair call', async () => {
    const provider = fakeProvider([goodResult()]);
    const outcome = await run(provider);

    expect(outcome.status).toBe('ok');
    expect(provider.calls).toHaveLength(1);
  });

  it('stamps provenance from the server, not from the model', async () => {
    const outcome = await run(fakeProvider([goodResult()]));

    if (outcome.status !== 'ok') throw new Error('expected ok');
    expect(outcome.envelope.promptVersion).toBe('ad-director-v3');
    expect(outcome.envelope.provider).toBe('fake');
    expect(outcome.envelope.model).toBe('gpt-4.1-mini');
    expect(outcome.envelope.targetConfigVersion).toBe(target.version);
    expect(outcome.envelope.attempts).toBe(1);
  });

  it('surfaces warnings without failing', async () => {
    const uzbekish = 'Mahsulot aylanadi va yorugʻlik sekin tushadi '.repeat(10);
    const outcome = await run(fakeProvider([goodResult({ promptEn: uzbekish })]));

    expect(outcome.status).toBe('ok');
    if (outcome.status !== 'ok') return;
    expect(outcome.warnings.map((w) => w.code)).toContain('PROMPT_MAY_NOT_BE_ENGLISH');
  });
});

describe('the repair call (source 01 §28)', () => {
  it('repairs exactly once when validation fails', async () => {
    const provider = fakeProvider([badTimeline, goodResult()]);
    const outcome = await run(provider);

    expect(outcome.status).toBe('ok');
    expect(provider.calls).toHaveLength(2);
  });

  it('feeds the validator errors into the repair, naming the field', async () => {
    const provider = fakeProvider([badTimeline, goodResult()]);
    await run(provider);

    const repair = provider.calls[1];
    expect(repair?.repairErrors?.join(' ')).toContain('shots');
  });

  it('resends the images on the repair, so the rewrite still sees the product', async () => {
    const images = [{ bytes: Buffer.from('x'), mimeType: 'image/jpeg' as const }];
    const provider = fakeProvider([badTimeline, goodResult()]);

    await generateAdPackage(
      { ...input, images },
      { provider, spend: createSpendTracker(1) },
    );

    expect(provider.calls[1]?.images).toHaveLength(1);
  });

  it('stops after a second failure rather than looping', async () => {
    const provider = fakeProvider([badTimeline, badTimeline]);
    const outcome = await run(provider);

    expect(outcome.status).toBe('failed');
    expect(provider.calls).toHaveLength(2);
  });

  it('keeps both attempts’ errors, so a repair failure is not debugged blind', async () => {
    const outcome = await run(fakeProvider([badTimeline, badTimeline]));

    if (outcome.status !== 'failed') throw new Error('expected failure');
    expect(outcome.firstAttemptErrors.length).toBeGreaterThan(0);
    expect(outcome.repairErrors.length).toBeGreaterThan(0);
  });

  it('does not report success when a repair answers needs_input instead', async () => {
    const dodge = goodResult({
      status: 'needs_input',
      promptEn: null,
      concept: null,
      shots: [],
      questionsUz: ['Qaysi rang?'],
      target: null,
    });
    const outcome = await run(fakeProvider([badTimeline, dodge]));

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.code).toBe('AI_REPAIR_CHANGED_STATUS');
  });

  it('keeps the original errors when the repair call itself fails', async () => {
    const provider = fakeProvider([badTimeline, new ProviderError('AI_TIMEOUT', 'too slow')]);
    const outcome = await run(provider);

    if (outcome.status !== 'failed') throw new Error('expected failure');
    expect(outcome.code).toBe('AI_TIMEOUT');
    expect(outcome.firstAttemptErrors.length).toBeGreaterThan(0);
  });

  it('accepts a first answer that is legitimately needs_input, with no repair', async () => {
    const asking = goodResult({
      status: 'needs_input',
      promptEn: null,
      concept: null,
      shots: [],
      questionsUz: ['Ikki xil variant bormi?'],
      target: null,
    });
    const provider = fakeProvider([asking]);
    const outcome = await run(provider);

    expect(outcome.status).toBe('ok');
    expect(provider.calls).toHaveLength(1);
  });
});

describe('provider errors', () => {
  it.each([
    ['AI_TIMEOUT', 'timed out'],
    ['AI_REFUSED', 'refused'],
    ['AI_MALFORMED', 'bad json'],
    ['AI_TRUNCATED', 'cut short'],
  ])('maps %s through without a repair attempt', async (code, message) => {
    const provider = fakeProvider([new ProviderError(code as 'AI_TIMEOUT', message)]);
    const outcome = await run(provider);

    expect(outcome.status).toBe('failed');
    if (outcome.status !== 'failed') return;
    expect(outcome.code).toBe(code);
    expect(provider.calls).toHaveLength(1);
  });
});

describe('the spend cap', () => {
  it('refuses before the call, not after the money is gone', async () => {
    const provider = fakeProvider([goodResult()], 5);
    const spend = createSpendTracker(1);

    await expect(generateAdPackage(input, { provider, spend })).rejects.toBeInstanceOf(
      SpendCapExceededError,
    );
    expect(provider.calls).toHaveLength(0);
  });

  it('counts the repair call against the cap too', async () => {
    // Cap allows one call at 0.6 but not two.
    const provider = fakeProvider([badTimeline, goodResult()], 0.6);
    const spend = createSpendTracker(1);

    await expect(generateAdPackage(input, { provider, spend })).rejects.toBeInstanceOf(
      SpendCapExceededError,
    );
    expect(provider.calls).toHaveLength(1);
  });

  it('records what was actually spent, not what was estimated', async () => {
    const spend = createSpendTracker(1);
    await generateAdPackage(input, { provider: fakeProvider([goodResult()], 0.02), spend });

    expect(spend.spentUsd).toBeCloseTo(0.02, 6);
  });

  it('does not count a failed call as spend it cannot verify', async () => {
    const spend = createSpendTracker(1);
    await generateAdPackage(input, {
      provider: fakeProvider([new ProviderError('AI_TIMEOUT', 'slow')]),
      spend,
    });

    expect(spend.spentUsd).toBe(0);
  });
});

describe('the live-call guard', () => {
  it('blocks a request to a provider host from inside a test', async () => {
    await expect(fetch('https://api.openai.com/v1/responses')).rejects.toThrow(/Blocked a live/);
  });
});
