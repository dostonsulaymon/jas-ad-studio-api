import { Global, Module } from '@nestjs/common';
import { ProController } from './pro.controller';
import { ProService } from './pro.service';
import { PRO_ACCESS, PRO_ADMIN } from './public/pro.port';

/**
 * Global for the reason SettingsModule and GalleryModule are: R-7 forbids gallery/ and
 * owner/ from importing this file, so the port reaches them through the global scope.
 */
@Global()
@Module({
  controllers: [ProController],
  providers: [
    ProService,
    { provide: PRO_ACCESS, useExisting: ProService },
    { provide: PRO_ADMIN, useExisting: ProService },
  ],
  exports: [PRO_ACCESS, PRO_ADMIN],
})
export class ProModule {}
