import { Module } from '@nestjs/common';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { PROJECT_OWNERSHIP } from './public/projects.port';

@Module({
  controllers: [ProjectsController],
  providers: [
    ProjectsService,
    // assets depends on the port, not on this class, so it can never reach past the
    // ownership check into a query of its own (R-7).
    { provide: PROJECT_OWNERSHIP, useExisting: ProjectsService },
  ],
  exports: [PROJECT_OWNERSHIP],
})
export class ProjectsModule {}
