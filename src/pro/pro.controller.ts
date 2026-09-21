import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { ProStatusDto } from './pro.dto';
import { ProService } from './pro.service';
import { OptionalSessionGuard, type RequestWithUser } from '../auth/public/session.guard';
import type { ProStatus } from './public/pro.port';

@Controller('pro')
export class ProController {
  constructor(private readonly pro: ProService) {}

  /**
   * Answers for a signed-out visitor too, with `hasPro: false`, so the landing page can
   * ask once and render the gallery the same way in both cases. Guarding it would make
   * the signed-out path an error to be handled instead of an answer.
   */
  @Get('me')
  @UseGuards(OptionalSessionGuard)
  @ApiOperation({ summary: 'Whether this caller may open PRO prompts. Works signed out.' })
  @ApiOkResponse({ type: ProStatusDto })
  @Header('Cache-Control', 'no-store')
  status(@Req() request: RequestWithUser): Promise<ProStatus> {
    return this.pro.status(request.user?.id ?? null);
  }
}
