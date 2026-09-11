import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import type { ReadinessReport } from './health.types';

/** Structural subset of the platform response, so this file stays framework-agnostic. */
interface StatusSettableResponse {
  status(code: number): unknown;
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  /**
   * Liveness: does no I/O on purpose. A dependency being down must never make the
   * orchestrator kill an otherwise healthy process.
   */
  @Get('live')
  @ApiOperation({ summary: 'Liveness. Always 200 while the process is running.' })
  @ApiResponse({ status: HttpStatus.OK, description: 'The process is alive.' })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness. 503 when a dependency is unusable.' })
  @ApiResponse({ status: HttpStatus.OK, description: 'Every dependency is up.' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    description: 'At least one dependency is down; the report names which.',
  })
  async ready(@Res({ passthrough: true }) res: StatusSettableResponse): Promise<ReadinessReport> {
    const report = await this.health.readiness();

    res.status(report.status === 'ready' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return report;
  }
}
