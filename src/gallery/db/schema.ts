import { boolean, integer, jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

/**
 * Gallery examples (D-090, superseding R-5/D-038).
 *
 * R-5 chose a committed JSON file and named this table as the rejected alternative. That
 * was right while the content was seeded by hand and no owner panel existed. It stopped
 * being right the moment Jakhongir had to edit it himself: a file cannot be written by a
 * signed-in owner, a server writing to its own source tree is not a design, and a
 * container redeploy would discard every edit.
 *
 * The columns mirror `galleryExampleSchema`, which stays the single definition of a valid
 * example — this table stores it, the zod schema still validates it on the way in and on
 * the way out. Two definitions of "valid" would drift within a month.
 */
export const galleryExamples = pgTable('gallery_examples', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The stable public identifier, used as the inspiration id on a brief. */
  slug: text('slug').notNull().unique(),

  titleUz: text('title_uz').notNull(),
  category: text('category').notNull(),
  style: text('style').notNull(),

  /** Relative paths into the media volume. Content-addressed, so they never change. */
  videoPath: text('video_path').notNull(),
  posterPath: text('poster_path').notNull(),

  /**
   * R-017: the seller's raw product photo, shown small over the top-left of the card.
   *
   * Nullable and null by default, because for most examples nobody wrote it down. It is a
   * claim about provenance — "this video was made from this photo" — so an example without
   * one shows nothing rather than borrowing a picture of some other product.
   */
  referencePhotoPath: text('reference_photo_path'),
  aspectRatio: text('aspect_ratio').notNull(),
  durationSeconds: real('duration_seconds').notNull(),

  promptEn: text('prompt_en').notNull(),
  conceptUz: text('concept_uz').notNull(),

  /** The five creative attributes. jsonb because they move as one object or not at all. */
  creativePreset: jsonb('creative_preset').notNull(),

  sourceType: text('source_type').notNull(),
  sourceNote: text('source_note').notNull().default(''),

  /** D-011 / D-089: null means draft, 'not-recorded' means somebody looked. */
  flowModel: text('flow_model'),
  flowMode: text('flow_mode'),

  /**
   * R-010 / P8c: 'free' or 'pro'. Defaults to free, so every example that existed before
   * this column stays exactly as open as it was and nothing is locked by a migration.
   */
  promptAccess: text('prompt_access').notNull().default('free'),

  isPublished: boolean('is_published').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});

export type GalleryExampleRow = typeof galleryExamples.$inferSelect;
