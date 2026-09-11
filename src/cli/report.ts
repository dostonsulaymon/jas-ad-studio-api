import type { GenerationEnvelope } from '../ai/public/result.schema';
import { countWords } from '../ai/public/text';
import type { ValidationIssue } from '../ai/public/validation.types';

export interface ReportInput {
  productPath: string;
  envelope: GenerationEnvelope;
  warnings: ValidationIssue[];
  repairedFrom: ValidationIssue[];
  elapsedMs: number;
  spentUsd: number;
}

const issueLines = (issues: ValidationIssue[]): string =>
  issues.map((issue) => `- \`${issue.code}\` **${issue.field}** — ${issue.message}`).join('\n');

/** Provenance comes from the envelope, never from the model's own JSON (source 01 §26). */
export function renderReport(input: ReportInput): string {
  const { envelope, warnings, repairedFrom } = input;
  const { result, usage } = envelope;
  const words = result.promptEn === null ? 0 : countWords(result.promptEn);

  const sections = [
    `# ${result.concept?.titleUz ?? result.status}`,
    '',
    `**Product:** \`${input.productPath}\`  ·  **Status:** \`${result.status}\``,
    '',
    '| | |',
    '|---|---|',
    `| Prompt version | \`${envelope.promptVersion}\` |`,
    `| Provider / model | ${envelope.provider} / \`${envelope.model}\` |`,
    `| Target | \`${envelope.targetId}\` (config v${String(envelope.targetConfigVersion)}) |`,
    `| Attempts | ${String(envelope.attempts)} |`,
    `| Tokens | ${String(usage.inputTokens)} in, ${String(usage.outputTokens)} out |`,
    `| Cost | $${usage.estimatedCostUsd.toFixed(5)} |`,
    `| Run spend | $${input.spentUsd.toFixed(5)} |`,
    `| Elapsed | ${(input.elapsedMs / 1000).toFixed(1)}s |`,
    `| promptEn | ${String(words)} words |`,
    `| Request id | ${envelope.requestId ?? '(none)'} |`,
  ];

  if (repairedFrom.length > 0) {
    sections.push('', '## Repaired from', '', issueLines(repairedFrom));
  }

  sections.push(
    '',
    '## Validators',
    '',
    warnings.length === 0 ? 'Clean — no errors, no warnings.' : issueLines(warnings),
  );

  if (result.questionsUz.length > 0) {
    sections.push('', '## Savollar', '', result.questionsUz.map((q) => `- ${q}`).join('\n'));
  }

  if (result.messageUz !== null) sections.push('', '## Xabar', '', result.messageUz);

  if (result.promptEn !== null) {
    sections.push('', '## promptEn', '', '```text', result.promptEn, '```');
  }

  if (result.shots.length > 0) {
    sections.push(
      '',
      '## Kadrlar rejasi',
      '',
      '| Vaqt | Tavsif | Kamera |',
      '|---|---|---|',
      ...result.shots.map(
        (s) =>
          `| ${String(s.startSeconds)}–${String(s.endSeconds)}s | ${s.descriptionUz} | ${s.cameraUz} |`,
      ),
    );
  }

  sections.push(
    '',
    '## Mahsulot',
    '',
    `**Kategoriya:** ${result.product.category}`,
    '',
    ...labelledList('Koʻrinib turgani', result.product.observedDetails),
    ...labelledList('Tasdiqlangan', result.product.confirmedClaims),
    ...labelledList('Nomaʼlum', result.product.unknownDetails),
    ...labelledList('Ziddiyatlar', result.product.referenceConflicts),
    ...labelledList('Fidelity', result.product.fidelityConstraints),
    ...labelledList('Taxminlar', result.assumptionsUz),
    ...labelledList('Izohlar', result.reviewNotesUz),
  );

  return `${sections.join('\n')}\n`;
}

function labelledList(label: string, items: string[]): string[] {
  if (items.length === 0) return [];
  return [`**${label}:**`, ...items.map((item) => `- ${item}`), ''];
}
