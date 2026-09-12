import { DomainError } from '../../common/errors/app.error';

/** Missing, or another user's. One answer for both, as everywhere else in this API. */
export class GenerationNotFoundError extends DomainError {
  readonly code = 'GENERATION_NOT_FOUND';
  readonly status = 404;
}

/** Spec §10: one running job per user. Raised when the partial unique index refuses. */
export class JobInFlightError extends DomainError {
  readonly code = 'JOB_IN_FLIGHT';
  readonly status = 409;
}

/** Source 01 §33: authenticated account-level limits. */
export class GenerationRateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly status = 429;
}

/**
 * 503, not 402.
 *
 * The daily spend cap is our limit, not the seller's fault, and it is temporary. A 402
 * would tell them to buy credits, which would not help and would not be true.
 */
export class SpendCapReachedError extends DomainError {
  readonly code = 'SPEND_CAP_REACHED';
  readonly status = 503;
}

/** §29: repeated free analysis attempts are capped per project per day. */
export class NeedsInputCapError extends DomainError {
  readonly code = 'NEEDS_INPUT_CAP';
  readonly status = 429;
}

/** §32 needs a key to make a retry idempotent; without one we cannot promise that. */
export class IdempotencyKeyRequiredError extends DomainError {
  readonly code = 'IDEMPOTENCY_KEY_REQUIRED';
  readonly status = 400;
}

/** A generation needs at least one product photo to look at. */
export class NoAssetsError extends DomainError {
  readonly code = 'NO_ASSETS';
  readonly status = 400;
}
