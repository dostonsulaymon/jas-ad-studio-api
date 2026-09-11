import { describe, expect, it } from 'vitest';
import type { GenerationResult } from '../public/result.schema';
import { findTarget, DEFAULT_TARGET_ID } from '../targets/targets';
import { normalizeResult, validateGeneration } from './validators';
import { UZBEK_APOSTROPHE, englishFunctionWordRatio, normalizeUzbek } from './uzbek-text';

const target = findTarget(DEFAULT_TARGET_ID);
if (!target) throw new Error('launch target missing');

const context = {
  target,
  requestedDurationSeconds: 8,
  requestedAspectRatio: '9:16',
};

const englishPrompt =
  'Use the supplied product reference as the single visual source of truth for this commercial. ' +
  'The camera begins with a slow push-in on the bottle as soft light rakes across the surface, ' +
  'and the material finish is held in frame so that the shape and colour placement stay readable.';

function resultWith(overrides: Partial<GenerationResult> = {}): GenerationResult {
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
      fidelityConstraints: ['Qopqoq shakli saqlansin'],
    },
    concept: {
      titleUz: 'Kun bo‘yi issiq',
      rationaleUz: 'Asosiy foydani ko‘rsatadi.',
      style: 'clean-studio',
      hookUz: 'Bug‘ ko‘tariladi',
      ctaUz: 'Buyurtma bering',
    },
    target: { targetId: 'flow-veo-3.1', durationSeconds: 8, aspectRatio: '9:16' },
    shots: [
      { startSeconds: 0, endSeconds: 4, descriptionUz: 'Termos aylanadi.', cameraUz: 'Push-in' },
      { startSeconds: 4, endSeconds: 8, descriptionUz: 'Qopqoq ochiladi.', cameraUz: 'Makro' },
    ],
    promptEn: englishPrompt,
    assumptionsUz: [],
    reviewNotesUz: [],
    ...overrides,
  };
}

const codes = (result: GenerationResult): string[] =>
  validateGeneration(result, context).issues.map((issue) => issue.code);

describe('a well-formed result', () => {
  it('passes with no errors and no warnings', () => {
    const report = validateGeneration(resultWith(), context);

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });
});

describe('ready/needs_input/refused shape', () => {
  it('rejects ready without a concept', () => {
    expect(codes(resultWith({ concept: null }))).toContain('READY_NO_CONCEPT');
  });

  it('rejects ready without shots', () => {
    expect(codes(resultWith({ shots: [] }))).toContain('READY_NO_SHOTS');
  });

  it('rejects ready without a prompt', () => {
    expect(codes(resultWith({ promptEn: null }))).toContain('READY_NO_PROMPT');
  });

  it('rejects needs_input with no questions', () => {
    const result = resultWith({ status: 'needs_input', promptEn: null, questionsUz: [] });

    expect(codes(result)).toContain('NEEDS_INPUT_NO_QUESTIONS');
  });

  it('rejects needs_input that still carries a prompt', () => {
    const result = resultWith({ status: 'needs_input', questionsUz: ['Qaysi rang?'] });

    expect(codes(result)).toContain('NEEDS_INPUT_HAS_PROMPT');
  });

  it('accepts a well-formed needs_input', () => {
    const result = resultWith({
      status: 'needs_input',
      promptEn: null,
      concept: null,
      shots: [],
      questionsUz: ['Qaysi rang asosiy?'],
      messageUz: 'Rasmlar ikki xil variantni ko‘rsatmoqda.',
    });

    expect(validateGeneration(result, context).ok).toBe(true);
  });

  it('rejects a refusal that carries a prompt', () => {
    const result = resultWith({ status: 'refused', messageUz: 'Bajarib bo‘lmadi.' });

    expect(codes(result)).toContain('REFUSED_HAS_PROMPT');
  });
});

describe('target and capability (source 01 §50)', () => {
  it('rejects a model that renegotiated the duration', () => {
    const result = resultWith({
      target: { targetId: 'flow-veo-3.1', durationSeconds: 10, aspectRatio: '9:16' },
    });

    expect(codes(result)).toContain('DURATION_UNSUPPORTED');
  });

  it('rejects a model that swapped the aspect ratio for a supported but unrequested one', () => {
    const result = resultWith({
      target: { targetId: 'flow-veo-3.1', durationSeconds: 8, aspectRatio: '16:9' },
    });

    expect(codes(result)).toContain('ASPECT_RATIO_RENEGOTIATED');
  });

  it('rejects a model claiming a different target entirely', () => {
    const result = resultWith({
      target: { targetId: 'some-other-model', durationSeconds: 8, aspectRatio: '9:16' },
    });

    expect(codes(result)).toContain('TARGET_MISMATCH');
  });
});

