import { HttpStatus } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import type { HealthService } from './health.service';
import type { ReadinessReport } from './health.types';

function controllerFor(report: ReadinessReport): {
  controller: HealthController;
  status: ReturnType<typeof vi.fn>;
} {
  const health = { readiness: () => Promise.resolve(report) } as unknown as HealthService;
  const status = vi.fn();

  return { controller: new HealthController(health), status };
}

describe('HealthController', () => {
  it('answers liveness without touching any dependency', () => {
    // Constructed with a service that throws if used: liveness must do no I/O, so a
    // dependency outage can never get a healthy process killed.
    const health = {
      readiness: () => {
        throw new Error('liveness must not run readiness checks');
      },
    } as unknown as HealthService;

    expect(new HealthController(health).live()).toEqual({ status: 'ok' });
  });

  it('returns 200 with the report when ready', async () => {
    const report: ReadinessReport = {
      status: 'ready',
      checks: { postgres: 'up', redis: 'up' },
    };
    const { controller, status } = controllerFor(report);

    await expect(controller.ready({ status })).resolves.toEqual(report);
    expect(status).toHaveBeenCalledWith(HttpStatus.OK);
  });

  it('returns 503 with the report when a dependency is down', async () => {
    const report: ReadinessReport = {
      status: 'not_ready',
      checks: { postgres: 'up', redis: 'down' },
    };
    const { controller, status } = controllerFor(report);

    await expect(controller.ready({ status })).resolves.toEqual(report);
    expect(status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
