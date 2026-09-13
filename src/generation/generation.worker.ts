import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type Job } from 'bullmq';
import type Redis from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import { Pool } from 'pg';
import { AD_GENERATOR, type AdGenerator } from '../ai/public/generator.port';
import { GALLERY_READER, type GalleryReader } from '../gallery/public/gallery.port';
import { MODEL_INPUT_READER, type ModelInputReader } from '../assets/public/assets.port';
import type { Env } from '../common/config/env.schema';
import { PG_POOL } from '../common/db/tokens';
import { REDIS_CLIENT } from '../common/redis/tokens';
import { withTransaction } from '../common/db/transaction';
import { CREDIT_LEDGER, type CreditLedgerPort } from '../credits/public/credits.port';
import {
  PROJECT_BRIEF_READER,
  type ProjectBriefReader,
} from '../projects/public/projects.port';
import { GenerationsRepo } from './generations.repo';
import {
  GENERATE_JOB,
  GENERATION_QUEUE,
  GenerationQueue,
  type GenerateJobData,
} from './generation.queue';
import { SettleService } from './settle.service';
import type { GenerationRunner } from './public/generation.port';

/**
 * The worker process's half of spec §6.
 *
 * The provider call happens OUTSIDE any transaction. A model call takes seconds, and a
 * transaction holding a row lock for seconds is how a connection pool runs dry. It is the
 * single most important rule in this phase, and it is why `runOne` opens no transaction
 * of its own — the claim and the settle each open their own, with the call in between.
 */
@Injectable()
export class GenerationWorker implements GenerationRunner, OnApplicationShutdown {
  private worker: Worker<GenerateJobData> | null = null;
  private workerConnection: Redis | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly repo: GenerationsRepo,
    private readonly settleService: SettleService,
    private readonly queue: GenerationQueue,
    @Inject(AD_GENERATOR) private readonly generator: AdGenerator,
    @Inject(GALLERY_READER) private readonly gallery: GalleryReader,
    @Inject(MODEL_INPUT_READER) private readonly assets: ModelInputReader,
    @Inject(PROJECT_BRIEF_READER) private readonly projects: ProjectBriefReader,
    @Inject(CREDIT_LEDGER) private readonly credits: CreditLedgerPort,
    @Inject(REDIS_CLIENT) private readonly connection: Redis,
    private readonly config: ConfigService<Env, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GenerationWorker.name);
  }

  /** Started by the worker entrypoint only. The api process must never call this. */
  start(): void {
    // Its own connection, for the same reason the queue has one: BullMQ blocks on it,
    // and shutdown order is not ours to control.
    this.workerConnection = this.connection.duplicate();

    this.worker = new Worker<GenerateJobData>(
      GENERATION_QUEUE,
      async (job: Job<GenerateJobData>) => {
        if (job.name !== GENERATE_JOB) return;
        await this.runOne(job.data.generationId);
      },
      {
        connection: this.workerConnection,
        concurrency: this.config.get('WORKER_CONCURRENCY', { infer: true }),
      },
    );

    const leaseMinutes = this.config.get('JOB_LEASE_MINUTES', { infer: true });
    // Half the lease, so a dead job is never left sitting for a whole lease period.
    this.sweepTimer = setInterval(
      () => {
        void this.sweepExpired();
      },
      (leaseMinutes * 60 * 1000) / 2,
    );
    this.sweepTimer.unref();
  }

  async runOne(generationId: string): Promise<void> {
    const leaseMinutes = this.config.get('JOB_LEASE_MINUTES', { infer: true });
    const claimed = await this.repo.claim(generationId, leaseMinutes);

    // Someone else owns it, or it already finished. Not an error: treating it as one
    // fills the log with alarm about correct behaviour.
    if (!claimed) return;

    const model = this.config.get('OPENAI_MODEL', { infer: true });
    if (!model) {
      // D-041/§27: never guess a model name. Fail the job and give the credit back.
      await this.settleService.settleFailure(generationId, claimed.leaseToken, 'CONFIG_MISSING');
      return;
    }

    let images;
    let brief;
    try {
      images = await this.assets.readModelInputs(claimed.userId, claimed.projectId);
      brief = await this.projects.readBrief(claimed.userId, claimed.projectId);
    } catch (error) {
      this.logger.error({ err: error, generationId }, 'Could not load the generation input');
      await this.settleService.settleFailure(generationId, claimed.leaseToken, 'AI_MALFORMED');
      return;
    }

    /**
     * Source 01 §13, §25: the seller sends an id, the server resolves it. A client-
     * supplied example body would be a way to put arbitrary text in the prompt.
     *
     * An id that no longer resolves generates anyway, with no inspiration. The owner can
     * unpublish an example between the seller saving the brief and the worker picking the
     * job up, and a credit that is already reserved must not be lost over a missing style
     * hint — the seller's own product is unaffected.
     */
    const inspiration = brief.galleryInspirationId
      ? await this.gallery.resolveInspiration(brief.galleryInspirationId)
      : null;

    // OUTSIDE any transaction — see the class comment.
    const outcome = await this.generator.generate({
      brief,
      targetId: claimed.targetId,
      images,
      model,
      inspiration,
    });

    const settled = await this.settleService.settle({
      generationId,
      leaseToken: claimed.leaseToken,
      userId: claimed.userId,
      projectId: claimed.projectId,
      images,
      outcome,
    });

    if (!settled.applied) {
      // The sweeper took the job while the call was in flight. Its release has already
      // happened, so dropping this result is the correct outcome — not a failure to
      // report loudly, and above all not something to retry.
      this.logger.warn({ generationId }, 'Lease had moved on; result dropped');
    }
  }

  /**
   * Expired leases return to the queue, or fail after three attempts. The status change
   * and the release share one transaction, so a swept job cannot lose its credit.
   */
  async sweepExpired(): Promise<number> {
    try {
      const swept = await withTransaction(this.pool, async (tx) => {
        const rows = await this.repo.sweepExpired(tx);

        for (const row of rows) {
          if (row.status === 'failed') {
            await this.credits.release(row.userId, row.id, tx);
          }
        }
        return rows;
      });

      for (const row of swept) {
        if (row.status === 'queued') await this.queue.requeue(row.id);
      }

      return swept.length;
    } catch (error) {
      this.logger.error({ err: error }, 'Sweep failed');
      return 0;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    await this.worker?.close();
    this.workerConnection?.disconnect();
  }
}