describe('length, against both ceilings (D-012)', () => {
  it('rejects a prompt past the word ceiling', () => {
    expect(codes(resultWith({ promptEn: 'word '.repeat(target.maxWords + 1) }))).toContain(
      'PROMPT_TOO_LONG',
    );
  });

  it('accepts a prompt exactly at the word ceiling', () => {
    const atLimit = Array.from({ length: target.maxWords }, () => 'word').join(' ');

    expect(codes(resultWith({ promptEn: atLimit }))).not.toContain('PROMPT_TOO_LONG');
  });

  it('names the estimator in the token error, so it is never read as Veo’s own count', () => {
    const report = validateGeneration(
      resultWith({ promptEn: 'word '.repeat(target.maxWords + 200) }),
      context,
    );
    const tokenIssue = report.errors.find((issue) => issue.code === 'PROMPT_TOKEN_LIMIT');

    expect(tokenIssue?.message).toContain('estimated at');
  });

  it('rejects a prompt past the character ceiling even when the word count fits', () => {
    const fewLongWords = Array.from({ length: 10 }, () => 'x'.repeat(600)).join(' ');

    expect(codes(resultWith({ promptEn: fewLongWords }))).toContain('PROMPT_TOO_MANY_CHARS');
  });
});

describe('timeline', () => {
  it('rejects a first shot that does not start at zero', () => {
    const shots = [
      { startSeconds: 1, endSeconds: 4, descriptionUz: 'a', cameraUz: 'b' },
      { startSeconds: 4, endSeconds: 8, descriptionUz: 'c', cameraUz: 'd' },
    ];

    expect(codes(resultWith({ shots }))).toContain('TIMELINE_START');
  });

  it('rejects a last shot that does not reach the duration', () => {
    const shots = [{ startSeconds: 0, endSeconds: 6, descriptionUz: 'a', cameraUz: 'b' }];

    expect(codes(resultWith({ shots }))).toContain('TIMELINE_END');
  });

  it('accepts a last shot within floating-point tolerance of the duration', () => {
    const shots = [{ startSeconds: 0, endSeconds: 7.999, descriptionUz: 'a', cameraUz: 'b' }];

    expect(codes(resultWith({ shots }))).not.toContain('TIMELINE_END');
  });

  it('rejects overlapping shots', () => {
    const shots = [
      { startSeconds: 0, endSeconds: 5, descriptionUz: 'a', cameraUz: 'b' },
      { startSeconds: 3, endSeconds: 8, descriptionUz: 'c', cameraUz: 'd' },
    ];
    const report = validateGeneration(resultWith({ shots }), context);
    const issue = report.errors.find((i) => i.code === 'TIMELINE_DISCONTINUOUS');

    expect(issue?.message).toContain('overlaps');
  });

  it('rejects a gap between shots', () => {
    const shots = [
      { startSeconds: 0, endSeconds: 3, descriptionUz: 'a', cameraUz: 'b' },
      { startSeconds: 5, endSeconds: 8, descriptionUz: 'c', cameraUz: 'd' },
    ];
    const report = validateGeneration(resultWith({ shots }), context);
    const issue = report.errors.find((i) => i.code === 'TIMELINE_DISCONTINUOUS');

    expect(issue?.message).toContain('gap');
  });

  it('rejects a shot that ends before it starts', () => {
    const shots = [{ startSeconds: 0, endSeconds: 8, descriptionUz: 'a', cameraUz: 'b' },
      { startSeconds: 8, endSeconds: 8, descriptionUz: 'c', cameraUz: 'd' }];

    expect(codes(resultWith({ shots }))).toContain('SHOT_NOT_FORWARD');
  });

  it('accepts a single beat covering the whole duration', () => {
    const shots = [{ startSeconds: 0, endSeconds: 8, descriptionUz: 'a', cameraUz: 'b' }];

    expect(validateGeneration(resultWith({ shots }), context).ok).toBe(true);
  });

  it('rejects more beats than the target allows', () => {
    const shots = Array.from({ length: target.beats.max + 1 }, (_, i) => ({
      startSeconds: i,
      endSeconds: i + 1,
      descriptionUz: 'a',
      cameraUz: 'b',
    }));

    expect(codes(resultWith({ shots }))).toContain('TOO_MANY_BEATS');
  });
});

describe('content', () => {
  it('rejects an unfilled placeholder', () => {
    expect(codes(resultWith({ promptEn: `${englishPrompt} Show [PRODUCT] clearly.` }))).toContain(
      'PROMPT_PLACEHOLDER',
    );
  });

  it('rejects a brace template', () => {
    expect(codes(resultWith({ promptEn: `${englishPrompt} Show {{productName}}.` }))).toContain(
      'PROMPT_PLACEHOLDER',
    );
  });

  it.each([
    ['a voiceover', 'Add a warm voiceover in Uzbek.'],
    ['narration', 'A calm narration explains the benefit.'],
    ['subtitles', 'Burn subtitles along the lower third.'],
    ['on-screen text', 'Add on-screen text with the price.'],
    ['background music', 'Upbeat background music throughout.'],
  ])('rejects %s, which D-017 defers until after launch', (_label, sentence) => {
    expect(codes(resultWith({ promptEn: `${englishPrompt} ${sentence}` }))).toContain(
      'PROMPT_FORBIDDEN_DIRECTION',
    );
  });

  it('does not reject ordinary foley and room tone, which are the default audio', () => {
    const prompt = `${englishPrompt} Audio is subtle product foley and quiet room tone.`;

    expect(codes(resultWith({ promptEn: prompt }))).not.toContain('PROMPT_FORBIDDEN_DIRECTION');
  });
});

