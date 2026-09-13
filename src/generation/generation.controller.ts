import { Controller, Get, Headers, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { CurrentUser } from '../auth/public/auth.port';
import { User } from '../auth/public/current-user.decorator';
import { SessionGuard } from '../auth/public/session.guard';
import { AcceptedGenerationDto, GenerationDetailDto } from './generation.dto';
import { GenerationService } from './generation.service';
import type { AcceptedGeneration, GenerationDetail } from './public/generation.port';

@Controller()
@UseGuards(SessionGuard)
export class GenerationController {
  constructor(private readonly generations: GenerationService) {}

  /**
   * 202, not 201. The work has been accepted, not completed, and nothing exists at the
   * returned id's URL yet beyond a queued job. (D-076 is the same lesson from the other
   * direction: a POST that creates nothing must not claim 201.)
   */
  @Post('projects/:id/generations')
  @HttpCode(202)
  @ApiOperation({
    summary:
      'Queue one ad package. Costs one credit on success; a failure gives it back. ' +
      'The same Idempotency-Key returns the same job and never charges twice.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Per attempt, reused on retry. This is the double-click guard (§32).',
  })
  @ApiResponse({ status: 202, type: AcceptedGenerationDto })
  request(
    @User() user: CurrentUser,
    @Param('id') projectId: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<AcceptedGeneration> {
    return this.generations.request(user.id, projectId, idempotencyKey);
  }

  /**
   * The client polls this until the status is terminal. It is also the disconnect story:
   * the result lives in Postgres, so a reload re-reads it rather than losing it (§32).
   */
  @Get('generations/:id')
  @ApiOperation({
    summary: "One generation's status, and its package once it is ready. 404 if not yours.",
  })
  @ApiOkResponse({ type: GenerationDetailDto })
  read(@User() user: CurrentUser, @Param('id') id: string): Promise<GenerationDetail> {
    return this.generations.read(user.id, id);
  }

  /**
   * Every generation of one project, newest first, with its package where ready. This is
   * how a reopened project finds the prompts the seller already paid for (R-002).
   */
  @Get('projects/:id/generations')
  @ApiOperation({
    summary: "A project's generations, newest first, with packages where ready. 404 if not yours.",
  })
  @ApiOkResponse({ type: GenerationDetailDto, isArray: true })
  list(@User() user: CurrentUser, @Param('id') projectId: string): Promise<GenerationDetail[]> {
    return this.generations.listForProject(user.id, projectId);
  }
}
