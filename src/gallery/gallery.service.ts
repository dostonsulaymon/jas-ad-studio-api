import { Injectable } from '@nestjs/common';
import type { GalleryInspiration } from '../ai/public/generator.port';
import { GalleryContentStore } from './content';
import type { GalleryExample } from './example.schema';
import { GalleryExampleNotFoundError } from './public/gallery.errors';
import type {
  GalleryCard,
  GalleryExampleView,
  GalleryReader,
} from './public/gallery.port';

export const MEDIA_BASE = '/api/gallery/media';

@Injectable()
export class GalleryService implements GalleryReader {
  constructor(private readonly content: GalleryContentStore) {}

  list(): GalleryCard[] {
    return this.content.listPublished().map((example) => toCard(example));
  }

  get(slug: string): GalleryExampleView {
    const example = this.content.findPublishedBySlug(slug);
    if (!example) throw new GalleryExampleNotFoundError(`No published example: ${slug}`);

    return { ...toCard(example), promptEn: example.promptEn };
  }

  /**
   * The boundary the P6 exit check is about (source 01 §13).
   *
   * Built field by field, never by spreading the example. A spread is how `promptEn`
   * ends up in a seller's prompt the day somebody adds a field to the content schema,
   * and nothing would fail until a customer noticed their ad describing another
   * product. Adding a field here has to be a decision somebody typed.
   */
  resolveInspiration(id: string): GalleryInspiration | null {
    const example = this.content.findPublishedById(id);
    if (!example) return null;

    return {
      id: example.id,
      environment: example.creativePreset.environment,
      lighting: example.creativePreset.lighting,
      cameraLanguage: example.creativePreset.cameraLanguage,
      pacing: example.creativePreset.pacing,
      mood: example.creativePreset.mood,
    };
  }

  isSelectable(id: string): boolean {
    return this.content.findPublishedById(id) !== undefined;
  }
}

function toCard(example: GalleryExample): GalleryCard {
  return {
    id: example.id,
    slug: example.slug,
    titleUz: example.titleUz,
    category: example.category,
    style: example.style,
    videoUrl: `${MEDIA_BASE}/${example.videoPath}`,
    posterUrl: `${MEDIA_BASE}/${example.posterPath}`,
    aspectRatio: example.aspectRatio,
    durationSeconds: example.durationSeconds,
    conceptUz: example.conceptUz,
    sourceType: example.sourceType,
    sourceNote: example.sourceNote,
  };
}
