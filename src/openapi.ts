/**
 * D-031: the OpenAPI document is generated from the real application, not from a
 * hand-kept list. The app is built without listening, so every route that exists is in
 * the document and one that does not, is not — the web repo generates its client from
 * this file (D-025), and a contract that can drift silently is the failure to avoid.
 *
 *   pnpm openapi:generate   write openapi.json
 *   pnpm openapi:check      fail if openapi.json is stale (CI runs this)
 *
 * It is compiled by `nest build` rather than run through tsx: esbuild does not emit
 * decorator metadata, and without it NestFactory.create() cannot resolve constructor
 * types — it exits silently, producing no document and no error.
 */
import 'reflect-metadata';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { AppModule } from './app.module';
import { applyGlobalSetup } from './bootstrap';

const OUTPUT = join(process.cwd(), 'openapi.json');

async function buildDocument(): Promise<string> {
  const app = await NestFactory.create(AppModule, { logger: false });
  applyGlobalSetup(app);
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('JAS Ad Studio API')
    .setDescription('Ad concepts and Google Flow prompts for Uzbek sellers.')
    .setVersion('0.0.1')
    .build();

  // cleanupOpenApiDoc resolves the zod schemas @nestjs/swagger collected from
  // createZodDto classes into real component schemas, so the zod definitions stay the
  // single source for every request and response shape (D-031).
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config));
  await app.close();

  return `${JSON.stringify(document, null, 2)}\n`;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  const generated = await buildDocument();

  if (mode === 'write') {
    writeFileSync(OUTPUT, generated);
    console.log(`Wrote ${OUTPUT}`);
    return;
  }

  if (mode === 'check') {
    if (!existsSync(OUTPUT)) {
      console.error('openapi.json is missing. Run `pnpm openapi:generate`.');
      process.exitCode = 1;
      return;
    }

    if (readFileSync(OUTPUT, 'utf8') !== generated) {
      console.error('openapi.json is out of date. Run `pnpm openapi:generate` and commit it.');
      process.exitCode = 1;
      return;
    }

    console.log('openapi.json is up to date.');
    return;
  }

  console.error('Usage: openapi.ts <write|check>');
  process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
