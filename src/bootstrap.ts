import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/**
 * D-032: everything public lives under /api on one origin. `/health` is deliberately
 * outside it, so a container healthcheck and the tunnel's own probe need no prefix.
 */
export const GLOBAL_PREFIX = 'api';
export const PREFIX_EXCLUDED = ['health/live', 'health/ready'];

/** Swagger UI. Under /api so D-032's one-origin rule still holds. */
export const SWAGGER_PATH = 'api/docs';

export function applyGlobalSetup(app: INestApplication): void {
  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: PREFIX_EXCLUDED });
}

/**
 * The one document factory. `openapi.json` and the browsable UI are built from it by the
 * same code, so the page a human reads can never disagree with the contract the web repo
 * generates its client from (D-031).
 *
 * cleanupOpenApiDoc resolves the zod schemas @nestjs/swagger collected from createZodDto
 * classes into real component schemas.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('JAS Ad Studio API')
    .setDescription('Ad concepts and Google Flow prompts for Uzbek sellers.')
    .setVersion('0.0.1')
    .build();

  return cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
}

/**
 * Off in production unless explicitly switched on: the docs page lists every route and
 * every request shape, and D-032 puts the API on one public origin behind the tunnel.
 */
export function mountSwagger(app: INestApplication, env: string, enabled: boolean): boolean {
  if (env === 'production' && !enabled) return false;

  SwaggerModule.setup(SWAGGER_PATH, app, buildOpenApiDocument(app), {
    swaggerOptions: {
      persistAuthorization: true,
      // CsrfGuard demands this header on every unsafe method and Swagger UI does not send
      // it, so without the interceptor every POST, PATCH and DELETE from the docs page is
      // a 403. The session cookie needs no help: the docs are served from the API's own
      // origin, so the browser attaches it.
      requestInterceptor: (request: { headers: Record<string, string> }) => {
        request.headers['X-Requested-With'] = 'XMLHttpRequest';
        return request;
      },
    },
  });
  return true;
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
