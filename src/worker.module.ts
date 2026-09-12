import { Module } from '@nestjs/common';
import { AppModule } from './app.module';

/**
 * The worker process: everything the api has, plus the job consumers. The consumers
 * arrive in P4; until then this exists so both entrypoints are real from the start.
 */
@Module({
  imports: [AppModule],
})
export class WorkerModule {}
