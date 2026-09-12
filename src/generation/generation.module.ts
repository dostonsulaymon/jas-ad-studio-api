import { Global, Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationQueue } from './generation.queue';
import { GenerationService } from './generation.service';
import { GenerationWorker } from './generation.worker';
import { GenerationsRepo } from './generations.repo';
import { NeedsInputCache } from './needs-input.cache';
import { SettleService } from './settle.service';
import { GENERATION_RUNNER } from './public/generation.port';

/**
 * Registered in BOTH entrypoints, and they are different files for a reason: `api` serves
 * the two routes, `worker` starts the processor and the sweeper. An unregistered worker
 * looks exactly like a slow one, which is why Task 5 Step 4 verifies it by watching a job
 * actually move.
 */
@Global()
@Module({
  controllers: [GenerationController],
  providers: [
    GenerationsRepo,
    GenerationQueue,
    NeedsInputCache,
    SettleService,
    GenerationService,
    GenerationWorker,
    { provide: GENERATION_RUNNER, useExisting: GenerationWorker },
  ],
  exports: [GENERATION_RUNNER],
})
export class GenerationModule {}
