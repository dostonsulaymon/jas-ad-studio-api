import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { applyGlobalSetup, untilTerminated } from './bootstrap';
import type { Env } from './common/config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);
  applyGlobalSetup(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  await app.listen(config.get('PORT', { infer: true }));

  // Signals are handled here rather than via enableShutdownHooks(), which installs its
  // own listeners and re-raises the signal, killing the process before the connection
  // pool has drained.
  const signal = await untilTerminated(false);
  logger.log(`Received ${signal}, shutting down`);

  await app.close();
}

void bootstrap();
