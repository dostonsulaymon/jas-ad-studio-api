import type { VideoTarget } from '../targets/target.schema';
import { countWords, estimateTokens } from '../public/text';
import type { Severity, ValidationIssue, ValidationReport } from '../public/validation.types';
import type { GenerationResult } from '../public/result.schema';
import { englishFunctionWordRatio, hasCyrillic, normalizeUzbek } from './uzbek-text';

export type { Severity, ValidationIssue, ValidationReport };

interface ValidationContext {
  target: VideoTarget;
  requestedDurationSeconds: number;
  requestedAspectRatio: string;
}

const error = (code: string, field: string, message: string): ValidationIssue => ({
  code,
  field,
  message,
  severity: 'error',
});

const warning = (code: string, field: string, message: string): ValidationIssue => ({
  code,
  field,
  message,
  severity: 'warning',
});

const PLACEHOLDER_PATTERNS = [
  /\[[A-Z_ ]{3,}\]/,
  /\{\{?[a-zA-Z_ ]+\}?\}/,
  /\bTBD\b/i,
  /\bLorem ipsum\b/i,
  /\bYOUR[_ ]PRODUCT\b/i,
];

/**
 * D-017 defers voiceover and overlay text, and source 01 §25 sets the default audio to
 * foley and room tone with no music, dialogue or narration. Source 01 §50 makes sending
 * them anyway an explicit "do not".
 */
const FORBIDDEN_DIRECTION_PATTERNS: [RegExp, string][] = [
  [/\bvoice[- ]?overs?\b/gi, 'voiceover'],
  [/\bnarrat(?:ion|or)\b/gi, 'narration'],
  [/\bsubtitles?\b/gi, 'subtitles'],
  [/\bclosed captions?\b/gi, 'captions'],
  [/\bburned[- ]in text\b/gi, 'burned-in text'],
  [/\bon[- ]screen text\b/gi, 'on-screen text'],
  [/\btext overlays?\b/gi, 'text overlay'],
  [/\bmusic (?:track|cue|bed)\b/gi, 'music cue'],
  [/\bbackground music\b/gi, 'background music'],
];

/**
 * A prompt saying "no music or voiceover" is complying, not violating, and rejecting it
 * cost a repair call on every run and failed some outright. The mention only counts as a
 * direction when nothing negates it just before.
 */
