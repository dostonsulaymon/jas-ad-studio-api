import { Controller, Get, Header, Param, Req, Res, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { GalleryExampleDto, GalleryListDto } from './gallery.dto';
import { GalleryService } from './gallery.service';
import { GalleryMedia, parseRange } from './media';
import type { GalleryExampleView, GalleryList } from './public/gallery.port';
import { OptionalSessionGuard, type RequestWithUser } from '../auth/public/session.guard';

/**
 * Spec §3 and source 01 §23: the gallery is the free product (D-007). Every route here
 * works signed out, which in this codebase means simply not guarding them — auth is
 * opt-in through `@UseGuards(SessionGuard)`. Nothing is added to this controller that
 * reads a seller's data.
 *
 * The JSON routes are deliberately not cached: publishing an example must show up
 * immediately, and there is no version in the URL to bust. The media routes are cached
 * hard, because their filenames are content hashes (Task 6).
 */
@Controller('gallery')
export class GalleryController {
  constructor(
    private readonly gallery: GalleryService,
    private readonly media: GalleryMedia,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Published example ads. Works signed out.',
    description:
      'Cards only — the English prompt is not included, because §15 requires this page ' +
      'to stay fast on mobile. Fetch one example for its prompt.',
  })
  @ApiOkResponse({ type: GalleryListDto })
  async list(): Promise<GalleryList> {
    return { examples: await this.gallery.list() };
  }

  /**
   * Declared before `:slug` so the wildcard cannot be shadowed if a future edit widens
   * that parameter. Today they differ in segment count, which is belt and braces.
   */
  @Get('media/*path')
  @ApiOperation({
    summary: 'An example clip or poster. Public, immutable, supports Range.',
  })
  @ApiParam({ name: 'path', description: 'Media path, e.g. 9f1c….mp4' })
  @ApiProduces('video/mp4', 'image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiResponse({ status: 206, description: 'A byte range, for seeking in a clip.' })
  async serveMedia(
    @Param('path') path: string | string[],
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    const file = await this.media.find(Array.isArray(path) ? path.join('/') : path);

    // One 404 for missing, refused and unlisted alike: a probe must not be able to tell
    // which of the three it hit.
    if (!file) {
      response.status(404).json({ code: 'NOT_FOUND', messageKey: 'errors.not_found' });
      return;
    }

    const range = parseRange(request.headers.range, file.size);

    if (range === 'unsatisfiable') {
      response.setHeader('Content-Range', `bytes */${file.size.toString()}`);
      response.status(416).end();
      return;
    }

    response.setHeader('Content-Type', file.contentType);
    response.setHeader('ETag', file.etag);
    response.setHeader('Accept-Ranges', 'bytes');
    // Safe for a year because the filename is a content hash: different bytes are a
    // different path, so an edge cache can never hold a stale clip (spec R-5).
    response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    if (range) {
      response.status(206);
      response.setHeader(
        'Content-Range',
        `bytes ${range.start.toString()}-${range.end.toString()}/${file.size.toString()}`,
      );
      response.setHeader('Content-Length', (range.end - range.start + 1).toString());
    } else {
      response.setHeader('Content-Length', file.size.toString());
    }

    this.media.open(file, range ?? undefined).pipe(response);
  }

  /**
   * Still public (D-007), and still not guarded — `OptionalSessionGuard` only reads a
   * session if one is there, so a signed-out visitor gets every free example's prompt
   * exactly as before. A PRO example is the one case that answers 403 (R-010).
   */
  @Get(':slug')
  @UseGuards(OptionalSessionGuard)
  @ApiOperation({
    summary: 'One published example, with its English prompt. Works signed out.',
    description:
      'An unpublished slug is a 404, never a 403 — a 403 confirms it exists. A PRO ' +
      'example IS a 403 (PROMPT_LOCKED): its badge already says it exists.',
  })
  @ApiOkResponse({ type: GalleryExampleDto })
  @ApiResponse({ status: 403, description: 'The prompt is PRO and this caller has no access.' })
  @Header('Cache-Control', 'no-cache')
  get(@Param('slug') slug: string, @Req() request: RequestWithUser): Promise<GalleryExampleView> {
    return this.gallery.get(slug, request.user?.id ?? null);
  }
}
