import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';

import { validateEnv } from './common/config/env.schema';
import { createSpendTracker, generateAdPackage } from './ai/generate';
import { OpenAiAdapter } from './ai/providers/openai.adapter';
import { countWords } from './ai/public/text';
import { DEFAULT_TARGET_ID, findTarget } from './ai/targets/targets';
import { loadProductFolder } from './cli/product-folder';

/**
 * Builds the Part 8b pack: the same products at three prompt lengths, laid out so
 * Jakhongir can paste each into Flow and judge them side by side. It draws no
 * conclusion — that is the point of the part.
 */
const LENGTHS = [300, 500, 700];

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const model = process.argv[2] ?? env.OPENAI_MODEL ?? 'gpt-4.1-mini';
  const capUsd = Number(process.argv[3] ?? '0.5');
  const products = process.argv.slice(4);

  if (products.length === 0) throw new Error('Pass at least one product folder');

  const base = findTarget(DEFAULT_TARGET_ID);
  if (!base) throw new Error('launch target missing');

  const spend = createSpendTracker(capUsd);
  const provider = new OpenAiAdapter({ apiKey });
  const sections: string[] = [];

  for (const product of products) {
    const { brief, images } = await loadProductFolder(product, base.referenceImages.max);
    sections.push(`\n---\n\n# ${brief.productName}\n\n\`${product}\` · ${brief.aspectRatio} · ${String(brief.durationSeconds)}s`);

    for (const words of LENGTHS) {
      const target = { ...base, recommendedWords: words };
      const outcome = await generateAdPackage(
        { brief, target, images, inspiration: null, model },
        { provider, spend },
      );

      if (outcome.status === 'failed') {
        sections.push(`\n## Setting ${String(words)}\n\nGeneration failed: ${outcome.code}`);
        continue;
      }

      const result = outcome.envelope.result;
      if (result.status !== 'ready' || result.promptEn === null) {
        sections.push(
          `\n## Setting ${String(words)}\n\nReturned \`${result.status}\`: ${result.questionsUz.join(' / ')}`,
        );
        continue;
      }

      sections.push(
        `\n## Setting ${String(words)} — produced ${String(countWords(result.promptEn))} words`,
        '',
        `**${result.concept?.titleUz ?? ''}**`,
        '',
        'Paste this into Flow together with the product photo:',
        '',
        '```text',
        result.promptEn,
        '```',
        '',
        '| Vaqt | Kadr | Kamera |',
        '|---|---|---|',
        ...result.shots.map(
          (s) => `| ${String(s.startSeconds)}–${String(s.endSeconds)}s | ${s.descriptionUz} | ${s.cameraUz} |`,
        ),
        '',
        `**Usable? (ha / qisman / yoʻq): ______   What went wrong: ______________________**`,
      );

      console.log(`${product} @ ${String(words)}: ${String(countWords(result.promptEn))} words`);
    }
  }

  const header = [
    '# Flow pilot — which prompt length wins?',
    '',
    `Model \`${model}\` · target \`${base.id}\` config v${String(base.version)} · generated ${new Date().toISOString().slice(0, 10)}`,
    '',
    '## How to run this',
    '',
    '1. Open Google Flow and pick the mode you normally use.',
    '2. For each block below: upload the product photo, paste the prompt text, generate.',
    '3. Watch the three versions of the **same product** next to each other.',
    '4. Mark each one usable / partly / no, and say what went wrong.',
    '',
    '**Usable means:** the shape, colours and labels are intact, nothing is invented on the product, and you could post it without heavy editing.',
    '',
    'Judge the *videos*, not the prompts. The only thing that changed between the three is how long the prompt was asked to be.',
    '',
    '> The app writes prompts. Flow makes the video. Nothing here touches your Google credits automatically — you run each generation yourself.',
  ].join('\n');

  await mkdir('out', { recursive: true });
  await writeFile('out/flow-pilot.md', `${header}\n${sections.join('\n')}\n`, 'utf8');

  console.log(`\nspent $${spend.spentUsd.toFixed(4)}`);
  console.log('out/flow-pilot.md');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
