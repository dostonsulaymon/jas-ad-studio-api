import 'reflect-metadata';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { validateEnv } from './common/config/env.schema';
import { createSpendTracker, generateAdPackage, SpendCapExceededError } from './ai/generate';
import { OpenAiAdapter } from './ai/providers/openai.adapter';
import { DEFAULT_TARGET_ID, findTarget } from './ai/targets/targets';
import { CliArgsError, parseArgs } from './cli/args';
import { loadProductFolder, ProductFolderError } from './cli/product-folder';
import { renderReport } from './cli/report';

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), { target: DEFAULT_TARGET_ID });
  const env = validateEnv(process.env);

  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new CliArgsError('OPENAI_API_KEY is not set');

  const model = args.model ?? env.OPENAI_MODEL;
  if (model === undefined) {
    throw new CliArgsError('No model: pass --model or set OPENAI_MODEL');
  }

  const target = findTarget(args.target);
  if (!target) throw new CliArgsError(`Unknown target "${args.target}"`);

  const { brief, images } = await loadProductFolder(args.product, target.referenceImages.max);
  const spend = createSpendTracker(args.maxSpendUsd);
  const provider = new OpenAiAdapter({ apiKey });

  console.log(
    `${basename(args.product)} · ${model} · ${target.id} · ${String(images.length)} image(s) · cap $${args.maxSpendUsd.toFixed(2)}`,
  );

  const started = Date.now();
  const outcome = await generateAdPackage(
    { brief, target, images, inspiration: null, model },
    { provider, spend },
  );
  const elapsedMs = Date.now() - started;

  if (outcome.status === 'failed') {
    console.error(`FAILED ${outcome.code}: ${outcome.message}`);
    for (const issue of [...outcome.firstAttemptErrors, ...outcome.repairErrors]) {
      console.error(`  ${issue.code} ${issue.field}: ${issue.message}`);
    }
    console.error(`spent $${spend.spentUsd.toFixed(5)}`);
    process.exitCode = 1;
    return;
  }

  const report = renderReport({
    productPath: args.product,
    envelope: outcome.envelope,
    warnings: outcome.warnings,
    repairedFrom: outcome.repairedFrom,
    elapsedMs,
    spentUsd: spend.spentUsd,
  });

  await mkdir(args.outDir, { recursive: true });
  const file = join(
    args.outDir,
    `${basename(args.product)}-${model}-${String(Date.now())}.md`,
  );
  await writeFile(file, report, 'utf8');

  console.log(
    `${outcome.envelope.result.status} · ${String(outcome.envelope.attempts)} attempt(s) · $${spend.spentUsd.toFixed(5)} · ${(elapsedMs / 1000).toFixed(1)}s`,
  );
  console.log(file);
}

main().catch((error: unknown) => {
  if (error instanceof CliArgsError || error instanceof ProductFolderError) {
    console.error(error.message);
  } else if (error instanceof SpendCapExceededError) {
    console.error(`Stopped: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
