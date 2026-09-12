import sharp from 'sharp';
import { expect, it } from 'vitest';
import {
  MAX_UPLOAD_BYTES,
  MODEL_INPUT_EDGE,
  processUpload,
  REFERENCE_EDGE,
  UploadRejected,
} from './image.pipeline';

function solid(width: number, height: number): sharp.Sharp {
  return sharp({ create: { width, height, channels: 3, background: '#c0ffee' } });
}

function jpeg(width: number, height: number): Promise<Buffer> {
  return solid(width, height).jpeg().toBuffer();
}

it('produces both copies within their edge limits', async () => {
  const processed = await processUpload(await jpeg(4000, 3000));

  const reference = await sharp(processed.reference).metadata();
  const model = await sharp(processed.modelInput).metadata();

  expect(Math.max(reference.width, reference.height)).toBe(REFERENCE_EDGE);
  expect(Math.max(model.width, model.height)).toBe(MODEL_INPUT_EDGE);
});

it('reports the original dimensions, not the resized ones', async () => {
  const processed = await processUpload(await jpeg(4000, 3000));

  expect(processed.width).toBe(4000);
  expect(processed.height).toBe(3000);
});

it('never enlarges an image that is already small', async () => {
  const processed = await processUpload(await jpeg(400, 300));

  const reference = await sharp(processed.reference).metadata();
  expect(reference.width).toBe(400);
  expect(reference.height).toBe(300);
});

it('keeps the aspect ratio of a tall image', async () => {
  const processed = await processUpload(await jpeg(1000, 4000));

  const reference = await sharp(processed.reference).metadata();
  expect(reference.height).toBe(REFERENCE_EDGE);
  expect(reference.width).toBe(512);
});

it('strips EXIF, so GPS and camera data never reach storage', async () => {
  const withExif = await solid(100, 100)
    .withExif({ IFD0: { Copyright: 'seller', Software: 'camera' } })
    .jpeg()
    .toBuffer();

  // Proves the fixture actually carried EXIF, or the assertion below proves nothing.
  expect((await sharp(withExif).metadata()).exif).toBeDefined();

  const processed = await processUpload(withExif);
  expect((await sharp(processed.reference).metadata()).exif).toBeUndefined();
  expect((await sharp(processed.modelInput).metadata()).exif).toBeUndefined();
});

it('accepts PNG and WebP, and normalises both to JPEG', async () => {
  for (const encode of [solid(800, 600).png(), solid(800, 600).webp()]) {
    const processed = await processUpload(await encode.toBuffer());
    expect((await sharp(processed.reference).metadata()).format).toBe('jpeg');
  }
});

it('rejects a PDF renamed as a photo, by decoding rather than trusting the name', async () => {
  await expect(processUpload(Buffer.from('%PDF-1.7 not an image'))).rejects.toBeInstanceOf(
    UploadRejected,
  );
});

it('rejects a GIF, which is not on the allowed list even though sharp can read it', async () => {
  const gif = await solid(100, 100).gif().toBuffer();

  await expect(processUpload(gif)).rejects.toMatchObject({ code: 'UPLOAD_TYPE' });
});

it('rejects an upload over the byte limit before decoding it', async () => {
  const tooBig = Buffer.alloc(MAX_UPLOAD_BYTES + 1);

  await expect(processUpload(tooBig)).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
});

it('rejects an image over the pixel limit', async () => {
  const huge = await solid(9000, 9000).jpeg().toBuffer();

  await expect(processUpload(huge)).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' });
});

it('rejects an empty buffer as damaged rather than crashing', async () => {
  await expect(processUpload(Buffer.alloc(0))).rejects.toMatchObject({ code: 'UPLOAD_DAMAGED' });
});
