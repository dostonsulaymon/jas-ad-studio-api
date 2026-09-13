import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import { galleryExampleSchema, type GalleryExample } from './example.schema';

/**
 * Every statement against `gallery_examples` (D-090).
 *
 * Rows are parsed through `galleryExampleSchema` on the way out, not cast. The table and
 * the schema are two descriptions of the same thing, and a column that drifts — a
 * category renamed, a preset field dropped — should fail here rather than reach a seller's
 * prompt. It costs one parse per read and buys the guarantee the whole phase rests on.
 *
 * The public identifier is the **slug**, not the uuid: it is what a brief stores in
 * `gallery_inspiration_id`, and it survives the row being edited. The uuid addresses the
 * row for the owner's own routes, where stability across a rename is the point.
 */

/** What the owner writes. The uuid, timestamps and audit column are the table's business. */
export type GalleryExampleInput = Omit<GalleryExample, 'id'>;

interface Row {
  id: string;
  slug: string;
  title_uz: string;
  category: string;
  style: string;
  video_path: string;
  poster_path: string;
  aspect_ratio: string;
  duration_seconds: number;
  prompt_en: string;
  concept_uz: string;
  creative_preset: unknown;
  source_type: string;
  source_note: string;
  flow_model: string | null;
  flow_mode: string | null;
  is_published: boolean;
  sort_order: number;
}

const COLUMNS = `id, slug, title_uz, category, style, video_path, poster_path, aspect_ratio,
  duration_seconds, prompt_en, concept_uz, creative_preset, source_type, source_note,
  flow_model, flow_mode, is_published, sort_order`;

/** The row as the rest of the app sees it, plus the uuid the owner routes address. */
export interface StoredExample extends GalleryExample {
  rowId: string;
}

function toExample(row: Row): StoredExample {
  const parsed = galleryExampleSchema.parse({
    id: row.slug,
    slug: row.slug,
    titleUz: row.title_uz,
    category: row.category,
    style: row.style,
    videoPath: row.video_path,
    posterPath: row.poster_path,
    aspectRatio: row.aspect_ratio,
    durationSeconds: row.duration_seconds,
    promptEn: row.prompt_en,
    conceptUz: row.concept_uz,
    creativePreset: row.creative_preset,
    sourceType: row.source_type,
    sourceNote: row.source_note,
    flowModel: row.flow_model,
    flowMode: row.flow_mode,
    isPublished: row.is_published,
    sortOrder: row.sort_order,
  });

  return { ...parsed, rowId: row.id };
}

@Injectable()
export class GalleryRepo {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async listPublished(): Promise<StoredExample[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM gallery_examples WHERE is_published ORDER BY sort_order, slug`,
    );
    return rows.map(toExample);
  }

  /** Everything, published or not. The owner's list. */
  async listAll(): Promise<StoredExample[]> {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM gallery_examples ORDER BY sort_order, slug`,
    );
    return rows.map(toExample);
  }

  async findPublishedBySlug(slug: string): Promise<StoredExample | null> {
    const { rows } = await this.pool.query<Row>(
      `SELECT ${COLUMNS} FROM gallery_examples WHERE slug = $1 AND is_published`,
      [slug],
    );
    const row = rows[0];
    return row ? toExample(row) : null;
  }

  async insert(input: GalleryExampleInput, ownerId: string): Promise<StoredExample> {
    const { rows } = await this.pool.query<Row>(
      `INSERT INTO gallery_examples
         (slug, title_uz, category, style, video_path, poster_path, aspect_ratio,
          duration_seconds, prompt_en, concept_uz, creative_preset, source_type,
          source_note, flow_model, flow_mode, is_published, sort_order, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING ${COLUMNS}`,
      values(input, ownerId),
    );
    return toExample(rows[0] as Row);
  }

  async update(rowId: string, input: GalleryExampleInput, ownerId: string): Promise<StoredExample | null> {
    const { rows } = await this.pool.query<Row>(
      `UPDATE gallery_examples SET
         slug = $1, title_uz = $2, category = $3, style = $4, video_path = $5,
         poster_path = $6, aspect_ratio = $7, duration_seconds = $8, prompt_en = $9,
         concept_uz = $10, creative_preset = $11, source_type = $12, source_note = $13,
         flow_model = $14, flow_mode = $15, is_published = $16, sort_order = $17,
         updated_by = $18, updated_at = now()
       WHERE id = $19
       RETURNING ${COLUMNS}`,
      [...values(input, ownerId), rowId],
    );
    const row = rows[0];
    return row ? toExample(row) : null;
  }

  async remove(rowId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(`DELETE FROM gallery_examples WHERE id = $1`, [
      rowId,
    ]);
    return (rowCount ?? 0) > 0;
  }
}

function values(input: GalleryExampleInput, ownerId: string): unknown[] {
  return [
    input.slug,
    input.titleUz,
    input.category,
    input.style,
    input.videoPath,
    input.posterPath,
    input.aspectRatio,
    input.durationSeconds,
    input.promptEn,
    input.conceptUz,
    JSON.stringify(input.creativePreset),
    input.sourceType,
    input.sourceNote,
    input.flowModel,
    input.flowMode,
    input.isPublished,
    input.sortOrder,
    ownerId,
  ];
}
