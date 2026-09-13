import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MediaRejected } from './public/gallery.errors';

/**
 * Writes an owner's upload onto the media volume (D-090).
 *
 * **Content-addressed, exactly as `tools/gallery-ingest.mjs` names files.** That is not a
 * tidiness preference: the public media route serves `immutable, max-age=31536000`, which
 * is only honest if the same path can never hold different bytes. Re-uploading the same
 * clip is therefore free and idempotent.
 *
 * **The type comes from the bytes, never the filename.** A file called `clip.mp4` that is
 * actually a script is the oldest upload bug there is, and the public route will happily
 * serve whatever is on disk under a video content type.
 */

interface Signature {
  extension: string;
  contentType: string;
  kind: 'video' | 'image';
  matches: (bytes: Buffer) => boolean;
}

/**
 * Only what the public media route can serve. An ISO base-media file (`ftyp` at offset 4)
 * covers mp4 and mov; webm is Matroska's EBML header.
 */
const SIGNATURES: Signature[] = [
  {
    extension: '.mp4',
    contentType: 'video/mp4',
    kind: 'video',
    matches: (b) => b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp',
  },
  {
    extension: '.webm',
    contentType: 'video/webm',
    kind: 'video',
    matches: (b) => b.length > 4 && b.subarray(0, 4).toString('hex') === '1a45dfa3',
  },
  {
    extension: '.jpg',
    contentType: 'image/jpeg',
    kind: 'image',
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    extension: '.webp',
    contentType: 'image/webp',
    kind: 'image',
    matches: (b) =>
      b.length > 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

@Injectable()
export class GalleryMediaStore {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('GALLERY_MEDIA_ROOT', { infer: true }));
  }

  async store(bytes: Buffer, filename: string): Promise<{ path: string; contentType: string }> {
    if (bytes.length === 0) throw new MediaRejected('MEDIA_EMPTY', 'The uploaded file is empty');

    const signature = SIGNATURES.find((candidate) => candidate.matches(bytes));
    if (!signature) {
      throw new MediaRejected(
        'MEDIA_TYPE',
        `Not an mp4, webm, jpeg or webp (${extname(filename) || 'no extension'})`,
      );
    }

    const cap = signature.kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    if (bytes.length > cap) {
      throw new MediaRejected(
        'MEDIA_TOO_LARGE',
        `${String(Math.round(bytes.length / 1024 / 1024))} MB exceeds the limit`,
      );
    }

    const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 16);
    const path = `${hash}${signature.extension}`;
    const absolute = resolve(this.root, path);

    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);

    return { path, contentType: signature.contentType };
  }
}
