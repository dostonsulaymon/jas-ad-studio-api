import type { INestApplication } from '@nestjs/common';

/**
 * D-032: everything public lives under /api on one origin. `/health` is deliberately
 * outside it, so a container healthcheck and the tunnel's own probe need no prefix.
 */
export const GLOBAL_PREFIX = 'api';
export const PREFIX_EXCLUDED = ['health/live', 'health/ready'];

export function applyGlobalSetup(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: PREFIX_EXCLUDED });
}

/** Resolves on the first termination signal. */
export function untilTerminated(keepAlive: boolean): Promise<NodeJS.Signals> {
  return new Promise((resolve) => {
    // Node's signal handles are unref'd. With no HTTP server and no queue processors
    // registered yet, nothing holds the event loop open and the worker would exit
    // straight after boot. The timer can go once BullMQ workers exist (P4).
    const timer = keepAlive ? setInterval(() => undefined, 60_000) : undefined;

    const stop = (signal: NodeJS.Signals) => (): void => {
      if (timer) clearInterval(timer);
      resolve(signal);
    };

    process.once('SIGTERM', stop('SIGTERM'));
    process.once('SIGINT', stop('SIGINT'));
  });
}
