import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import type { Env } from '../common/config/env.schema';
import { PG_POOL } from '../common/db/tokens';
import { isUniqueViolation, withTransaction } from '../common/db/transaction';
import {
  CREDIT_LEDGER,
  type CreditLedgerPort,
} from '../credits/public/credits.port';
import {
  MODEL_INPUT_READER,
  type ModelInputReader,
} from '../assets/public/assets.port';
import {
  PROJECT_OWNERSHIP,
  type ProjectOwnership,
} from '../projects/public/projects.port';
import { LAUNCH_TARGET_ID } from '../ai/public/generator.port';
import { NeedsInputCache } from './needs-input.cache';
import { GenerationsRepo } from './generations.repo';
import { GenerationQueue } from './generation.queue';
import {
  GenerationNotFoundError,
  GenerationRateLimitedError,
  IdempotencyKeyRequiredError,
  JobInFlightError,
  NeedsInputCapError,
  NoAssetsError,
  SpendCapReachedError,
} from './public/generation.errors';
import type {
  AcceptedGeneration,
  GenerationDetail,
  JobStatus,
} from './public/generation.port';

@Injectable()
export class GenerationService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly repo: GenerationsRepo,
    private readonly queue: GenerationQueue,
    private readonly cache: NeedsInputCache,
    @Inject(CREDIT_LEDGER) private readonly credits: CreditLedgerPort,
    @Inject(PROJECT_OWNERSHIP) private readonly projects: ProjectOwnership,
    @Inject(MODEL_INPUT_READER) private readonly assets: ModelInputReader,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * TX 1 of spec §6. The order of the steps is the design:
   *
   * - ownership, assets and the rate limits are checked BEFORE any money moves
   * - the §29 cache is checked BEFORE the reserve, so a cached needs_input costs nothing
   *   at all (Addendum A §A5) rather than reserving and immediately releasing, which
   *   would litter the ledger with pairs that describe nothing
   * - the enqueue happens AFTER the commit: inside it, a rollback would leave a job in
   *   Redis pointing at a generation row that never existed
   */
  /**
   * D-021, behind PROJECT_GENERATION_PURGER: removes a deleted project's packages and cached
   * questions in one transaction. The generation rows and their ledger entries stay.
   */
  async purgeProject(userId: string, projectId: string): Promise<void> {
    await withTransaction(this.pool, async (tx) => {
      await this.repo.deletePackagesForProject(userId, projectId, tx);
      await this.cache.forgetProject(userId, projectId, tx);
    });
  }

  async request(
    userId: string,
    projectId: string,
    idempotencyKey: string | undefined,
  ): Promise<AcceptedGeneration> {
    if (!idempotencyKey?.trim()) {
      throw new IdempotencyKeyRequiredError('An Idempotency-Key header is required');
    }
    const key = idempotencyKey.trim().slice(0, 200);

    const project = await this.projects.getOwned(userId, projectId);

    const images = await this.assets.readModelInputs(userId, projectId);
    if (images.length === 0) {
      throw new NoAssetsError('This project has no product photos yet');
    }

    const perDay = this.config.get('GENERATIONS_PER_DAY_LIMIT', { infer: true });
    if ((await this.repo.countToday(userId, this.pool)) >= perDay) {
      throw new GenerationRateLimitedError(`More than ${String(perDay)} generations in a day`);
    }

    const cap = this.config.get('DAILY_AI_SPEND_LIMIT_USD', { infer: true });
    if ((await this.repo.spentTodayUsd(this.pool)) >= cap) {
      throw new SpendCapReachedError(`The day's AI spend has reached $${String(cap)}`);
    }

    // §29: identical inputs answer from the cache with no model call and no credit.
    const cached = await this.cache.lookup(userId, projectId, images);
    if (cached) {
      return {
        generationId: cached.generationId,
        status: 'needs_input',
        fromCache: true,
        questionsUz: cached.questionsUz,
      };
    }

    const perProject = this.config.get('NEEDS_INPUT_PER_PROJECT_PER_DAY', { infer: true });
    if ((await this.cache.missesToday(projectId)) >= perProject) {
      throw new NeedsInputCapError('Too many unanswered attempts for this project today');
    }

    let accepted: { generationId: string; status: JobStatus; reused: boolean };
    try {
      accepted = await withTransaction(this.pool, async (tx) => {
        // The INSERT comes before the reserve, and that order is the point.
        //
        // Five simultaneous clicks all miss a prior SELECT, so a check-then-insert would
        // have every one of them reserve a credit before the index refused four. Letting
        // the database resolve the key first means only the request that actually created
        // the row goes on to spend anything (§32).
        const created = await this.repo.insertIfAbsent(
          { userId, projectId, idempotencyKey: key, targetId: LAUNCH_TARGET_ID, formatId: project.formatId },
          tx,
        );

        if (!created) {
          // A duplicate click that lost the race cleanly. Reuse the job, charge nothing.
          const existing = await this.repo.findByKey(userId, key, tx);
          if (!existing) throw new JobInFlightError('A generation is already in flight');
          return { generationId: existing.id, status: existing.status, reused: true };
        }

        // Throws NoCreditsError (402) when the balance is empty, rolling the insert back
        // with it. Addendum A §A5: no paid call for a seller with nothing to spend.
        await this.credits.reserveOne(userId, created.id, tx);

        return { generationId: created.id, status: created.status, reused: false };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      /**
       * `generations` carries TWO unique indexes, and one row can violate both:
       * `generations_user_key` (a duplicate click) and
       * `generations_one_active_per_user` (a different job already running). The
       * ON CONFLICT arbiter only covers the first, and which one Postgres reports for a
       * row that breaks both is a matter of timing — that made this path flake 1 run in 4,
       * answering 409 to a duplicate click.
       *
       * So the answer comes from the data, not from the error: if a job exists for this
       * key, it was a duplicate click. The lookup runs on the pool because the aborted
       * transaction can no longer be queried.
       */
      const existing = await this.repo.findByKey(userId, key, this.pool);
      if (!existing) {
        throw new JobInFlightError('A generation is already in flight for this account');
      }
      accepted = { generationId: existing.id, status: existing.status, reused: true };
    }

    if (!accepted.reused) await this.queue.enqueue(accepted.generationId);

    return {
      generationId: accepted.generationId,
      status: accepted.status,
      fromCache: false,
      questionsUz: [],
    };
  }

  /**
   * The disconnect story: the result is in Postgres, so a client that lost the response
   * simply re-reads it.
   */
  async read(userId: string, generationId: string): Promise<GenerationDetail> {
    const found = await this.repo.findOwned(userId, generationId);
    if (!found) throw new GenerationNotFoundError('No generation with that id for this user');
    return found;
  }

  /**
   * A reopened project's prompts (R-002). The ownership check comes first, so another
   * seller's project — or a deleted one — is PROJECT_NOT_FOUND rather than an empty list
   * that would confirm the id exists.
   */
  async listForProject(userId: string, projectId: string): Promise<GenerationDetail[]> {
    await this.projects.getOwned(userId, projectId);
    return this.repo.listForProject(userId, projectId);
  }
}
