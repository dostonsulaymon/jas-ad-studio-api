import { describe, expect, it } from 'vitest';
import { DEFAULT_TARGET_ID, findTarget, listTargets } from './targets';
import { countWords, estimateTokens, videoTargetSchema } from './target.schema';

const valid = {
  id: 'test-target',
  version: 1,
  sourceUrl: 'https://example.com/model',
  checkedAt: '2026-09-11',
  provisional: false,
  maxPromptTokens: 1024,
  tokensPerWord: 1.6,
  maxWords: 640,
  maxChars: 4500,
  recommendedWords: 500,
  beats: { default: 3, max: 4 },
  maxReferenceImages: 4,
  highEnergyCameraAllowed: true,
};

function parse(overrides: Record<string, unknown>): ReturnType<typeof videoTargetSchema.safeParse> {
  return videoTargetSchema.safeParse({ ...valid, ...overrides });
}

describe('videoTargetSchema', () => {
  it('accepts a well-formed target', () => {
    expect(parse({}).success).toBe(true);
  });

  it('rejects an unknown property, so a typo is never silently ignored', () => {
    expect(parse({ maxTokens: 1024 }).success).toBe(false);
  });

  it('rejects beats.default above beats.max', () => {
    const result = parse({ beats: { default: 5, max: 4 } });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('beats.default must not exceed');
  });

  it('has no duration or aspect-ratio list, since the seller picks those in Flow (D-050)', () => {
    const target = findTarget(DEFAULT_TARGET_ID);

    expect(target).not.toHaveProperty('durations');
    expect(target).not.toHaveProperty('aspectRatios');
  });

  it('rejects a missing version', () => {
    const withoutVersion: Record<string, unknown> = { ...valid };
    delete withoutVersion['version'];

    expect(videoTargetSchema.safeParse(withoutVersion).success).toBe(false);
  });

  it('rejects a checkedAt that is not an ISO date', () => {
    expect(parse({ checkedAt: '11/09/2026' }).success).toBe(false);
  });

  it('rejects a target that would send no photos', () => {
    expect(parse({ maxReferenceImages: 0 }).success).toBe(false);
  });
});

describe('the shipped registry', () => {
  it('parses every target at import time', () => {
    expect(listTargets()).toHaveLength(1);
  });

  it('finds the launch target, which is Flow itself rather than a model in it (D-050)', () => {
    const target = findTarget(DEFAULT_TARGET_ID);

    expect(target?.id).toBe('google-flow');
    expect(target?.maxPromptTokens).toBe(6000);
  });

  it('returns undefined for an unknown target rather than a default', () => {
    expect(findTarget('flow-veo-3.1')).toBeUndefined();
  });

});

describe('token estimation', () => {
  it('counts words across any whitespace', () => {
    expect(countWords('a  b\nc\td')).toBe(4);
  });

  it('counts an empty or blank string as zero words', () => {
    expect(countWords('   ')).toBe(0);
  });

  it('rounds the token estimate up, never down', () => {
    expect(estimateTokens('one two three', 1.6)).toBe(5);
  });
});
