import 'reflect-metadata';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { validateEnv } from './common/config/env.schema';
import { createSpendTracker, generateAdPackage } from './ai/generate';
import { OpenAiAdapter } from './ai/providers/openai.adapter';
import { DEFAULT_TARGET_ID, findTarget } from './ai/targets/targets';
import { loadProductFolder } from './cli/product-folder';

/**
 * Records one provider response per fixture so the safety assertions can be replayed
 * offline. Spec §11 forbids live AI calls in CI.
 *
 * Only the allowlisted fields below are written. A raw error or a raw request must never
 * be recorded: a serialised SDK error can carry the Authorization header, response
 * headers carry account identifiers, and a recorded request carries base64 product
 * photos.
 */
const RECORDINGS_DIR = join('fixtures', '__recordings__');

interface Recording {
  fixture: string;
  model: string;
  promptVersion: string;
  targetId: string;
  targetConfigVersion: number;
  attempts: number;
  usage: { inputTokens: number; outputTokens: number; estimatedCostUsd: number };
  result: unknown;
}

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.argv[2] ?? env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const capUsd = Number(process.argv[3] ?? '0.5');

  const target = findTarget(DEFAULT_TARGET_ID);
  if (!target) throw new Error('launch target missing');

  const fixtures = (await readdir('fixtures', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('__'))
    .map((entry) => entry.name)
    .sort();

  const spend = createSpendTracker(capUsd);
  const provider = new OpenAiAdapter({ apiKey });
  await mkdir(RECORDINGS_DIR, { recursive: true });

  console.log(`recording ${String(fixtures.length)} fixtures with ${model}, cap $${capUsd.toFixed(2)}`);

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
      console.log(`  ${fixture.padEnd(28)} FAILED ${outcome.code}`);
      continue;
    }

    const { envelope } = outcome;
    const recording: Recording = {
      fixture,
      model: envelope.model,
      promptVersion: envelope.promptVersion,
      targetId: envelope.targetId,
      targetConfigVersion: envelope.targetConfigVersion,
      attempts: envelope.attempts,
      usage: envelope.usage,
      result: envelope.result,
    };

    await writeFile(
      join(RECORDINGS_DIR, `${fixture}.json`),
      `${JSON.stringify(recording, null, 2)}\n`,
      'utf8',
    );

    console.log(
      `  ${fixture.padEnd(28)} ${envelope.result.status.padEnd(11)} ${String(envelope.attempts)} attempt(s)  $${envelope.usage.estimatedCostUsd.toFixed(5)}`,
    );
  }

  console.log(`total spent $${spend.spentUsd.toFixed(5)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
