import { LAUNCH_TARGET_ID } from '../public/generator.port';
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
 * D-050: durations, aspect ratios and the reference mode are gone. The seller chooses
 * the model, the aspect ratio and the clip length inside Flow itself, so there is no
 * fixed capability set for us to hold them to. What stays here is what is genuinely
 * ours: how deep a prompt to ask for, how many beats, how many photos we send, and
 * whether the chosen style earns high-energy camera work.
 */
const GOOGLE_FLOW = {
  // Single source: the port publishes this id because callers outside the ai module have
  // to name a target, and two copies of the string would drift apart silently.
  id: LAUNCH_TARGET_ID,
  version: 5,
  sourceUrl: 'https://labs.google/flow',
  checkedAt: '2026-09-12',
  provisional: false,

  maxPromptTokens: 6000,
  tokensPerWord: 1.4,
  maxWords: 4000,
  maxChars: 30000,
  recommendedWords: 2400,

  beats: { default: 3, max: 4 },

  maxReferenceImages: 4,
  highEnergyCameraAllowed: true,
} as const satisfies Record<string, unknown>;

const REGISTRY: ReadonlyMap<string, VideoTarget> = new Map(
  [GOOGLE_FLOW].map((entry) => {
    const target = videoTargetSchema.parse(entry);
    return [target.id, target];
  }),
);

export const DEFAULT_TARGET_ID = GOOGLE_FLOW.id;

export function listTargets(): VideoTarget[] {
  return [...REGISTRY.values()];
}

export function findTarget(id: string): VideoTarget | undefined {
  return REGISTRY.get(id);
}
