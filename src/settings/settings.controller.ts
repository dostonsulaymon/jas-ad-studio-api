import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { PublicSettingsDto } from './settings.dto';
import { SettingsService } from './settings.service';
import type { PublicSettings } from './public/settings.port';

/**
 * Spec §3: the gallery, the pack list and public settings work signed out. There is
 * nothing secret here — a card number a seller is meant to pay into is published by
 * definition — but this is the one route that returns configuration to an anonymous
 * caller, so nothing else gets added to it without asking.
 */
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('public')
  @ApiOperation({
    summary: 'Payment instructions and support contacts. Works signed out.',
  })
  @ApiOkResponse({ type: PublicSettingsDto })
  getPublic(): Promise<PublicSettings> {
    return this.settings.getPublic();
  }
}
