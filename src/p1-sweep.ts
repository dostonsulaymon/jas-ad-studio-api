import 'reflect-metadata';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { encode } from 'gpt-tokenizer';
import { validateEnv } from './common/config/env.schema';
import { createSpendTracker, generateAdPackage } from './ai/generate';
import { OpenAiAdapter } from './ai/providers/openai.adapter';
import { countWords } from './ai/public/text';
import { DEFAULT_TARGET_ID, findTarget } from './ai/targets/targets';
import type { VideoTarget } from './ai/targets/target.schema';
import { loadProductFolder } from './cli/product-folder';

/**
 * Part 8a. One factor at a time rather than a full grid: three word settings and three
 * beat settings against a shared baseline, so six configurations rather than nine.
 *
 * This part draws no conclusion about video quality — word count and validator pass
 * cannot tell you which prompt makes a better video. It produces candidate prompts and
 * one measurement: the real tokens-per-word of promptEn, which the target config's
 * estimator has so far been guessing at.
 */
interface Row {
  config: string;
  fixture: string;
  status: string;
  attempts: number;
  words: number;
  /** A real BPE count over promptEn alone, as a diagnostic. Not Veo's tokenizer. */
  tokens: number;
  tokensPerWord: number;
  beats: number;
  validatorsOk: boolean;
  costUsd: number;
}

function configs(base: VideoTarget): [string, VideoTarget][] {
  return [
    ['words-300', { ...base, recommendedWords: 300 }],
    ['words-500', { ...base, recommendedWords: 500 }],
    ['words-700', { ...base, recommendedWords: 640, maxWords: 640 }],
    ['beats-2', { ...base, beats: { default: 2, max: 4 } }],
    ['beats-3', { ...base, beats: { default: 3, max: 4 } }],
    ['beats-4', { ...base, beats: { default: 4, max: 4 } }],
  ];
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));

  return sorted[index] ?? 0;
}

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.argv[2] ?? env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const capUsd = Number(process.argv[3] ?? '1');

  const base = findTarget(DEFAULT_TARGET_ID);
  if (!base) throw new Error('launch target missing');

  const fixtures = (await readdir('fixtures', { withFileTypes: true }))
    .filter((e) => e.isDirectory() && !e.name.startsWith('__'))
    .map((e) => e.name)
    .sort();

  const spend = createSpendTracker(capUsd);
  const provider = new OpenAiAdapter({ apiKey });
  const rows: Row[] = [];

  console.log(
    `sweep: ${String(configs(base).length)} configs x ${String(fixtures.length)} fixtures, ${model}, cap $${capUsd.toFixed(2)}`,
  );

  for (const [name, target] of configs(base)) {
    for (const fixture of fixtures) {
      const { brief, images } = await loadProductFolder(
        join('fixtures', fixture),
        target.referenceImages.max,
      );

      const outcome = await generateAdPackage(
        { brief, target, images, inspiration: null, model },
        { provider, spend },
      );

      if (outcome.status === 'failed') {
        rows.push({
          config: name,
          fixture,
          status: `failed:${outcome.code}`,
          attempts: 0,
          words: 0,
          tokens: 0,
          tokensPerWord: 0,
          beats: 0,
          validatorsOk: false,
          costUsd: 0,
        });
        continue;
      }

      const { envelope, warnings } = outcome;
      const prompt = envelope.result.promptEn ?? '';
      const words = countWords(prompt);
      const tokens = prompt === '' ? 0 : encode(prompt).length;

      rows.push({
        config: name,
        fixture,
        status: envelope.result.status,
        attempts: envelope.attempts,
        words,
        tokens,
        tokensPerWord: words === 0 ? 0 : tokens / words,
        beats: envelope.result.shots.length,
        validatorsOk: warnings.length === 0,
        costUsd: envelope.usage.estimatedCostUsd,
      });
    }

    const done = rows.filter((r) => r.config === name);
    console.log(
      `  ${name.padEnd(10)} ${String(done.filter((r) => r.status === 'ready').length)}/${String(done.length)} ready  avg ${String(Math.round(avg(done.map((r) => r.words))))} words  $${spend.spentUsd.toFixed(4)}`,
    );
  }

  const ratios = rows.filter((r) => r.tokensPerWord > 0).map((r) => r.tokensPerWord);
  const p95 = percentile(ratios, 95);

  await mkdir('out', { recursive: true });
  await writeFile('out/sweep.json', `${JSON.stringify({ model, rows }, null, 2)}\n`, 'utf8');
  await writeFile('out/sweep.md', renderTable(rows, model, spend.spentUsd, p95), 'utf8');

  console.log(`\ntokens/word over ${String(ratios.length)} prompts:`);
  console.log(`  min ${percentile(ratios, 0).toFixed(3)}  median ${percentile(ratios, 50).toFixed(3)}  p95 ${p95.toFixed(3)}  max ${percentile(ratios, 100).toFixed(3)}`);
  console.log(`  config estimator: ${String(base.tokensPerWord)}`);
  console.log(`total spent $${spend.spentUsd.toFixed(4)}`);
  console.log('out/sweep.md');
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function renderTable(rows: Row[], model: string, spentUsd: number, p95: number): string {
  const byConfig = [...new Set(rows.map((r) => r.config))];

  const summary = byConfig.map((config) => {
    const set = rows.filter((r) => r.config === config);
    const ready = set.filter((r) => r.status === 'ready');

    return `| ${config} | ${String(ready.length)}/${String(set.length)} | ${String(Math.round(avg(ready.map((r) => r.words))))} | ${String(Math.round(avg(ready.map((r) => r.tokens))))} | ${avg(ready.map((r) => r.tokensPerWord)).toFixed(3)} | ${avg(ready.map((r) => r.beats)).toFixed(1)} | ${avg(set.map((r) => r.attempts)).toFixed(2)} | $${set.reduce((a, r) => a + r.costUsd, 0).toFixed(4)} |`;
  });

  return [
    `# P1 sweep — ${model}`,
    '',
    `Total spend $${spentUsd.toFixed(4)}. Tokens counted with a real BPE over \`promptEn\` alone, as a diagnostic — it is not Veo's tokenizer.`,
    '',
    '## By configuration',
    '',
    '| Config | Ready | Avg words | Avg tokens | Tokens/word | Avg beats | Avg attempts | Cost |',
    '|---|---|---|---|---|---|---|---|',
    ...summary,
    '',
    `**Observed tokens/word p95: ${p95.toFixed(3)}**`,
    '',
    '## Every run',
    '',
    '| Config | Fixture | Status | Words | Tokens | T/W | Beats | Attempts |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.config} | ${r.fixture} | ${r.status} | ${String(r.words)} | ${String(r.tokens)} | ${r.tokensPerWord.toFixed(2)} | ${String(r.beats)} | ${String(r.attempts)} |`,
    ),
    '',
  ].join('\n');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
