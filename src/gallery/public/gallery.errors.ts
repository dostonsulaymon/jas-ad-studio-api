import { DomainError } from '../../common/errors/app.error';

/**
 * A seller named an inspiration id that does not exist, or is not published.
 *
 * 404 rather than 400: an unpublished example is one the owner has not made public, and
 * a 400 saying "that one is not published yet" confirms it exists. `messageKeyFor` turns
 * the code into `errors.gallery_example_not_found` for the web app to translate (spec §9).
 */
export class GalleryExampleNotFoundError extends DomainError {
  readonly code = 'GALLERY_EXAMPLE_NOT_FOUND';
  readonly status = 404;
}

/**
 * An owner's upload was refused. Part of the port because `owner/` raises and catches it
 * and may not import the gallery module's internals (R-7).
 */
export class MediaRejected extends DomainError {
  readonly status = 400;
  constructor(
    readonly code: 'MEDIA_TYPE' | 'MEDIA_TOO_LARGE' | 'MEDIA_EMPTY',
    message: string,
  ) {
    super(message);
  }
}

/** A clip is measured in megabytes; the P1 test clips are 1.8-3.5 MB at 10 seconds. */
export const MAX_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
