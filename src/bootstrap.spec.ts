import { describe, expect, it, vi } from 'vitest';
import { GLOBAL_PREFIX, PREFIX_EXCLUDED, applyGlobalSetup, untilTerminated } from './bootstrap';
import type { INestApplication } from '@nestjs/common';

describe('applyGlobalSetup', () => {
  it('puts every route under /api but leaves the health probes unprefixed', () => {
    const setGlobalPrefix = vi.fn();

    applyGlobalSetup({ setGlobalPrefix } as unknown as INestApplication);

    expect(setGlobalPrefix).toHaveBeenCalledWith(GLOBAL_PREFIX, { exclude: PREFIX_EXCLUDED });
    expect(GLOBAL_PREFIX).toBe('api');
    expect(PREFIX_EXCLUDED).toEqual(['health/live', 'health/ready']);
  });
});

describe('untilTerminated', () => {
  it('resolves with the signal that arrived', async () => {
    const terminated = untilTerminated(false);

    process.emit('SIGTERM');

    await expect(terminated).resolves.toBe('SIGTERM');
  });

  it('clears its keep-alive timer, so the process is free to exit after shutdown', async () => {
    const clear = vi.spyOn(globalThis, 'clearInterval');

    const terminated = untilTerminated(true);
    process.emit('SIGINT');
    await terminated;

    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
