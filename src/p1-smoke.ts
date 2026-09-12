import 'reflect-metadata';
import sharp from 'sharp';
import { validateEnv } from './common/config/env.schema';
import { createSpendTracker, generateAdPackage } from './ai/generate';
import { OpenAiAdapter } from './ai/providers/openai.adapter';
import type { Brief } from './ai/public/brief.schema';
import { DEFAULT_TARGET_ID, findTarget } from './ai/targets/targets';
import { countWords } from './ai/targets/target.schema';

/**
 * Part 5b. One real call against one generated image, capped, to confirm the things
 * only the live API can confirm: that the downgraded strict schema is accepted, that
 * inline images go through, what a real usage block looks like, and the actual
 * tokens-per-word ratio the target config's estimator is guessing at.
 */
const CAP_USD = 0.1;

async function syntheticProductPhoto(): Promise<Buffer> {
  // A plain unbranded bottle silhouette. Generated rather than committed so the smoke
  // test carries no real product photo and no EXIF.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <rect width="1024" height="1024" fill="#eceff1"/>
    <rect x="430" y="200" width="164" height="120" rx="18" fill="#8d99a6"/>
    <rect x="392" y="300" width="240" height="520" rx="46" fill="#b0bec5"/>
    <rect x="430" y="360" width="40" height="400" rx="20" fill="#cfd8dc" opacity="0.8"/>
  </svg>`;

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

const brief: Brief = {
  productName: 'Termos',
  description: 'Oddiy kulrang termos. Yorliqsiz, logotipsiz.',
  goal: 'sales',
  formatId: 'product-film',
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 8,
  audience: null,
  confirmedClaims: [],
  offer: null,
  galleryInspirationId: null,
};

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const apiKey = env.OPENAI_API_KEY;
  const model = process.argv[2] ?? env.OPENAI_MODEL ?? 'gpt-4.1-mini';

  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

  const target = findTarget(DEFAULT_TARGET_ID);
  if (!target) throw new Error('launch target missing');

  const images = [{ bytes: await syntheticProductPhoto(), mimeType: 'image/jpeg' as const }];
  const spend = createSpendTracker(CAP_USD);
  const provider = new OpenAiAdapter({ apiKey });

  console.log(`model: ${model}   cap: $${CAP_USD.toFixed(2)}`);

  const started = Date.now();
  const outcome = await generateAdPackage(
    { brief, target, images, inspiration: null, model },
    { provider, spend },
  );
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\nelapsed: ${elapsed}s   spent: $${spend.spentUsd.toFixed(5)}`);

  if (outcome.status === 'failed') {
    console.log(`FAILED  ${outcome.code}: ${outcome.message}`);
    for (const issue of [...outcome.firstAttemptErrors, ...outcome.repairErrors]) {
      console.log(`  - ${issue.field}: ${issue.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const { envelope, warnings } = outcome;
  const { result, usage } = envelope;
  const words = result.promptEn === null ? 0 : countWords(result.promptEn);

  console.log(`status: ${result.status}   attempts: ${String(envelope.attempts)}`);
  console.log(`usage: ${String(usage.inputTokens)} in, ${String(usage.outputTokens)} out`);
  console.log(`promptEn: ${String(words)} words`);

  // Deliberately NOT reported as a tokens-per-word measurement: output tokens cover the
  // whole JSON response — the Uzbek shot plan, the product analysis, everything — not
  // promptEn alone. Dividing one by the other measures nothing. Part 8a needs a real
  // tokenizer run over promptEn by itself.
  console.log(`config estimator (unvalidated): ${String(target.tokensPerWord)} tokens/word`);

  if (outcome.repairedFrom.length > 0) {
    console.log(`\nfirst attempt failed on:`);
    for (const issue of outcome.repairedFrom) {
      console.log(`  - ${issue.code} ${issue.field}: ${issue.message}`);
    }
  }

  console.log(`shots: ${String(result.shots.length)} (target default ${String(target.beats.default)})`);
  console.log(`warnings: ${warnings.length === 0 ? 'none' : warnings.map((w) => w.code).join(', ')}`);
  console.log(`\n--- promptEn ---\n${result.promptEn ?? '(none)'}`);
  console.log(`\n--- shot plan (uz) ---`);
  for (const shot of result.shots) {
    console.log(`${String(shot.startSeconds)}-${String(shot.endSeconds)}s  ${shot.descriptionUz}  [${shot.cameraUz}]`);
  }
  console.log(`\nconcept: ${result.concept?.titleUz ?? '(none)'}`);
  console.log(`fidelity constraints: ${result.product.fidelityConstraints.join(' | ')}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? `${error.name}: ${error.message}` : error);
  process.exitCode = 1;
});
