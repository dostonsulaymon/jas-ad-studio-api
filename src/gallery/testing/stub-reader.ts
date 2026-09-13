import type { GalleryInspiration } from '../../ai/public/generator.port';
import type { GalleryReader } from '../public/gallery.port';

/**
 * A `GalleryReader` for specs that are not about the gallery.
 *
 * Most callers pass no ids at all: a brief with `galleryInspirationId: null` never
 * reaches the reader, so the stub simply has to exist. Pass ids to make them selectable
 * and resolvable.
 *
 * The real resolution boundary is proved in `gallery.e2e.spec.ts` against real content —
 * a stub could never prove that product facts stay out of a prompt, because a stub has
 * no product facts to leak.
 */
export function stubGalleryReader(published: readonly string[] = []): GalleryReader {
  return {
    isSelectable: (id) => published.includes(id),
    resolveInspiration: (id): GalleryInspiration | null =>
      published.includes(id)
        ? {
            id,
            environment: 'stub environment',
            lighting: 'stub lighting',
            cameraLanguage: 'stub camera language',
            pacing: 'stub pacing',
            mood: 'stub mood',
          }
        : null,
  };
}
