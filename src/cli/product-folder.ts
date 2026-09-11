import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';
import { briefSchema, type Brief } from '../ai/public/brief.schema';
import type { ReferenceImage } from '../ai/public/provider.port';

export class ProductFolderError extends Error {}

const PHOTO_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/** Spec §7: the model gets the 1024px copy, and metadata never travels with it. */
const MODEL_INPUT_MAX_PX = 1024;

export interface ProductFolder {
  brief: Brief;
  images: ReferenceImage[];
}

export async function loadProductFolder(path: string, maxImages: number): Promise<ProductFolder> {
  const brief = await loadBrief(path);
  const images = await loadImages(path, maxImages);

  if (images.length === 0) {
    throw new ProductFolderError(`No photos in ${path}; expected at least one jpg, png or webp`);
  }

  return { brief, images };
}

async function loadBrief(path: string): Promise<Brief> {
  const file = join(path, 'brief.json');

  let raw: string;
  try {
    raw = await readFile(file, 'utf8');
  } catch {
    throw new ProductFolderError(`No brief.json in ${path}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new ProductFolderError(`${file} is not valid JSON`, { cause });
  }

  const result = briefSchema.safeParse(parsed);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new ProductFolderError(`${file} does not match the brief schema:\n${details}`);
  }

  return result.data;
}

async function loadImages(path: string, maxImages: number): Promise<ReferenceImage[]> {
  let entries: string[];
  try {
    entries = await readdir(path);
  } catch (cause) {
    throw new ProductFolderError(`Cannot read ${path}`, { cause });
  }

  const photos = entries
    .filter((name) => PHOTO_EXTENSIONS.has(extname(name).toLowerCase()))
    .sort()
    .slice(0, maxImages);

  return Promise.all(photos.map((name) => toModelInput(join(path, name))));
}

async function toModelInput(file: string): Promise<ReferenceImage> {
  const bytes = await sharp(file)
    .rotate()
    .resize({
      width: MODEL_INPUT_MAX_PX,
      height: MODEL_INPUT_MAX_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: 90 })
    .toBuffer();

  return { bytes, mimeType: 'image/jpeg' };
}
