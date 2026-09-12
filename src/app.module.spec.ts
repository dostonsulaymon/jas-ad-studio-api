import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from './app.module';
import { PG_POOL } from './common/db/tokens';
import { REDIS_CLIENT } from './common/redis/tokens';
import { HealthController } from './health/health.controller';
import { WorkerModule } from './worker.module';

/**
 * Nothing here connects to anything. The point is that the wiring resolves: every
 * provider a controller asks for exists, which is the failure a running container
 * would otherwise report as a crash loop.
 */
function stubbedModule(module: typeof AppModule | typeof WorkerModule) {
  return Test.createTestingModule({ imports: [module] })
    .overrideProvider(PG_POOL)
    .useValue({ query: vi.fn(), on: vi.fn(), end: vi.fn(), connect: vi.fn() })
    .overrideProvider(REDIS_CLIENT)
    .useValue({ ping: vi.fn(), on: vi.fn(), quit: vi.fn() })
    .compile();
}

describe('module wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('compiles the api module and can resolve the health controller', async () => {
    const app = await stubbedModule(AppModule);

    expect(app.get(HealthController)).toBeInstanceOf(HealthController);

    await app.close();
  });

  it('compiles the worker module, which shares the api wiring', async () => {
    const app = await stubbedModule(WorkerModule);

    expect(app.get(PG_POOL)).toBeDefined();
    expect(app.get(REDIS_CLIENT)).toBeDefined();

    await app.close();
  });
});
