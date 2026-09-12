import { Global, Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PROJECT_BRIEF_READER, PROJECT_OWNERSHIP } from './public/projects.port';

/**
 * Global for the same reason AuthModule is: R-7 forbids assets/assets.module.ts from
 * importing this file, so the ownership port reaches it through the global scope
 * instead. Only PROJECT_OWNERSHIP is exported — assets gets the check and nothing else.
 */
@Global()
@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    // assets depends on the port, not on this class, so it can never reach past the
    // ownership check into a query of its own (R-7).
    { provide: PROJECT_OWNERSHIP, useExisting: ProjectsService },
    { provide: PROJECT_BRIEF_READER, useExisting: ProjectsService },
  ],
  exports: [PROJECT_OWNERSHIP, PROJECT_BRIEF_READER],
})
export class ProjectsModule {}
