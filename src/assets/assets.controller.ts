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
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
} from '@nestjs/swagger';
import { StoredAssetDto } from './assets.dto';
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
  // The body is multipart, so there is no zod DTO for @nestjs/swagger to read. Without
  // these the operation appears in the contract with no request body at all: no file
  // picker in the docs, and nothing for the web repo's generated client to send (D-031).
  @ApiOperation({
    summary: 'Upload one product photo. At most four per project.',
    description:
      'The format is decided by decoding, never by filename or content-type. Two copies' +
      ' are stored — a 2048px reference and a 1024px model input — with all metadata' +
      ' stripped. width and height describe the reference copy (D-066).',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiCreatedResponse({ type: StoredAssetDto })
  upload(
    @User() user: CurrentUser,
    @Param('projectId') projectId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<StoredAsset> {
    if (!file) throw new UploadRejected('UPLOAD_DAMAGED', 'No photo field in the request');

    return this.assets.upload(user.id, projectId, file.buffer);
  }

  @Get('projects/:projectId/assets')
  @ApiOperation({ summary: "A project's reference photos, oldest first." })
  @ApiOkResponse({ type: StoredAssetDto, isArray: true })
  list(
    @User() user: CurrentUser,
    @Param('projectId') projectId: string,
  ): Promise<StoredAsset[]> {
    return this.assets.listFor(user.id, projectId);
  }

  @Get('assets/:id/reference')
  @ApiOperation({
    summary: 'Download the 2048px reference copy.',
    description: 'Private: never cached, and 404 once the project is deleted (D-068).',
  })
  @ApiProduces('image/jpeg')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
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
  @ApiOperation({ summary: 'Delete a photo. Both stored copies go, and the files with them.' })
  @ApiNoContentResponse()
  remove(@User() user: CurrentUser, @Param('id') id: string): Promise<void> {
    return this.assets.delete(user.id, id);
  }
}
