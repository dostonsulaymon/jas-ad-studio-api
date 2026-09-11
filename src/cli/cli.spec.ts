import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import type { GenerationEnvelope } from '../ai/public/result.schema';
import { CliArgsError, parseArgs } from './args';
import { loadProductFolder, ProductFolderError } from './product-folder';
import { renderReport } from './report';

const defaults = { target: 'flow-veo-3.1' };

describe('parseArgs', () => {
  it('parses a full command line', () => {
    const args = parseArgs(
      ['--product', 'fixtures/bottle', '--max-spend-usd', '0.5', '--model', 'gpt-4.1-mini'],
      defaults,
    );

    expect(args).toMatchObject({
      product: 'fixtures/bottle',
      maxSpendUsd: 0.5,
      model: 'gpt-4.1-mini',
      target: 'flow-veo-3.1',
    });
  });

  it('refuses to run without a spend cap', () => {
    // A run that cannot exceed a cap it was never given is not capped.
    expect(() => parseArgs(['--product', 'fixtures/bottle'], defaults)).toThrow(
      /--max-spend-usd is required/,
    );
  });

  it('refuses a zero or negative cap', () => {
    expect(() =>
      parseArgs(['--product', 'x', '--max-spend-usd', '0'], defaults),
    ).toThrow(CliArgsError);
    expect(() =>
      parseArgs(['--product', 'x', '--max-spend-usd', '-1'], defaults),
    ).toThrow(CliArgsError);
  });

  it('refuses a non-numeric cap rather than treating it as zero', () => {
    expect(() => parseArgs(['--product', 'x', '--max-spend-usd', 'lots'], defaults)).toThrow(
      /must be a positive number/,
    );
  });

  it('refuses --product with no value', () => {
    expect(() => parseArgs(['--product', '--max-spend-usd', '1'], defaults)).toThrow(
      /--product needs a value/,
    );
  });

  it('requires --product', () => {
    expect(() => parseArgs(['--max-spend-usd', '1'], defaults)).toThrow(/--product is required/);
  });

  it('defaults the target and the output directory', () => {
    const args = parseArgs(['--product', 'x', '--max-spend-usd', '1'], defaults);

    expect(args.target).toBe('flow-veo-3.1');
    expect(args.outDir).toBe('out');
    expect(args.model).toBeUndefined();
  });
});

async function productFolder(brief: unknown, photos = 1): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'jas-product-'));
  await writeFile(join(dir, 'brief.json'), JSON.stringify(brief), 'utf8');

  for (let i = 0; i < photos; i += 1) {
    const png = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#b0bec5' },
    })
      .png()
      .toBuffer();
    await writeFile(join(dir, `photo-${String(i)}.png`), png);
  }

  return dir;
}

const validBrief = {
  productName: 'Termos',
  description: 'Oddiy kulrang termos.',
  goal: 'sales',
  style: 'clean-studio',
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 8,
  audience: null,
  confirmedClaims: [],
  offer: null,
  galleryInspirationId: null,
};

describe('loadProductFolder', () => {
  it('loads a brief and converts the photos to model input', async () => {
    const dir = await productFolder(validBrief, 2);
    const folder = await loadProductFolder(dir, 4);

    expect(folder.brief.productName).toBe('Termos');
    expect(folder.images).toHaveLength(2);
    expect(folder.images[0]?.mimeType).toBe('image/jpeg');
  });

  it('caps the photos at the target’s limit', async () => {
    const dir = await productFolder(validBrief, 6);

    expect((await loadProductFolder(dir, 4)).images).toHaveLength(4);
  });

  it('reports a missing brief by name rather than crashing', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jas-empty-'));

    await expect(loadProductFolder(dir, 4)).rejects.toThrow(/No brief.json/);
  });

  it('reports a brief that does not match the schema, naming the field', async () => {
    const dir = await productFolder({ ...validBrief, aspectRatio: '4:3' });

    await expect(loadProductFolder(dir, 4)).rejects.toThrow(/aspectRatio/);
  });

  it('reports invalid JSON as invalid JSON', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jas-badjson-'));
    await writeFile(join(dir, 'brief.json'), '{ not json', 'utf8');

    await expect(loadProductFolder(dir, 4)).rejects.toThrow(/not valid JSON/);
  });

  it('refuses a folder with a brief but no photos', async () => {
    const dir = await productFolder(validBrief, 0);

    await expect(loadProductFolder(dir, 4)).rejects.toBeInstanceOf(ProductFolderError);
  });

  it('strips metadata from the model-input copy (spec §7)', async () => {
    const dir = await productFolder(validBrief, 1);
    const folder = await loadProductFolder(dir, 4);
    const metadata = await sharp(folder.images[0]?.bytes ?? Buffer.alloc(0)).metadata();

    expect(metadata.exif).toBeUndefined();
  });
});

