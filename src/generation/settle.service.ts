import { Inject, Injectable, Optional } from '@nestjs/common';
import { EVENT_LOG, type EventLog } from '../events/public/events.port';
import { Pool } from 'pg';
import type { AdGeneratorOutcome } from '../ai/public/generator.port';
import type { ReferenceImage } from '../ai/public/provider.port';
import { PG_POOL } from '../common/db/tokens';
import { withTransaction } from '../common/db/transaction';
import { CREDIT_LEDGER, type CreditLedgerPort } from '../credits/public/credits.port';
import { GenerationsRepo, type SettleFields } from './generations.repo';
import { NeedsInputCache } from './needs-input.cache';
import type { JobStatus } from './public/generation.port';

export interface SettleInput {
  generationId: string;
  leaseToken: string;
  userId: string;
  projectId: string;
  images: ReferenceImage[];
  outcome: AdGeneratorOutcome;
}

/** True when the settle took; false when the lease had already moved on. */
export type SettleResult = { applied: boolean; status: JobStatus };

/**
 * TX 2 of spec §6. One place decides how an outcome becomes rows, so the worker itself
 * writes nothing.
 *
 * Every settle is conditional on the lease token. A stale worker updates 0 rows and its
 * result is dropped: no package, no debit, no release. Source 01 §32 — "a late success
 * cannot race a refund and create both a successful free generation and restored credit."
 */
@Injectable()
export class SettleService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly repo: GenerationsRepo,
    private readonly cache: NeedsInputCache,
    @Inject(CREDIT_LEDGER) private readonly credits: CreditLedgerPort,
    // Optional so the P4 test harness, which builds this class by hand, needs no event log.
    @Optional() @Inject(EVENT_LOG) private readonly events?: EventLog,
  ) {}

  async settle(input: SettleInput): Promise<SettleResult> {
    const { status, fields, package: pkg } = interpret(input.outcome);

    const settled = await withTransaction(this.pool, async (tx) => {
      const userId = await this.repo.settle(
        input.generationId,
        input.leaseToken,
        { ...fields, status },
        tx,
      );

      // The lease moved on while we were calling the provider. Roll back and say so.
      if (userId === null) return { applied: false, status };

      if (status === 'ready' && pkg) {
        // The package and the debit in ONE transaction. A package without a debit is a
        // free generation; a debit without a package is theft. Neither can exist.
        await this.repo.insertPackage(input.generationId, pkg.result, pkg.promptEn, tx);
        await this.credits.debit(userId, input.generationId, tx);
      } else {
        // D-020: needs_input, refused and failed all give the credit back. This IS the
        // whole of "auto-refund" — there is no separate refund system.
        await this.credits.release(userId, input.generationId, tx);

        if (status === 'needs_input') {
          await this.cache.remember(
            userId,
            input.projectId,
            NeedsInputCache.key(userId, input.projectId, input.images),
            fields.questionsUz,
            tx,
          );
        }
      }

      return { applied: true, status };
    });

    // After the commit, so a rolled-back settle never shows up as a finished generation.
    if (settled.applied) await this.events?.record('generation_settled', input.userId || null, { status });
    return settled;
  }

  /**
   * A job that could not even be attempted — a missing target, unreadable photos. It
   * still releases the credit: the seller must not pay for our failure to set up the call.
   */
  async settleFailure(
    generationId: string,
    leaseToken: string,
    errorCode: string,
  ): Promise<SettleResult> {
    return this.settle({
      generationId,
      leaseToken,
      userId: '',
      projectId: '',
      images: [],
      outcome: {
        status: 'failed',
        code: errorCode,
        message: errorCode,
        firstAttemptErrors: [],
        repairErrors: [],
      },
    });
  }
}

interface Interpreted {
  /** Only the terminal four: a settle never writes a job back to queued or running. */
  status: SettleFields['status'];
  fields: Omit<SettleFields, 'status'>;
  package: { result: unknown; promptEn: string } | null;
}

/**
 * Maps P1's outcome onto a job status and the row it writes.
 *
 * A provider failure never reaches a seller as its own text (spec §9): it becomes one of
 * the §9 codes, and the raw message stays in the worker's log.
 */
function interpret(outcome: AdGeneratorOutcome): Interpreted {
  if (outcome.status === 'failed') {
    return {
      status: 'failed',
      fields: {
        promptVersion: null,
        provider: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        estCostUsd: null,
        errorCode: outcome.code,
        messageUz: null,
        questionsUz: [],
      },
      package: null,
    };
  }

  const result = outcome.result;
  const usage = {
    // D-097: the version was produced and then dropped, so no row could say which prompt wrote it.
    promptVersion: outcome.usage.promptVersion,
    provider: outcome.usage.provider,
    model: outcome.usage.model,
    inputTokens: outcome.usage.inputTokens,
    outputTokens: outcome.usage.outputTokens,
    // Recorded on EVERY outcome that reached the provider: a call that then failed
    // validation still cost money, and the daily cap is a sum over this column (§10).
    estCostUsd: outcome.usage.estimatedCostUsd,
  };

  if (result.status === 'needs_input') {
    return {
      status: 'needs_input',
      fields: { ...usage, errorCode: null, messageUz: null, questionsUz: result.questionsUz },
      package: null,
    };
  }

  if (result.status === 'refused') {
    return {
      status: 'refused',
      fields: { ...usage, errorCode: null, messageUz: result.messageUz, questionsUz: [] },
      package: null,
    };
  }

  return {
    status: 'ready',
    fields: { ...usage, errorCode: null, messageUz: null, questionsUz: [] },
    package: { result, promptEn: result.promptEn ?? '' },
  };
}
