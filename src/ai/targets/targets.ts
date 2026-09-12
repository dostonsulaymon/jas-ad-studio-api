import { videoTargetSchema, type VideoTarget } from './target.schema';

/**
 * D-046: the 1,024-token ceiling recorded in D-012 was read off a model page and never
 * tested. Doston has since run prompts of 2,000-4,000 words through the real generator
 * with no truncation, so the documented figure does not describe the tool we actually
 * use. `maxPromptTokens` now records what has been observed to work rather than what a
 * page claimed, and the length validator only warns.
 *
 * `tokensPerWord` was measured over 27 generated prompts in Part 8a: median 1.188, p95
 * 1.221. 1.4 is that p95 plus headroom, since it is GPT's tokenizer standing in for the
 * video generator's.
 *
 * `provisional` stays true until the generator's own mode, durations, aspect ratios and
 * reference rules are confirmed from a real run (D-013).
 */
const FLOW_VEO_31 = {
  id: 'flow-veo-3.1',
  version: 4,
  sourceUrl: 'https://deepmind.google/models/veo/',
  checkedAt: '2026-09-11',
  provisional: true,

  maxPromptTokens: 6000,
  tokensPerWord: 1.4,
  maxWords: 4000,
  maxChars: 30000,
  recommendedWords: 2400,

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
