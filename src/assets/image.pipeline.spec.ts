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

/**
 * sharp normalises orientation on write, so the APP1 segment is spliced in by hand: a
 * big-endian TIFF header and one IFD0 entry, tag 0x0112 = 6 ("rotate 90° CW to display").
 * This is what a phone held upright produces.
 */
async function rotatedJpeg(width: number, height: number): Promise<Buffer> {
  const base = await jpeg(width, height);
  const tiff = Buffer.concat([
    Buffer.from('MM\x00\x2a', 'latin1'),
    Buffer.from([0, 0, 0, 8]),
    Buffer.from([0, 1]),
    Buffer.from([0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0]),
    Buffer.from([0, 0, 0, 0]),
  ]);
  const payload = Buffer.concat([Buffer.from('Exif\x00\x00', 'latin1'), tiff]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    Buffer.from([(payload.length + 2) >> 8, (payload.length + 2) & 0xff]),
    payload,
  ]);

  return Buffer.concat([base.subarray(0, 2), app1, base.subarray(2)]);
}

it('produces both copies within their edge limits', async () => {
  const processed = await processUpload(await jpeg(4000, 3000));

  const reference = await sharp(processed.reference.bytes).metadata();
  const model = await sharp(processed.modelInput.bytes).metadata();

  expect(Math.max(reference.width, reference.height)).toBe(REFERENCE_EDGE);
  expect(Math.max(model.width, model.height)).toBe(MODEL_INPUT_EDGE);
});

it('reports each copy at its own resized dimensions', async () => {
  const processed = await processUpload(await jpeg(4000, 3000));

  expect(processed.reference).toMatchObject({ width: 2048, height: 1536 });
  expect(processed.modelInput).toMatchObject({ width: 1024, height: 768 });
});

// A phone photo held upright is encoded landscape and tagged orientation 6. Reading the
// header before .rotate() reports it transposed, so the API called a portrait photo
// landscape and every caller laid out the wrong box.
it('reports a rotated photo at its displayed dimensions, not its encoded ones', async () => {
  const processed = await processUpload(await rotatedJpeg(3000, 2000));

  for (const copy of [processed.reference, processed.modelInput]) {
    const actual = await sharp(copy.bytes).metadata();
    expect({ width: copy.width, height: copy.height }).toEqual({
      width: actual.width,
      height: actual.height,
    });
    expect(copy.height).toBeGreaterThan(copy.width);
  }

  expect(processed.reference).toMatchObject({ width: 1365, height: 2048 });
});

it('never enlarges an image that is already small', async () => {
  const processed = await processUpload(await jpeg(400, 300));

  const reference = await sharp(processed.reference.bytes).metadata();
  expect(reference.width).toBe(400);
  expect(reference.height).toBe(300);
});

it('keeps the aspect ratio of a tall image', async () => {
  const processed = await processUpload(await jpeg(1000, 4000));

  const reference = await sharp(processed.reference.bytes).metadata();
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
  expect((await sharp(processed.reference.bytes).metadata()).exif).toBeUndefined();
  expect((await sharp(processed.modelInput.bytes).metadata()).exif).toBeUndefined();
});

it('accepts PNG and WebP, and normalises both to JPEG', async () => {
  for (const encode of [solid(800, 600).png(), solid(800, 600).webp()]) {
    const processed = await processUpload(await encode.toBuffer());
    expect((await sharp(processed.reference.bytes).metadata()).format).toBe('jpeg');
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