const NEGATORS =
  /\b(?:no|not|none|without|avoid|avoids|avoiding|avoidance|never|omit|omitting|omitted|exclude|excluding|excluded|free of|absent|nor|don't|do not|does not|must not|silent|zero|prohibit\w*|forbid\w*)\b/i;

/**
 * Wide enough to reach the start of a labelled section such as "Avoidance: added logos,
 * text overlays, subtitles, ..." — the negator there is the section label, which sits far
 * from the term it governs. Bounded by the line and sentence so a genuine direction in
 * the next sentence is still caught.
 */
const NEGATION_WINDOW = 240;

function isNegated(text: string, matchIndex: number): boolean {
  const start = Math.max(
    text.lastIndexOf('.', matchIndex - 1) + 1,
    text.lastIndexOf('\n', matchIndex - 1) + 1,
    matchIndex - NEGATION_WINDOW,
    0,
  );

  return NEGATORS.test(text.slice(start, matchIndex));
}

/** Timeline arithmetic runs on floats, so comparisons need a tolerance. */
const EPSILON = 0.01;

export function validateGeneration(
  result: GenerationResult,
  context: ValidationContext,
): ValidationReport {
  const issues = [
    ...validateShape(result),
    ...validateTarget(result, context),
    ...validateLength(result, context.target),
    ...validateTimeline(result, context),
    ...validateContent(result),
    ...validateLanguage(result),
  ];

  const errors = issues.filter((issue) => issue.severity === 'error');

  return {
    issues,
    errors,
    warnings: issues.filter((issue) => issue.severity === 'warning'),
    ok: errors.length === 0,
  };
}

function validateShape(result: GenerationResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (result.status === 'ready') {
    if (result.concept === null) {
      issues.push(error('READY_NO_CONCEPT', 'concept', 'a ready result needs a concept'));
    }
    if (result.shots.length === 0) {
      issues.push(error('READY_NO_SHOTS', 'shots', 'a ready result needs at least one shot'));
    }
    if (result.promptEn === null) {
      issues.push(error('READY_NO_PROMPT', 'promptEn', 'a ready result needs promptEn'));
    }
    if (result.target === null) {
      issues.push(error('READY_NO_TARGET', 'target', 'a ready result must state its target'));
    }
  }

  if (result.status === 'needs_input') {
    if (result.questionsUz.length === 0) {
      issues.push(
        error('NEEDS_INPUT_NO_QUESTIONS', 'questionsUz', 'needs_input requires 1 or 2 questions'),
      );
    }
    if (result.promptEn !== null) {
      issues.push(error('NEEDS_INPUT_HAS_PROMPT', 'promptEn', 'needs_input must not carry a prompt'));
    }
  }

  if (result.status === 'refused') {
    if (result.messageUz === null) {
      issues.push(error('REFUSED_NO_MESSAGE', 'messageUz', 'a refusal must explain itself'));
    }
    if (result.promptEn !== null) {
      issues.push(error('REFUSED_HAS_PROMPT', 'promptEn', 'a refusal must not carry a prompt'));
    }
  }

  return issues;
}

/**
 * Source 01 §50. A model that quietly renegotiates its own duration or aspect ratio is
 * §51's "unsupported provider mode" hard failure, so the echo is compared against what
 * the server actually asked for rather than merely checked for internal consistency.
 */
function validateTarget(result: GenerationResult, context: ValidationContext): ValidationIssue[] {
  if (result.target === null) return [];

  const issues: ValidationIssue[] = [];
  const { target, requestedDurationSeconds, requestedAspectRatio } = context;

  if (result.target.targetId !== target.id) {
    issues.push(
      error(
        'TARGET_MISMATCH',
        'target.targetId',
        `expected ${target.id}, model returned ${result.target.targetId}`,
      ),
    );
  }

  if (!target.durations.includes(result.target.durationSeconds)) {
    issues.push(
      error(
        'DURATION_UNSUPPORTED',
        'target.durationSeconds',
        `${target.id} supports ${target.durations.join(', ')}s, model returned ${String(result.target.durationSeconds)}s`,
      ),
    );
  } else if (Math.abs(result.target.durationSeconds - requestedDurationSeconds) > EPSILON) {
    issues.push(
      error(
        'DURATION_RENEGOTIATED',
        'target.durationSeconds',
        `requested ${String(requestedDurationSeconds)}s, model returned ${String(result.target.durationSeconds)}s`,
      ),
    );
  }

  if (!target.aspectRatios.includes(result.target.aspectRatio)) {
    issues.push(
      error(
        'ASPECT_RATIO_UNSUPPORTED',
        'target.aspectRatio',
        `${target.id} supports ${target.aspectRatios.join(', ')}`,
      ),
    );
  } else if (result.target.aspectRatio !== requestedAspectRatio) {
    issues.push(
      error(
        'ASPECT_RATIO_RENEGOTIATED',
        'target.aspectRatio',
        `requested ${requestedAspectRatio}, model returned ${result.target.aspectRatio}`,
      ),
    );
  }

  return issues;
}

/**
 * Length is reported, not enforced (D-045). The whole point of the product is a deep
 * production brief, and a validator that fails a long prompt would be throwing away the
 * thing the seller is paying for. The target's ceilings stay in the config as the
 * documented generator limit and surface here as warnings, so a prompt that really would
 * be truncated is visible without being destroyed.
 */
function validateLength(result: GenerationResult, target: VideoTarget): ValidationIssue[] {
  if (result.promptEn === null) return [];

  const issues: ValidationIssue[] = [];
  const words = countWords(result.promptEn);
  const tokens = estimateTokens(result.promptEn, target.tokensPerWord);

  if (tokens > target.maxPromptTokens) {
    issues.push(
      warning(
        'PROMPT_OVER_TARGET_LIMIT',
        'promptEn',
        `about ${String(tokens)} tokens from ${String(words)} words (estimated at ${String(target.tokensPerWord)} per word), above ${target.id}'s documented ${String(target.maxPromptTokens)}-token limit — check whether the generator truncates it`,
      ),
    );
  }

  return issues;
}

function validateTimeline(result: GenerationResult, context: ValidationContext): ValidationIssue[] {
  const { shots } = result;
  if (shots.length === 0) return [];

  const issues: ValidationIssue[] = [];
  const duration = result.target?.durationSeconds ?? context.requestedDurationSeconds;

  if (shots.length > context.target.beats.max) {
    issues.push(
      error(
        'TOO_MANY_BEATS',
        'shots',
        `${String(shots.length)} beats, limit ${String(context.target.beats.max)}`,
      ),
    );
  }

  const first = shots[0];
  if (first && Math.abs(first.startSeconds) > EPSILON) {
    issues.push(
      error('TIMELINE_START', 'shots.0.startSeconds', `first shot starts at ${String(first.startSeconds)}s, expected 0`),
    );
  }

  const last = shots[shots.length - 1];
  if (last && Math.abs(last.endSeconds - duration) > EPSILON) {
    issues.push(
      error(
        'TIMELINE_END',
        `shots.${String(shots.length - 1)}.endSeconds`,
        `last shot ends at ${String(last.endSeconds)}s, expected ${String(duration)}s`,
      ),
    );
  }

  shots.forEach((shot, index) => {
    if (shot.endSeconds <= shot.startSeconds) {
      issues.push(
        error('SHOT_NOT_FORWARD', `shots.${String(index)}`, 'a shot must end after it starts'),
      );
    }

    const previous = shots[index - 1];
    if (previous && Math.abs(shot.startSeconds - previous.endSeconds) > EPSILON) {
      const kind = shot.startSeconds < previous.endSeconds ? 'overlaps' : 'leaves a gap after';
      issues.push(
        error(
          'TIMELINE_DISCONTINUOUS',
          `shots.${String(index)}.startSeconds`,
          `shot ${String(index)} ${kind} shot ${String(index - 1)}`,
        ),
      );
    }
  });

  return issues;
}

function validateContent(result: GenerationResult): ValidationIssue[] {
  if (result.promptEn === null) return [];

  const issues: ValidationIssue[] = [];

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = pattern.exec(result.promptEn);
    if (match) {
      issues.push(error('PROMPT_PLACEHOLDER', 'promptEn', `unfilled placeholder ${match[0]}`));
      break;
    }
  }

  for (const [pattern, label] of FORBIDDEN_DIRECTION_PATTERNS) {
    pattern.lastIndex = 0;

    for (const match of result.promptEn.matchAll(pattern)) {
      if (isNegated(result.promptEn, match.index)) continue;

      issues.push(
        error(
          'PROMPT_FORBIDDEN_DIRECTION',
          'promptEn',
          `${label} is deferred until after launch (D-017)`,
        ),
      );
      break;
    }
  }

  return issues;
}

