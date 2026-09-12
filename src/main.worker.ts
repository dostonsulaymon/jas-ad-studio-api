import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { untilTerminated } from './bootstrap';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  // No HTTP server: the worker only runs queue processors.
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);
  logger.log('Worker started');

  const signal = await untilTerminated(true);
  logger.log(`Received ${signal}, shutting down`);

  await app.close();
}

void bootstrap();
