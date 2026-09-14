import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { applyGlobalSetup, mountSwagger, SWAGGER_PATH, untilTerminated } from './bootstrap';
import type { Env } from './common/config/env.schema';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  const logger = app.get(Logger);
  app.useLogger(logger);
  applyGlobalSetup(app);

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const docsMounted = mountSwagger(
    app,
    nodeEnv,
    config.get('WEB_ORIGIN', { infer: true }),
    config.get('SWAGGER_ENABLED', { infer: true }),
  );

  const port = config.get('PORT', { infer: true });
  await app.listen(port);

  if (docsMounted) logger.log(`API docs on http://localhost:${String(port)}/${SWAGGER_PATH}`);

  // Signals are handled here rather than via enableShutdownHooks(), which installs its
  // own listeners and re-raises the signal, killing the process before the connection
  // pool has drained.
  const signal = await untilTerminated(false);
  logger.log(`Received ${signal}, shutting down`);

  await app.close();
}

// A boot failure must kill the process. Without this, a throw before app.listen() left
// the pool holding the event loop open: alive, listening to nothing, and reported by pm2
// as online. A zombie that looks healthy is worse than a crash.
bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