describe('language and script', () => {
  it('rejects Cyrillic in an Uzbek field (D-014)', () => {
    const result = resultWith({ assumptionsUz: ['Маҳсулот'] });

    expect(codes(result)).toContain('UZBEK_NOT_LATIN');
  });

  it('rejects Cyrillic in promptEn', () => {
    expect(codes(resultWith({ promptEn: `${englishPrompt} Продукт.` }))).toContain(
      'PROMPT_NOT_ENGLISH',
    );
  });

  it('warns, rather than erroring, when promptEn does not read as English', () => {
    // Over the 50-word floor: below it the ratio is too noisy to mean anything.
    const uzbek = 'Mahsulot aylanadi va yorugʻlik sekin tushadi '.repeat(10);
    const report = validateGeneration(resultWith({ promptEn: uzbek }), context);

    expect(report.warnings.map((w) => w.code)).toContain('PROMPT_MAY_NOT_BE_ENGLISH');
    expect(report.errors.map((e) => e.code)).not.toContain('PROMPT_MAY_NOT_BE_ENGLISH');
  });

  it('does not warn on a genuinely English prompt', () => {
    const report = validateGeneration(resultWith(), context);

    expect(report.warnings).toEqual([]);
  });

  it('ignores quoted spans when judging English, since spoken Uzbek stays untranslated', () => {
    const withQuote = `${englishPrompt} The actor says "Kun boʻyi issiq saqlaydi".`;
    const report = validateGeneration(resultWith({ promptEn: withQuote }), context);

    expect(report.warnings).toEqual([]);
  });
});

describe('the product analysis fields, which are Uzbek too', () => {
  it('normalises the apostrophe in fidelity constraints', () => {
    // The first live call returned "o'zgartirilmasligi" and "bo‘lishi" in the same
    // field, because product.* was skipping normalisation entirely.
    const result = resultWith({
      product: {
        category: 'Termos',
        observedDetails: [],
        confirmedClaims: [],
        unknownDetails: [],
        referenceConflicts: [],
        fidelityConstraints: ["rang o'zgartirilmasligi", 'mat bo‘lishi'],
      },
    });
    const normalized = normalizeResult(result);

    expect(normalized.product.fidelityConstraints).toEqual([
      `rang o${UZBEK_APOSTROPHE}zgartirilmasligi`,
      `mat bo${UZBEK_APOSTROPHE}lishi`,
    ]);
  });

  it('rejects Cyrillic in a product field', () => {
    const result = resultWith({
      product: {
        category: 'Термос',
        observedDetails: [],
        confirmedClaims: [],
        unknownDetails: [],
        referenceConflicts: [],
        fidelityConstraints: [],
      },
    });

    expect(codes(result)).toContain('UZBEK_NOT_LATIN');
  });
});

describe('Uzbek apostrophe normalisation', () => {
  it.each([
    ['typewriter', "o'zgarmas"],
    ['curly', 'o‘zgarmas'],
    ['modifier', 'oʻzgarmas'],
  ])('normalises the %s apostrophe to the Uzbek standard', (_label, input) => {
    expect(normalizeUzbek(input)).toBe(`o${UZBEK_APOSTROPHE}zgarmas`);
  });

  it('normalises every Uzbek field of a result', () => {
    const normalized = normalizeResult(resultWith({ assumptionsUz: ["bo'lishi mumkin"] }));

    expect(normalized.assumptionsUz[0]).toBe(`bo${UZBEK_APOSTROPHE}lishi mumkin`);
    expect(normalized.concept?.titleUz).toBe(`Kun bo${UZBEK_APOSTROPHE}yi issiq`);
  });

  it('leaves the English prompt alone', () => {
    const normalized = normalizeResult(resultWith());

    expect(normalized.promptEn).toBe(englishPrompt);
  });
});

describe('englishFunctionWordRatio', () => {
  it('scores English prose well above the warning floor', () => {
    expect(englishFunctionWordRatio(englishPrompt)).toBeGreaterThan(0.15);
  });

  it('scores Uzbek prose near zero', () => {
    expect(englishFunctionWordRatio('Mahsulot aylanadi va yorugʻlik tushadi')).toBeLessThan(0.08);
  });

  it('returns zero for text with no Latin words', () => {
    expect(englishFunctionWordRatio('。。。')).toBe(0);
  });
});

describe('reporting', () => {
  it('collects every problem at once rather than stopping at the first', () => {
    const result = resultWith({
      promptEn: 'Add a voiceover and show [PRODUCT].',
      shots: [{ startSeconds: 2, endSeconds: 5, descriptionUz: 'a', cameraUz: 'b' }],
    });
    const report = validateGeneration(result, context);

    expect(new Set(report.errors.map((e) => e.code)).size).toBeGreaterThan(2);
  });

  it('names the field on every issue, so a repair call can act on it', () => {
    const report = validateGeneration(resultWith({ concept: null }), context);

    expect(report.errors.every((issue) => issue.field.length > 0)).toBe(true);
  });
});
