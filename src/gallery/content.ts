import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../common/config/env.schema';
import { galleryContentSchema, type GalleryExample } from './example.schema';

/**
 * The gallery's content, loaded and validated once at boot (R-5, D-038).
 *
 * It throws. A malformed content file stops the process the way a malformed environment
 * does, and for the same reason: the alternative is an empty gallery that looks exactly
 * like a gallery nobody has made content for yet. Loud beats plausible.
 *
 * Reading a file in a constructor is fine; D-080 is about sockets. Nothing here is
 * async, which is what makes "fail at boot" true rather than "fail at first request".
 */
@Injectable()
export class GalleryContentStore {
  private readonly byId: ReadonlyMap<string, GalleryExample>;
  private readonly bySlug: ReadonlyMap<string, GalleryExample>;
  private readonly ordered: readonly GalleryExample[];

  constructor(config: ConfigService<Env, true>) {
    const file = resolve(config.get('GALLERY_CONTENT_FILE', { infer: true }));
    this.ordered = loadExamples(file);
    this.byId = new Map(this.ordered.map((example) => [example.id, example]));
    this.bySlug = new Map(this.ordered.map((example) => [example.slug, example]));
  }

  /** Published only, in display order. The list the public page renders. */
  listPublished(): GalleryExample[] {
    return this.ordered.filter((example) => example.isPublished);
  }

  /** Unpublished returns undefined: a caller must not be able to tell it exists. */
  findPublishedBySlug(slug: string): GalleryExample | undefined {
    const example = this.bySlug.get(slug);
    return example?.isPublished === true ? example : undefined;
  }

  findPublishedById(id: string): GalleryExample | undefined {
    const example = this.byId.get(id);
    return example?.isPublished === true ? example : undefined;
  }
}

export function loadExamples(file: string): readonly GalleryExample[] {
  let raw: unknown;

  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (cause) {
    throw new Error(`Gallery content could not be read: ${file}`, { cause });
  }

  const parsed = galleryContentSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid gallery content in ${file}:\n${details}`);
  }

  // Uniqueness is not expressible in the element schema, and a duplicate is the failure
  // that would otherwise show up as "the wrong video plays", which is hard to trace back.
  assertUnique(parsed.data.examples, 'id', file);
  assertUnique(parsed.data.examples, 'slug', file);

  return [...parsed.data.examples].sort((a, b) => a.sortOrder - b.sortOrder);
}

function assertUnique(
  examples: readonly GalleryExample[],
  field: 'id' | 'slug',
  file: string,
): void {
  const seen = new Set<string>();

  for (const example of examples) {
    if (seen.has(example[field])) {
      throw new Error(`Invalid gallery content in ${file}: duplicate ${field} "${example[field]}"`);
    }
    seen.add(example[field]);
  }
}
