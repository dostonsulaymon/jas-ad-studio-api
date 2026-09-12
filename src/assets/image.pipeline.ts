import sharp from 'sharp';
import { DomainError } from '../common/errors/app.error';

/** Spec §7.1. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Spec §7.2. A decompression bomb is cheap to send and expensive to decode. */
export const MAX_PIXELS = 40_000_000;
/** R-6: downloadable, for pasting into Flow alongside the prompt. */
export const REFERENCE_EDGE = 2048;
/** R-6: what the model actually sees. */
export const MODEL_INPUT_EDGE = 1024;

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export type UploadRejectionCode = 'UPLOAD_TYPE' | 'UPLOAD_TOO_LARGE' | 'UPLOAD_DAMAGED';

export class UploadRejected extends DomainError {
  readonly status = 400;

  constructor(
    readonly code: UploadRejectionCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface RenderedCopy {
  bytes: Buffer;
  /** The dimensions of THIS copy, after EXIF rotation and resizing. */
  width: number;
  height: number;
}

export interface ProcessedImage {
  reference: RenderedCopy;
  modelInput: RenderedCopy;
}

/**
 * R-6: exactly two copies survive and the original is never written to disk, so EXIF and
 * GPS leave with it — sharp emits no metadata unless asked.
 *
 * The format is decided by decoding, never by filename or the client's content-type.
 * Both are attacker-controlled (spec §7.1).
 */
export async function processUpload(bytes: Buffer): Promise<ProcessedImage> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadRejected('UPLOAD_TOO_LARGE', 'Upload is over the byte limit');
  }

  const metadata = await readMetadata(bytes);

  if (!ALLOWED_FORMATS.has(metadata.format)) {
    throw new UploadRejected('UPLOAD_TYPE', 'Only JPG, PNG and WebP are accepted');
  }

  // sharp 0.35 types format, width and height as required: metadata() throws rather than
  // returning partial data, so there is nothing to check for presence. A zero dimension
  // is still worth rejecting — it would resize to nothing and store an empty photo.
  const pixels = metadata.width * metadata.height;
  if (pixels <= 0) {
    throw new UploadRejected('UPLOAD_DAMAGED', 'Image has no area');
  }
  if (pixels > MAX_PIXELS) {
    throw new UploadRejected('UPLOAD_TOO_LARGE', 'Image exceeds the pixel limit');
  }

  const [reference, modelInput] = await Promise.all([
    render(bytes, REFERENCE_EDGE),
    render(bytes, MODEL_INPUT_EDGE),
  ]);

  return { reference, modelInput };
}

/**
 * Deliberately without limitInputPixels: metadata() parses the header and decodes no
 * pixels, so it is cheap and safe on a decompression bomb. With the limit set, sharp
 * throws here and a 9000x9000 image is reported as damaged rather than too large — the
 * seller then reads "your photo is broken" about a photo that is fine.
 *
 * The explicit pixel check below still rejects it, and render() keeps the limit as
 * defence in depth.
 */
async function readMetadata(bytes: Buffer): Promise<sharp.Metadata> {
  try {
    return await sharp(bytes).metadata();
  } catch (cause) {
    throw new UploadRejected('UPLOAD_DAMAGED', 'Image could not be decoded', { cause });
  }
}

/**
 * The dimensions come back from the encoder, not from metadata() read beforehand.
 * .rotate() applies the EXIF orientation, so a portrait phone photo is encoded landscape
 * with orientation 6 and comes out portrait — reading the header first reports it
 * transposed, and every caller then lays out the wrong box.
 */
async function render(bytes: Buffer, edge: number): Promise<RenderedCopy> {
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_PIXELS })
    // Applies the EXIF orientation before it is stripped. Without this, every photo
    // taken in portrait on a phone lands sideways.
    .rotate()
    .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer({ resolveWithObject: true });

  return { bytes: data, width: info.width, height: info.height };
}
