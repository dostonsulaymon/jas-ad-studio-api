import { Inject, Injectable } from '@nestjs/common';
import type { GalleryInspiration } from '../ai/public/generator.port';
import type { GalleryExample } from './example.schema';
import { GalleryMediaStore } from './gallery.media-store';
import { GalleryRepo, type StoredExample } from './gallery.repo';
import { GalleryExampleNotFoundError } from './public/gallery.errors';
import { PRO_ACCESS, type ProAccessPort } from '../pro/public/pro.port';
import { PromptLockedError } from '../pro/public/pro.errors';
import type {
  GalleryAdmin,
  GalleryCard,
  GalleryExampleInputDto,
  GalleryExampleView,
  GalleryMediaUpload,
  GalleryReader,
  OwnerGalleryExample,
} from './public/gallery.port';

export const MEDIA_BASE = '/api/gallery/media';

@Injectable()
export class GalleryService implements GalleryReader, GalleryAdmin {
  constructor(
    private readonly repo: GalleryRepo,
    private readonly media: GalleryMediaStore,
    @Inject(PRO_ACCESS) private readonly pro: ProAccessPort,
  ) {}

  async list(): Promise<GalleryCard[]> {
    const examples = await this.repo.listPublished();
    return examples.map((example) => toCard(example));
  }

  /**
   * R-010: the one place a prompt is handed over, so it is the one place that can refuse.
   *
   * `viewerId` is null for a signed-out visitor — the route is public and stays public
   * (D-007), it just does not give away a PRO prompt. The refusal happens here rather
   * than in the controller so that no future route can reach the prompt around it.
   */
  async get(slug: string, viewerId: string | null = null): Promise<GalleryExampleView> {
    const example = await this.repo.findPublishedBySlug(slug);
    if (!example) throw new GalleryExampleNotFoundError(`No published example: ${slug}`);

    if (example.promptAccess === 'pro' && !(await this.pro.hasPro(viewerId))) {
      throw new PromptLockedError(`Example ${slug} is PRO and this caller has no access`);
    }

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
  async resolveInspiration(id: string): Promise<GalleryInspiration | null> {
    const example = await this.repo.findPublishedBySlug(id);
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

  async isSelectable(id: string): Promise<boolean> {
    return (await this.repo.findPublishedBySlug(id)) !== null;
  }

  // ---- the owner's side (D-090) -------------------------------------------------

  async listForOwner(): Promise<OwnerGalleryExample[]> {
    const examples = await this.repo.listAll();
    return examples.map((example) => toOwnerView(example));
  }

  async create(input: GalleryExampleInputDto, ownerId: string): Promise<OwnerGalleryExample> {
    return toOwnerView(await this.repo.insert(input, ownerId));
  }

  async edit(
    id: string,
    input: GalleryExampleInputDto,
    ownerId: string,
  ): Promise<OwnerGalleryExample> {
    const updated = await this.repo.update(id, input, ownerId);
    if (!updated) throw new GalleryExampleNotFoundError(`No example with id ${id}`);

    return toOwnerView(updated);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repo.remove(id);
    // A delete that hit nothing is a 404, not a quiet success: the owner pressed the
    // button believing something was there.
    if (!deleted) throw new GalleryExampleNotFoundError(`No example with id ${id}`);
  }

  storeMedia(bytes: Buffer, filename: string): Promise<GalleryMediaUpload> {
    return this.media.store(bytes, filename);
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
    promptAccess: example.promptAccess,
  };
}



function toOwnerView(example: StoredExample): OwnerGalleryExample {
  return {
    id: example.rowId,
    slug: example.slug,
    titleUz: example.titleUz,
    category: example.category,
    style: example.style,
    videoPath: example.videoPath,
    posterPath: example.posterPath,
    aspectRatio: example.aspectRatio,
    durationSeconds: example.durationSeconds,
    promptEn: example.promptEn,
    conceptUz: example.conceptUz,
    creativePreset: example.creativePreset,
    sourceType: example.sourceType,
    sourceNote: example.sourceNote,
    promptAccess: example.promptAccess,
    flowModel: example.flowModel,
    flowMode: example.flowMode,
    isPublished: example.isPublished,
    sortOrder: example.sortOrder,
  };
}
