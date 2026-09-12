import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { briefSchema, type Brief } from '../ai/public/brief.schema';
import { User } from '../auth/public/current-user.decorator';
import type { CurrentUser } from '../auth/public/auth.port';
import { SessionGuard } from '../auth/public/session.guard';
import { ProjectsService, type ProjectInput } from './projects.service';
import type { ProjectSummary } from './public/projects.port';

/**
 * Every route takes the caller's own id from the session and passes it as the first
 * argument. No route accepts a user id from the client, so there is nothing to tamper
 * with.
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@User() user: CurrentUser, @Body() body: unknown): Promise<ProjectSummary> {
    return this.projects.create(user.id, toInput(briefSchema.parse(body)));
  }

  @Get()
  list(@User() user: CurrentUser): Promise<ProjectSummary[]> {
    return this.projects.listFor(user.id);
  }

  @Get(':id')
  get(@User() user: CurrentUser, @Param('id') id: string): Promise<ProjectSummary> {
    return this.projects.getOwned(user.id, id);
  }

  @Patch(':id')
  update(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProjectSummary> {
    return this.projects.update(user.id, id, toInput(briefSchema.parse(body)));
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@User() user: CurrentUser, @Param('id') id: string): Promise<void> {
    return this.projects.softDelete(user.id, id);
  }
}

function toInput(brief: Brief): ProjectInput {
  return {
    productName: brief.productName,
    description: brief.description,
    goal: brief.goal,
    formatId: brief.formatId,
    platform: brief.platform,
    aspectRatio: brief.aspectRatio,
    durationSeconds: brief.durationSeconds,
    audience: brief.audience,
    offer: brief.offer,
    confirmedClaims: brief.confirmedClaims,
    galleryInspirationId: brief.galleryInspirationId,
  };
}
