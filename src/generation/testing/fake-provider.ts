import {
  ProviderError,
  type AiProvider,
  type GenerationResult,
  type ProviderErrorCode,
  type ProviderRequest,
  type ProviderResponse,
} from '../../ai/public/provider.port';

/**
 * The provider every automated test in P4 runs against.
 *
 * Spec §11 forbids live AI calls in CI, and a recorded response cannot be made to time
 * out or to arrive after its lease expired on demand — which is exactly what the
 * late-success race needs. So the fake is scripted rather than replayed.
 */
export type FakeBehaviour =
  | { kind: 'ready' }
  | { kind: 'needs_input'; questions: string[] }
  | { kind: 'refused'; messageUz: string }
  /** Fails the validators, forcing the one repair attempt P1 allows. */
  | { kind: 'malformed' }
  | { kind: 'repair-then-ready' }
  | { kind: 'error'; code: ProviderErrorCode }
  /** Returns only after the lease has expired. The late-success race lives here. */
  | { kind: 'hang'; ms: number };

export interface FakeProvider extends AiProvider {
  readonly calls: ProviderRequest[];
  behave(behaviour: FakeBehaviour): void;
}

/**
 * A valid §26 envelope, shaped like the gpt-5.5 output P1 actually produced, so the
 * validators are exercised against something the model really returns rather than
 * something built to pass them.
 */
export function readyResult(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    status: 'ready',
    questionsUz: [],
    messageUz: null,
    product: {
      category: 'Krossovka',
      observedDetails: ['Bej trikotaj ust qism', 'Oq rezina taglik'],
      confirmedClaims: [],
      unknownDetails: ['Ichki material'],
      referenceConflicts: [],
      fidelityConstraints: ['Taglik rangi saqlansin', 'Logotip qo‘shilmasin'],
    },
    concept: {
      titleUz: 'Kun bo‘yi yengil qadam',
      rationaleUz: 'Mahsulotning yengilligini harakat orqali ko‘rsatadi.',
      formatId: 'product-film',
      hookUz: 'Yengillikni his qiling',
      ctaUz: 'Hoziroq buyurtma bering',
    },
    target: { targetId: 'google-flow', durationSeconds: 10, aspectRatio: '9:16' },
    shots: [
      { startSeconds: 0, endSeconds: 4, descriptionUz: 'Krossovka aylanadi.', cameraUz: 'Sekin push-in' },
      { startSeconds: 4, endSeconds: 10, descriptionUz: 'Taglik ko‘rinadi.', cameraUz: 'Pastdan yuqoriga' },
    ],
    promptEn:
      'Use the supplied product reference as the single visual source of truth. The camera ' +
      'begins with a slow push-in on the knitted upper as soft directional light rakes across ' +
      'the surface, then rises to reveal the outsole without altering its colour or pattern.',
    assumptionsUz: [],
    reviewNotesUz: [],
    ...overrides,
  };
}

/** A result that passes the schema but fails a deterministic validator: the timeline gaps. */
function malformedResult(): GenerationResult {
  return readyResult({
    shots: [
      { startSeconds: 3, endSeconds: 5, descriptionUz: 'Bo‘shliq bor.', cameraUz: 'Statik' },
    ],
  });
}

export function createFakeProvider(costPerCall = 0.01): FakeProvider {
  const calls: ProviderRequest[] = [];
  let behaviour: FakeBehaviour = { kind: 'ready' };

  return {
    name: 'fake',
    calls,
    behave(next: FakeBehaviour): void {
      behaviour = next;
    },
    estimateCostUsd: () => costPerCall,
    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      calls.push(request);

      // Captured per call: `behaviour` is a mutable closure variable that behave() can
      // reassign, so TypeScript drops the narrowing across the await in the 'hang' arm.
      const current = behaviour;

      const usage = { inputTokens: 1200, outputTokens: 600, estimatedCostUsd: costPerCall };
      const respond = (result: GenerationResult): ProviderResponse => ({
        result,
        usage,
        requestId: `fake_${String(calls.length)}`,
      });

      switch (current.kind) {
        case 'ready':
          return respond(readyResult());

        case 'needs_input':
          return respond(
            readyResult({
              status: 'needs_input',
              questionsUz: current.questions,
              concept: null,
              target: null,
              shots: [],
              promptEn: null,
            }),
          );

        case 'refused':
          return respond(
            readyResult({
              status: 'refused',
              messageUz: current.messageUz,
              concept: null,
              target: null,
              shots: [],
              promptEn: null,
            }),
          );

        case 'malformed':
          return respond(malformedResult());

        case 'repair-then-ready':
          // `repairErrors` is present only on the second call, which is how P1's
          // generateAdPackage signals it is repairing.
          return respond(request.repairErrors ? readyResult() : malformedResult());

        case 'error':
          throw new ProviderError(current.code, `fake provider: ${current.code}`);

        case 'hang':
          await new Promise((resolve) => setTimeout(resolve, current.ms));
          return respond(readyResult());
      }
    },
  };
}
