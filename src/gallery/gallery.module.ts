import { Global, Module } from '@nestjs/common';
import { GalleryContentStore } from './content';
import { GalleryController } from './gallery.controller';
import { GalleryService } from './gallery.service';
import { GalleryMedia } from './media';
import { GALLERY_READER } from './public/gallery.port';

/**
 * Global for the reason SettingsModule is: R-7 forbids projects/ and generation/ from
 * importing this file, so the port reaches them through the global scope instead. Only
 * GALLERY_READER is exported — a caller gets the resolver and nothing around it.
 */
@Global()
@Module({
  controllers: [GalleryController],
  providers: [
    GalleryContentStore,
    GalleryMedia,
    GalleryService,
    { provide: GALLERY_READER, useExisting: GalleryService },
  ],
  exports: [GALLERY_READER],
})
export class GalleryModule {}
