import { readFileSync } from 'node:fs';
import { galleryContentSchema, type GalleryExample } from './example.schema';

/**
 * Reads and validates `content/gallery.json`.
 *
 * Since D-090 the gallery lives in a table and **nothing reads this file at runtime** —
 * it is the record of what migration 0009 seeded, and the format `tools/gallery-ingest.mjs`
 * produces. It is kept validated by a test so that record cannot rot into something the
 * schema would reject if anyone ever seeds from it again.
 */
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
