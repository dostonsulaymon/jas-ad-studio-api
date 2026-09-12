import { Inject, Module, type OnApplicationBootstrap } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { GENERATION_RUNNER, type GenerationRunner } from './generation/public/generation.port';

/**
 * The worker process: everything the api has, plus the job consumers actually running.
 *
 * The distinction matters. `GenerationModule` is registered in `AppModule`, so the api
 * process can queue work and serve the polling route — but only this module calls
 * `start()`, so only this process consumes jobs and runs the sweeper. Two processes both
 * sweeping would be harmless (the WHERE clause makes the sweep idempotent), but two
 * processes both consuming would double the concurrency nobody configured.
 */
@Module({
  imports: [AppModule],
})
export class WorkerModule implements OnApplicationBootstrap {
  constructor(
    @Inject(GENERATION_RUNNER) private readonly runner: GenerationRunner,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(WorkerModule.name);
  }

  onApplicationBootstrap(): void {
    this.runner.start();
    this.logger.info('Generation worker started');
  }
}
