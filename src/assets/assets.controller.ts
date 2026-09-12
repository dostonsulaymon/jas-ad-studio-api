import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { User } from '../auth/public/current-user.decorator';
import type { CurrentUser } from '../auth/public/auth.port';
import { SessionGuard } from '../auth/public/session.guard';
import { AssetsService } from './assets.service';
import { MAX_UPLOAD_BYTES, UploadRejected } from './image.pipeline';
import type { StoredAsset } from './public/assets.port';

@Controller()
@UseGuards(SessionGuard)
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post('projects/:projectId/assets')
  // The multer limit is a first gate so a 2 GB body is dropped at the socket rather than
  // buffered into memory. processUpload checks the same limit again on the bytes it gets.
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @User() user: CurrentUser,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<StoredAsset> {
    if (!file) throw new UploadRejected('UPLOAD_DAMAGED', 'No photo field in the request');

    return this.assets.upload(user.id, projectId, file.buffer);
  }

  @Get('projects/:projectId/assets')
  list(
    @User() user: CurrentUser,
    @Param('projectId') projectId: string,
  ): Promise<StoredAsset[]> {
    return this.assets.listFor(user.id, projectId);
  }

  @Get('assets/:id/reference')
  async reference(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { bytes, contentType } = await this.assets.readReference(user.id, id);

    // private, no-store: a seller's product photo must not sit in a shared cache or a
    // CDN edge, where the ownership check no longer applies (spec §7.4).
    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.send(bytes);
  }

  @Delete('assets/:id')
  @HttpCode(204)
  remove(@User() user: CurrentUser, @Param('id') id: string): Promise<void> {
    return this.assets.delete(user.id, id);
  }
}
