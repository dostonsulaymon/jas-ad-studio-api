import { Inject, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  HEALTH_CHECK_TIMEOUT_MS,
  READINESS_INDICATORS,
  type IndicatorState,
  type ReadinessIndicator,
  type ReadinessReport,
} from './health.types';

@Injectable()
export class HealthService {
  constructor(
    @Inject(READINESS_INDICATORS)
    private readonly indicators: readonly ReadinessIndicator[],
    @Inject(HEALTH_CHECK_TIMEOUT_MS)
    private readonly timeoutMs: number,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthService.name);
  }

  async readiness(): Promise<ReadinessReport> {
    const results = await Promise.all(
      this.indicators.map(async (indicator): Promise<[string, IndicatorState]> => {
        try {
          await this.withTimeout(indicator.check(), indicator.name);
          return [indicator.name, 'up'];
        } catch (error) {
          this.logger.warn({ err: error, indicator: indicator.name }, 'Readiness check failed');
          return [indicator.name, 'down'];
        }
      }),
    );

    const checks = Object.fromEntries(results);
    const ready = results.every(([, state]) => state === 'up');

    return { status: ready ? 'ready' : 'not_ready', checks };
  }

  /**
   * A dependency that hangs is worse than one that fails: unbounded, a stuck socket
   * would hold /health/ready open instead of letting it report 'down'.
   */
  private async withTimeout(check: Promise<void>, name: string): Promise<void> {
    let timer: NodeJS.Timeout | undefined;

    const expiry = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Readiness check "${name}" timed out after ${String(this.timeoutMs)}ms`));
      }, this.timeoutMs);
    });

    try {
      await Promise.race([check, expiry]);
    } finally {
      clearTimeout(timer);
    }
  }
}
