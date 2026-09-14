import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { PROJECT_ASSET_PURGER, type ProjectAssetPurger } from '../assets/public/assets.port';
import { PROJECT_GENERATION_PURGER, type ProjectGenerationPurger } from '../generation/public/generation.port';
import { EVENT_LOG, type EventLog } from '../events/public/events.port';
import { ApiBody, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { BriefDto, ProjectDetailDto, ProjectSummaryDto } from './projects.dto';
import { briefSchema, type Brief } from '../ai/public/brief.schema';
import { User } from '../auth/public/current-user.decorator';
import type { CurrentUser } from '../auth/public/auth.port';
import { SessionGuard } from '../auth/public/session.guard';
import { ProjectsService, type ProjectInput } from './projects.service';
import type { ProjectDetail, ProjectSummary } from './public/projects.port';

/**
 * Every route takes the caller's own id from the session and passes it as the first
 * argument. No route accepts a user id from the client, so there is nothing to tamper
 * with.
 */
@Controller('projects')
@UseGuards(SessionGuard)
export class ProjectsController {
  constructor(
    private readonly projects: ProjectsService,
    @Inject(PROJECT_ASSET_PURGER) private readonly assets: ProjectAssetPurger,
    @Inject(PROJECT_GENERATION_PURGER) private readonly generations: ProjectGenerationPurger,
    @Inject(EVENT_LOG) private readonly events: EventLog,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a project from the seller's brief." })
  @ApiBody({ type: BriefDto })
  @ApiCreatedResponse({ type: ProjectSummaryDto })
  async create(@User() user: CurrentUser, @Body() body: unknown): Promise<ProjectSummary> {
    const project = await this.projects.create(user.id, toInput(briefSchema.parse(body)));
    await this.events.record('project_created', user.id, { formatId: project.formatId });
    return project;
  }

  @Get()
  @ApiOperation({ summary: "The caller's own projects, newest first. Deleted ones are omitted." })
  @ApiOkResponse({ type: ProjectSummaryDto, isArray: true })
  list(@User() user: CurrentUser): Promise<ProjectSummary[]> {
    return this.projects.listFor(user.id);
  }

  @Get(':id')
  @ApiOperation({
    summary: "One project and the brief it was saved from. 404 if it is not the caller's, never 403.",
  })
  @ApiOkResponse({ type: ProjectDetailDto })
  get(@User() user: CurrentUser, @Param('id') id: string): Promise<ProjectDetail> {
    // Returns the brief too: PATCH requires all 11 fields, so a client that could only
    // read 3 of them could not edit a saved project without wiping the rest.
    return this.projects.getOwnedDetail(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Replace the brief. Every field is required.' })
  @ApiBody({ type: BriefDto })
  @ApiOkResponse({ type: ProjectSummaryDto })
  update(
    @User() user: CurrentUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<ProjectSummary> {
    return this.projects.update(user.id, id, toInput(briefSchema.parse(body)));
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({
    summary: 'Delete: the brief, photos and generated packages are removed (D-021). Generation and ledger rows stay.',
  })
  @ApiNoContentResponse()
  async remove(@User() user: CurrentUser, @Param('id') id: string): Promise<void> {
    // The soft delete checks ownership and throws first, so the purges only ever run on the
    // caller's own project.
    await this.projects.softDelete(user.id, id);
    await this.assets.purgeProject(user.id, id);
    await this.generations.purgeProject(user.id, id);
    await this.events.record('project_deleted', user.id);
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
