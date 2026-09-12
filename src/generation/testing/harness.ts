import type { ConfigService } from '@nestjs/config';
import type { Pool } from 'pg';
import type { AdGenerator } from '../../ai/public/generator.port';
import type { ModelInputReader } from '../../assets/public/assets.port';
import type { Env } from '../../common/config/env.schema';
import type { CreditLedgerPort } from '../../credits/public/credits.port';
import type {
  ProjectBriefReader,
  ProjectOwnership,
} from '../../projects/public/projects.port';
import { GenerationQueue } from '../generation.queue';
import { GenerationService } from '../generation.service';
import { GenerationsRepo } from '../generations.repo';
import { NeedsInputCache } from '../needs-input.cache';
import { SettleService } from '../settle.service';

/**
 * Every collaborator outside this module is passed in as its PORT, never constructed
 * here: R-7 gives a test *helper* no exemption from the boundary lint, only a `.spec.ts`
 * gets that. Each spec builds the real services and hands them over as contracts — the
 * same shape P3's credits harness settled on.
 */
export interface GenerationDeps {
  credits: CreditLedgerPort;
  projects: ProjectOwnership;
  briefs: ProjectBriefReader;
  assets: ModelInputReader;
  generator: AdGenerator;
}

export interface GenerationLimits {
  generationsPerDay?: number;
  dailySpendUsd?: number;
  needsInputPerProjectPerDay?: number;
  leaseMinutes?: number;
}

/** Records what was enqueued instead of talking to Redis. */
export interface RecordingQueue {
  enqueued: string[];
  requeued: string[];
}

export interface GenerationHarness {
  repo: GenerationsRepo;
  cache: NeedsInputCache;
  settle: SettleService;
  service: GenerationService;
  queue: RecordingQueue;
}

export function buildGeneration(
  pool: Pool,
  deps: GenerationDeps,
  limits: GenerationLimits = {},
): GenerationHarness {
  const repo = new GenerationsRepo(pool);
  const cache = new NeedsInputCache(pool);
  const settle = new SettleService(pool, repo, cache, deps.credits);

  const enqueued: string[] = [];
  const requeued: string[] = [];
  // A stub, not a real Queue: these suites are about the database rules, and BullMQ
  // delivery is proven by the e2e gate with a real worker and a real Redis.
  const queue = {
    enqueue: (id: string) => {
      enqueued.push(id);
      return Promise.resolve();
    },
    requeue: (id: string) => {
      requeued.push(id);
      return Promise.resolve();
    },
  } as unknown as GenerationQueue;

  const config = {
    get: (key: keyof Env) => {
      switch (key) {
        case 'GENERATIONS_PER_DAY_LIMIT':
          return limits.generationsPerDay ?? 20;
        case 'DAILY_AI_SPEND_LIMIT_USD':
          return limits.dailySpendUsd ?? 2;
        case 'NEEDS_INPUT_PER_PROJECT_PER_DAY':
          return limits.needsInputPerProjectPerDay ?? 5;
        case 'JOB_LEASE_MINUTES':
          return limits.leaseMinutes ?? 5;
        default:
          return undefined;
      }
    },
  } as unknown as ConfigService<Env, true>;

  const service = new GenerationService(
    pool,
    repo,
    queue,
    cache,
    deps.credits,
    deps.projects,
    deps.assets,
    config,
  );

  return { repo, cache, settle, service, queue: { enqueued, requeued } };
}
