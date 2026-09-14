import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import {
  GLOBAL_PREFIX,
  PREFIX_EXCLUDED,
  applyGlobalSetup,
  mountSwagger,
  securityHeaders,
  untilTerminated,
} from './bootstrap';
import { isPublicDeployment } from './common/config/public-origin';
import type { INestApplication } from '@nestjs/common';

describe('applyGlobalSetup', () => {
  it('puts every route under /api but leaves the health probes unprefixed', () => {
    const setGlobalPrefix = vi.fn();
    const use = vi.fn();

    applyGlobalSetup({ setGlobalPrefix, use } as unknown as INestApplication);

    expect(setGlobalPrefix).toHaveBeenCalledWith(GLOBAL_PREFIX, { exclude: PREFIX_EXCLUDED });
    expect(use).toHaveBeenCalledWith(securityHeaders);
    expect(GLOBAL_PREFIX).toBe('api');
    expect(PREFIX_EXCLUDED).toEqual(['health/live', 'health/ready']);
  });
});

describe('securityHeaders', () => {
  it('drops the framework banner and forbids sniffing and framing', () => {
    const headers = new Map<string, string>([['X-Powered-By', 'Express']]);
    const response = {
      removeHeader: (name: string) => headers.delete(name),
      setHeader: (name: string, value: string) => headers.set(name, value),
    } as unknown as Response;
    const next = vi.fn() as NextFunction;

    securityHeaders({} as Request, response, next);

    expect(headers.has('X-Powered-By')).toBe(false);
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(next).toHaveBeenCalled();
  });
});

describe('isPublicDeployment', () => {
  it('treats production or an https web origin as public', () => {
    expect(isPublicDeployment('production', 'http://localhost:3042')).toBe(true);
    // The live stack: development mode, served over the tunnel.
    expect(isPublicDeployment('development', 'https://jas.kitobnarxi.uz')).toBe(true);
    expect(isPublicDeployment('development', 'http://localhost:3042')).toBe(false);
  });
});

describe('mountSwagger', () => {
  it('keeps the docs off a public deployment unless switched on', () => {
    const app = {} as INestApplication;

    expect(mountSwagger(app, 'development', 'https://jas.kitobnarxi.uz', false)).toBe(false);
    expect(mountSwagger(app, 'production', 'http://localhost:3042', false)).toBe(false);
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