const envelope: GenerationEnvelope = {
  promptVersion: 'ad-director-v2',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  targetId: 'flow-veo-3.1',
  targetConfigVersion: 1,
  requestId: 'resp_1',
  galleryInspirationId: null,
  usage: { inputTokens: 4600, outputTokens: 900, estimatedCostUsd: 0.00335 },
  attempts: 1,
  result: {
    status: 'ready',
    questionsUz: [],
    messageUz: null,
    product: {
      category: 'Termos',
      observedDetails: ['Kulrang mat sirt'],
      confirmedClaims: [],
      unknownDetails: ['Ichki qoplama'],
      referenceConflicts: [],
      fidelityConstraints: ['Yorliq qoʻshilmasin'],
    },
    concept: {
      titleUz: 'Soddalik',
      rationaleUz: 'Foydani koʻrsatadi.',
      style: 'clean-studio',
      hookUz: 'Bugʻ',
      ctaUz: 'Buyurtma bering',
    },
    target: { targetId: 'flow-veo-3.1', durationSeconds: 8, aspectRatio: '9:16' },
    shots: [{ startSeconds: 0, endSeconds: 8, descriptionUz: 'Aylanadi.', cameraUz: 'Push-in' }],
    promptEn: 'Use the supplied product reference as the single visual source of truth.',
    assumptionsUz: [],
    reviewNotesUz: [],
  },
};

describe('renderReport', () => {
  const report = renderReport({
    productPath: 'fixtures/bottle',
    envelope,
    warnings: [],
    repairedFrom: [],
    elapsedMs: 15_400,
    spentUsd: 0.00335,
  });

  it('takes provenance from the envelope, not the model output', () => {
    expect(report).toContain('ad-director-v2');
    expect(report).toContain('gpt-4.1-mini');
    expect(report).toContain('config v1');
    expect(report).toContain('resp_1');
  });

  it('shows the cost and the word count', () => {
    expect(report).toContain('$0.00335');
    expect(report).toContain('12 words');
  });

  it('includes the English prompt and the Uzbek shot plan', () => {
    expect(report).toContain('single visual source of truth');
    expect(report).toContain('Kadrlar rejasi');
    expect(report).toContain('Push-in');
  });

  it('says so plainly when the validators were clean', () => {
    expect(report).toContain('Clean — no errors, no warnings');
  });

  it('records what a repair fixed, so a silent second call is visible', () => {
    const repaired = renderReport({
      productPath: 'fixtures/bottle',
      envelope: { ...envelope, attempts: 2 },
      warnings: [],
      repairedFrom: [
        { code: 'TARGET_MISMATCH', field: 'target.targetId', message: 'wrong id', severity: 'error' },
      ],
      elapsedMs: 30_000,
      spentUsd: 0.007,
    });

    expect(repaired).toContain('Repaired from');
    expect(repaired).toContain('TARGET_MISMATCH');
  });

  it('omits empty sections rather than printing empty headings', () => {
    expect(report).not.toContain('Savollar');
    expect(report).not.toContain('Ziddiyatlar');
  });
});
