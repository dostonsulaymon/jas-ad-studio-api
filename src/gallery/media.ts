import { createReadStream, type ReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';

/**
 * Reads the gallery's clips and posters off the public media volume (R-5).
 *
 * This is deliberately not `assets/storage.ts` reused. R-7 forbids the import, and the
 * jobs genuinely differ: that class returns a whole Buffer for a private image, while a
 * 3 MB clip on an Uzbek phone needs a stream and an HTTP Range response, or every scrub
 * of the timeline re-downloads the file from zero (source 01 §15).
 */

/** An extension not on this list is a 404. Never guess a content type from bytes. */
const CONTENT_TYPES = new Map([
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.jpg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

export interface MediaFile {
  absolute: string;
  contentType: string;
  size: number;
  etag: string;
}

export interface ByteRange {
  start: number;
  end: number;
}

@Injectable()
export class GalleryMedia {
  private readonly root: string;

  constructor(config: ConfigService<Env, true>) {
    this.root = resolve(config.get('GALLERY_MEDIA_ROOT', { infer: true }));
  }

  /**
   * `null` for every refusal — outside the volume, an unlisted extension, not a file.
   * The caller turns that into one 404, so a probe cannot tell the three apart.
   */
  async find(requestPath: string): Promise<MediaFile | null> {
    const contentType = CONTENT_TYPES.get(extname(requestPath).toLowerCase());
    if (!contentType) return null;

    const absolute = this.resolveWithin(requestPath);
    if (absolute === null) return null;

    try {
      const stats = await stat(absolute);
      if (!stats.isFile()) return null;

      return {
        absolute,
        contentType,
        size: stats.size,
        // Task 6 names files by content hash, so the name already changes when the bytes
        // do. Size and mtime are belt and braces for a file replaced in place by hand.
        etag: `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`,
      };
    } catch {
      return null;
    }
  }

  open(file: MediaFile, range?: ByteRange): ReadStream {
    return range
      ? createReadStream(file.absolute, { start: range.start, end: range.end })
      : createReadStream(file.absolute);
  }

  /**
   * The only place a request path becomes absolute. A decoded `..`, an absolute path and
   * a symlink-shaped escape all land outside the root and are refused here.
   */
  private resolveWithin(requestPath: string): string | null {
    if (requestPath.includes('\0')) return null;

    const absolute = resolve(this.root, requestPath);

    return absolute.startsWith(this.root + sep) ? absolute : null;
  }
}

/**
 * RFC 9110 single range only: `bytes=start-end`, `bytes=start-`, `bytes=-suffix`.
 *
 * A multi-range request is answered with the whole file rather than a multipart body —
 * no video player asks for one, and half an implementation of multipart/byteranges is
 * worse than none.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): ByteRange | 'unsatisfiable' | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === '' && rawEnd === '') return null;

  let start: number;
  let end: number;

  if (rawStart === '') {
    // A suffix range: the last N bytes. N larger than the file means the whole file.
    const suffix = Number(rawEnd);
    if (suffix === 0) return 'unsatisfiable';
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (start > end || start >= size) return 'unsatisfiable';

  return { start, end };
}
