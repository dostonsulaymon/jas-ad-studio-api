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
