import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PinoLogger } from 'nestjs-pino';
import { HealthService } from './health.service';
import type { ReadinessIndicator } from './health.types';

function indicator(name: string, behaviour: () => Promise<void>): ReadinessIndicator {
  return { name, check: behaviour };
}

function loggerStub(): PinoLogger {
  return { setContext: vi.fn(), warn: vi.fn() } as unknown as PinoLogger;
}

const up = (name: string): ReadinessIndicator => indicator(name, () => Promise.resolve());
const down = (name: string): ReadinessIndicator =>
  indicator(name, () => Promise.reject(new Error(`${name} is unreachable`)));

describe('HealthService.readiness', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('is ready when every indicator is up', async () => {
    const service = new HealthService([up('postgres'), up('redis')], 2000, loggerStub());

    await expect(service.readiness()).resolves.toEqual({
      status: 'ready',
      checks: { postgres: 'up', redis: 'up' },
    });
  });

  it('is not ready when postgres is down, and says which one', async () => {
    const service = new HealthService([down('postgres'), up('redis')], 2000, loggerStub());

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      checks: { postgres: 'down', redis: 'up' },
    });
  });

  it('is not ready when redis is down', async () => {
    const service = new HealthService([up('postgres'), down('redis')], 2000, loggerStub());

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      checks: { postgres: 'up', redis: 'down' },
    });
  });

  it('reports a hanging dependency as down instead of hanging the endpoint', async () => {
    const stuck = indicator('postgres', () => new Promise<void>(() => undefined));
    const service = new HealthService([stuck, up('redis')], 20, loggerStub());

    await expect(service.readiness()).resolves.toEqual({
      status: 'not_ready',
      checks: { postgres: 'down', redis: 'up' },
    });
  });

  it('checks every indicator even when an earlier one fails', async () => {
    const redisCheck = vi.fn(() => Promise.resolve());
    const service = new HealthService(
      [down('postgres'), indicator('redis', redisCheck)],
      2000,
      loggerStub(),
    );

    await service.readiness();

    expect(redisCheck).toHaveBeenCalledOnce();
  });

  it('logs a failed check as a warning rather than swallowing it', async () => {
    const logger = loggerStub();
    const service = new HealthService([down('redis')], 2000, logger);

    await service.readiness();

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ indicator: 'redis' }),
      'Readiness check failed',
    );
  });
});
