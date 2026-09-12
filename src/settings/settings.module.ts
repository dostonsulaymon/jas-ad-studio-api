import { Global, Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SETTINGS_ADMIN, SETTINGS_READER } from './public/settings.port';

/**
 * Global for the reason AuthModule and ProjectsModule are: R-7 forbids credits/ and
 * owner/ from importing this file, so the ports reach them through the global scope.
 * Only the two tokens are exported.
 */
@Global()
@Module({
  controllers: [SettingsController],
  providers: [
    SettingsService,
    { provide: SETTINGS_READER, useExisting: SettingsService },
    { provide: SETTINGS_ADMIN, useExisting: SettingsService },
  ],
  exports: [SETTINGS_READER, SETTINGS_ADMIN],
})
export class SettingsModule {}