function validateLanguage(result: GenerationResult): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const [field, text] of uzbekFields(result)) {
    if (hasCyrillic(text)) {
      issues.push(error('UZBEK_NOT_LATIN', field, 'Uzbek fields must be Latin script (D-014)'));
    }
  }

  if (result.promptEn !== null) {
    if (hasCyrillic(result.promptEn)) {
      issues.push(error('PROMPT_NOT_ENGLISH', 'promptEn', 'promptEn contains Cyrillic'));
    }

    const ratio = englishFunctionWordRatio(result.promptEn);

    // A warning, never an error: a heuristic that triggers a paid repair on a good
    // prompt costs more than the mistake it catches (source 01 §28, "where practical").
    if (countWords(result.promptEn) >= 50 && ratio < 0.08) {
      issues.push(
        warning(
          'PROMPT_MAY_NOT_BE_ENGLISH',
          'promptEn',
          `English function-word ratio ${ratio.toFixed(3)} is unusually low`,
        ),
      );
    }
  }

  return issues;
}

function uzbekFields(result: GenerationResult): [string, string][] {
  const productLists: [string, string[]][] = [
    ['observedDetails', result.product.observedDetails],
    ['confirmedClaims', result.product.confirmedClaims],
    ['unknownDetails', result.product.unknownDetails],
    ['referenceConflicts', result.product.referenceConflicts],
    ['fidelityConstraints', result.product.fidelityConstraints],
  ];

  const fields: [string, string][] = [
    ['product.category', result.product.category],
    ...productLists.flatMap(([name, values]) =>
      values.map((value, i): [string, string] => [`product.${name}.${String(i)}`, value]),
    ),
    ...result.questionsUz.map((q, i): [string, string] => [`questionsUz.${String(i)}`, q]),
    ...result.assumptionsUz.map((a, i): [string, string] => [`assumptionsUz.${String(i)}`, a]),
    ...result.reviewNotesUz.map((n, i): [string, string] => [`reviewNotesUz.${String(i)}`, n]),
    ...result.shots.map((s, i): [string, string] => [`shots.${String(i)}.descriptionUz`, s.descriptionUz]),
    ...result.shots.map((s, i): [string, string] => [`shots.${String(i)}.cameraUz`, s.cameraUz]),
  ];

  if (result.messageUz !== null) fields.push(['messageUz', result.messageUz]);

  if (result.concept) {
    fields.push(
      ['concept.titleUz', result.concept.titleUz],
      ['concept.rationaleUz', result.concept.rationaleUz],
      ['concept.hookUz', result.concept.hookUz],
      ['concept.ctaUz', result.concept.ctaUz],
    );
  }

  return fields;
}

/** Applied before validation so the checks judge the text, not the keyboard. */
export function normalizeResult(result: GenerationResult): GenerationResult {
  return {
    ...result,
    product: {
      category: normalizeUzbek(result.product.category),
      observedDetails: result.product.observedDetails.map(normalizeUzbek),
      confirmedClaims: result.product.confirmedClaims.map(normalizeUzbek),
      unknownDetails: result.product.unknownDetails.map(normalizeUzbek),
      referenceConflicts: result.product.referenceConflicts.map(normalizeUzbek),
      fidelityConstraints: result.product.fidelityConstraints.map(normalizeUzbek),
    },
    questionsUz: result.questionsUz.map(normalizeUzbek),
    assumptionsUz: result.assumptionsUz.map(normalizeUzbek),
    reviewNotesUz: result.reviewNotesUz.map(normalizeUzbek),
    messageUz: result.messageUz === null ? null : normalizeUzbek(result.messageUz),
    concept:
      result.concept === null
        ? null
        : {
            ...result.concept,
            titleUz: normalizeUzbek(result.concept.titleUz),
            rationaleUz: normalizeUzbek(result.concept.rationaleUz),
            hookUz: normalizeUzbek(result.concept.hookUz),
            ctaUz: normalizeUzbek(result.concept.ctaUz),
          },
    shots: result.shots.map((shot) => ({
      ...shot,
      descriptionUz: normalizeUzbek(shot.descriptionUz),
      cameraUz: normalizeUzbek(shot.cameraUz),
    })),
  };
}
