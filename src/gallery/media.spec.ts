import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { beforeAll, describe, expect, it } from 'vitest';
import { GalleryMedia, parseRange } from './media';

let media: GalleryMedia;
let root: string;

const BYTES = Buffer.from('0123456789');

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'gallery-media-'));
  writeFileSync(join(root, 'clip.mp4'), BYTES);
  writeFileSync(join(root, 'poster.jpg'), BYTES);
  writeFileSync(join(root, 'notes.txt'), BYTES);

  // Something worth stealing, one level above the volume.
  writeFileSync(join(root, '..', 'secret.mp4'), 'do not serve me');

  media = new GalleryMedia({ get: () => root } as unknown as ConfigService<Env, true>);
});

describe('finding a file', () => {
  it('finds a clip and reports its type and size', async () => {
    const file = await media.find('clip.mp4');

    expect(file?.contentType).toBe('video/mp4');
    expect(file?.size).toBe(10);
    expect(file?.etag).toMatch(/^"[0-9a-f]+-[0-9a-f]+"$/);
  });

  it('finds a poster', async () => {
    expect((await media.find('poster.jpg'))?.contentType).toBe('image/jpeg');
  });

  it('refuses an extension that is not on the allowlist', async () => {
    expect(await media.find('notes.txt')).toBeNull();
  });

  it('refuses a file that does not exist', async () => {
    expect(await media.find('missing.mp4')).toBeNull();
  });

  it('refuses a directory', async () => {
    expect(await media.find('.')).toBeNull();
  });
});

describe('nothing escapes the volume', () => {
  // Each of these resolves to the real file one level up, which exists and is a valid
  // extension — so a failure here would serve it, not 404.
  it.each([
    ['a relative climb', '../secret.mp4'],
    ['a deep climb', 'a/b/../../../secret.mp4'],
    ['an absolute path', '/etc/hosts.mp4'],
    ['a null byte', 'clip.mp4\0.txt'],
  ])('refuses %s', async (_name, path) => {
    expect(await media.find(path)).toBeNull();
  });
});

describe('range requests', () => {
  it('is null when there is no Range header, so the whole file is served', () => {
    expect(parseRange(undefined, 10)).toBeNull();
  });

  it('reads a closed range', () => {
    expect(parseRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
  });

  it('reads an open-ended range to the last byte', () => {
    expect(parseRange('bytes=4-', 10)).toEqual({ start: 4, end: 9 });
  });

  it('reads a suffix range as the last N bytes', () => {
    expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
  });

  it('clamps an end past the file to the last byte', () => {
    expect(parseRange('bytes=8-99', 10)).toEqual({ start: 8, end: 9 });
  });

  it('clamps a suffix larger than the file to the whole file', () => {
    expect(parseRange('bytes=-99', 10)).toEqual({ start: 0, end: 9 });
  });

  it.each([
    ['a start past the end of the file', 'bytes=10-'],
    ['a backwards range', 'bytes=6-2'],
    ['a zero-length suffix', 'bytes=-0'],
  ])('calls %s unsatisfiable', (_name, header) => {
    expect(parseRange(header, 10)).toBe('unsatisfiable');
  });

  it.each([
    ['an unknown unit', 'items=0-5'],
    ['a multi-range request', 'bytes=0-1,4-5'],
    ['nonsense', 'bytes=--'],
    ['an empty range', 'bytes=-'],
  ])('ignores %s and serves the whole file', (_name, header) => {
    expect(parseRange(header, 10)).toBeNull();
  });

  it('streams exactly the requested bytes', async () => {
    const file = await media.find('clip.mp4');
    if (!file) throw new Error('the fixture clip is missing');

    const stream = media.open(file, { start: 2, end: 5 });

    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);

    expect(Buffer.concat(chunks).toString()).toBe('2345');
  });
});
