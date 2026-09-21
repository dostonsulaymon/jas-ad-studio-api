import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import type { NextFunction, Request, Response } from 'express';
import { isPublicDeployment } from './common/config/public-origin';

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
  app.use(securityHeaders);
}

/** Every response: no framework banner, no MIME sniffing, never framed. */
export function securityHeaders(_request: Request, response: Response, next: NextFunction): void {
  response.removeHeader('X-Powered-By');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
}

/**
 * nestjs-zod's own marker for a schema it could not express. It is the only thing that
 * distinguishes a mangled nullable from a genuine array, and `cleanupOpenApiDoc` strips
 * it — so the repair has to happen before that runs.
 */
const EMPTY_TYPE_MARKER = 'x-nestjs_zod-empty-type';

interface MutableSchema {
  type?: unknown;
  items?: MutableSchema;
  properties?: Record<string, MutableSchema>;
  nullable?: boolean;
  [key: string]: unknown;
}

/**
 * Repairs every nullable field in the document.
 *
 * zod 4 emits a nullable as JSON Schema's `type: ["string", "null"]`, which is legal
 * JSON Schema and illegal in OpenAPI 3.0. Somewhere in the conversion that type array is
 * read as `type: "array"`, so **every nullable field arrived in the contract as an array
 * of its own type**: `messageUz` and `errorCode` as `string[]`, `payerReference` and
 * `rejectionReason` as `string[]` since P3 merged. A generated client (D-031) types them
 * that way, and the web app would render a nullable string as a list.
 *
 * Setting OpenAPI 3.1 does not help — the information is already gone by then. But
 * before `cleanupOpenApiDoc` runs, nestjs-zod leaves `x-nestjs_zod-empty-type` on
 * exactly the fields it mangled and not on real arrays, which is what makes the repair
 * decidable rather than guesswork.
 *
 * `{ marker, type: 'array', items: X }` becomes `{ ...X, nullable: true }`, which is how
 * OpenAPI 3.0 spells it.
 */
function repairNullableFields(node: MutableSchema | undefined): void {
  if (!node || typeof node !== 'object') return;

  for (const value of Object.values(node.properties ?? {})) repairNullableFields(value);
  repairNullableFields(node.items);

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const branch = node[key];
    if (Array.isArray(branch)) for (const child of branch) repairNullableFields(child as MutableSchema);
  }

  if (node[EMPTY_TYPE_MARKER] === true && node.type === 'array' && node.items) {
    const inner = node.items;
    delete node.items;
    delete node.type;
    Object.assign(node, inner, { nullable: true });
  }
}

/** Every component schema and every inline request/response body. */
function repairDocument(document: OpenAPIObject): OpenAPIObject {
  for (const schema of Object.values(document.components?.schemas ?? {})) {
    repairNullableFields(schema as MutableSchema);
  }
  for (const methods of Object.values(document.paths)) {
    for (const operation of Object.values(methods)) {
      repairNullableFields(operation as MutableSchema);
    }
  }
  return document;
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
    .setTitle('Promptly API')
    .setDescription('Ad concepts and Google Flow prompts for Uzbek sellers.')
    .setVersion('0.0.1')
    .build();

  // repair BEFORE cleanup: cleanup strips the marker the repair depends on.
  return cleanupOpenApiDoc(repairDocument(SwaggerModule.createDocument(app, config)));
}

/**
 * Off on a public deployment unless explicitly switched on: the docs page lists every route
 * and every request shape, and D-032 puts the API on one public origin behind the tunnel.
 * "Public" is judged by WEB_ORIGIN too, because the live stack runs NODE_ENV=development.
 */
export function mountSwagger(
  app: INestApplication,
  env: string,
  webOrigin: string,
  enabled: boolean,
): boolean {
  if (isPublicDeployment(env, webOrigin) && !enabled) return false;

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
