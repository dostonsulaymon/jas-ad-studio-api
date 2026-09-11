import { videoTargetSchema, type VideoTarget } from './target.schema';

/**
 * D-013: one target at launch. Every value here is reviewed like code, and changing one
 * is a deliberate edit rather than a runtime setting (D-012).
 *
 * `tokensPerWord` is our own estimator, not Google's tokenizer, which is not published.
 * 1.6 is deliberately pessimistic: ordinary English prose runs about 1.3, and
 * cinematographic compounds, hyphenation and punctuation push it higher. Part 8a
 * replaces it with the p95 measured across the real generated corpus, and `maxWords` is
 * re-derived from `maxPromptTokens` with that figure.
 *
 * `provisional` is true until Jakhongir confirms the Flow mode, durations, aspect ratios
 * and reference rules from his own test runs (D-013, plan Part 0).
 */
const FLOW_VEO_31 = {
  id: 'flow-veo-3.1',
  version: 1,
  sourceUrl: 'https://deepmind.google/models/veo/',
  checkedAt: '2026-09-11',
  provisional: true,

  maxPromptTokens: 1024,
  tokensPerWord: 1.6,
  maxWords: 640,
  maxChars: 4500,
  recommendedWords: 500,

  beats: { default: 3, max: 4 },

  durations: [8],
  aspectRatios: ['9:16', '16:9'],
  referenceImages: { supported: true, max: 4 },
  referenceMode: 'frames-to-video',
  highEnergyCameraAllowed: true,
} as const satisfies Record<string, unknown>;

const REGISTRY: ReadonlyMap<string, VideoTarget> = new Map(
  [FLOW_VEO_31].map((entry) => {
    const target = videoTargetSchema.parse(entry);
    return [target.id, target];
  }),
);

export const DEFAULT_TARGET_ID = FLOW_VEO_31.id;

export function listTargets(): VideoTarget[] {
  return [...REGISTRY.values()];
}

export function findTarget(id: string): VideoTarget | undefined {
  return REGISTRY.get(id);
}
