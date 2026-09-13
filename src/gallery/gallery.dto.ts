import { createZodDto } from 'nestjs-zod';
import { galleryExampleViewSchema, galleryListSchema } from './public/gallery.port';

/**
 * D-031 / T-09: the contract carries real shapes, generated from the same zod schemas
 * the service returns, so `openapi.json` cannot drift from what is actually sent.
 */
export class GalleryListDto extends createZodDto(galleryListSchema) {}
export class GalleryExampleDto extends createZodDto(galleryExampleViewSchema) {}
