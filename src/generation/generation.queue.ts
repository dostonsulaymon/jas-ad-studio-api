import { Inject, Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/tokens';

export const GENERATION_QUEUE = 'generation';
export const GENERATE_JOB = 'generate';

export interface GenerateJobData {
  generationId: string;
}

@Injectable()
export class GenerationQueue implements OnApplicationShutdown {
  private queue: Queue<GenerateJobData> | null = null;
  private connection: Redis | null = null;

  constructor(@Inject(REDIS_CLIENT) private readonly shared: Redis) {}

  /**
   * Built on first use, not in the constructor: constructing a provider should not open a
   * socket. `openapi:generate` boots the whole app purely to read its routes, and every
   * module-wiring test compiles it against stubs — neither has any business connecting to
   * Redis.
   *
   * The queue gets its OWN connection, duplicated from the shared client. BullMQ wants a
   * connection it can configure and block on, and — the reason that actually bit —
   * `app.close()` runs every module's shutdown hook in an order nobody controls: when
   * RedisModule quit the shared client first, `queue.close()` waited for ever on a dead
   * socket. Owning the connection lets us close it after the queue, in that order.
   */
  private get(): Queue<GenerateJobData> {
    if (!this.queue) {
      this.connection = this.shared.duplicate();
      this.queue = new Queue<GenerateJobData>(GENERATION_QUEUE, {
        connection: this.connection,
      });
    }
    return this.queue;
  }

  /**
   * `jobId` is the generation id, so BullMQ itself refuses a duplicate enqueue — the
   * second add for the same generation is a no-op rather than a second run.
   *
   * `attempts: 1` on purpose. BullMQ retrying a job it believes failed, while our sweeper
   * also requeues it, is two retry mechanisms disagreeing about one credit. Postgres is
   * the source of truth (D-030): the lease and the sweeper decide, BullMQ only delivers.
   */
  async enqueue(generationId: string): Promise<void> {
    await this.get().add(
      GENERATE_JOB,
      { generationId },
      {
        jobId: generationId,
        attempts: 1,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    );
  }

  /**
   * A swept job needs a fresh delivery, and its original jobId is spent. The id carries a
   * suffix rather than reusing the generation id, because BullMQ would treat a repeat of
   * that id as the same job and drop it. Postgres still holds the truth about the job —
   * this is only the nudge to look at it again.
   */
  async requeue(generationId: string): Promise<void> {
    await this.get().add(
      GENERATE_JOB,
      { generationId },
      { jobId: `${generationId}:retry:${String(Date.now())}`, attempts: 1 },
    );
  }

  async onApplicationShutdown(): Promise<void> {
    // The queue first, then the socket it was using. The other order hangs.
    await this.queue?.close();
    this.connection?.disconnect();
  }
}
