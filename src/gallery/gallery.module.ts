import { Global, Module } from '@nestjs/common';
import { GalleryController } from './gallery.controller';
import { GalleryMediaStore } from './gallery.media-store';
import { GalleryRepo } from './gallery.repo';
import { GalleryService } from './gallery.service';
import { GalleryMedia } from './media';
import { GALLERY_ADMIN, GALLERY_READER } from './public/gallery.port';

/**
 * Global for the reason SettingsModule is: R-7 forbids projects/, generation/ and owner/
 * from importing this file, so the ports reach them through the global scope instead.
 *
 * Two ports, deliberately separate: GALLERY_READER is what the worker and projects get —
 * resolution and nothing else — while GALLERY_ADMIN is the owner module's write surface.
 * One port with every method on it would hand the generation worker a delete().
 */
@Global()
@Module({
  controllers: [GalleryController],
  providers: [
    GalleryRepo,
    GalleryMediaStore,
    GalleryMedia,
    GalleryService,
    { provide: GALLERY_READER, useExisting: GalleryService },
    { provide: GALLERY_ADMIN, useExisting: GalleryService },
  ],
  exports: [GALLERY_READER, GALLERY_ADMIN],
})
export class GalleryModule {}
