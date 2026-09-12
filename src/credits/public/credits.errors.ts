import { DomainError, InfraError } from '../../common/errors/app.error';

/**
 * Spec §9 names the codes the web app turns into Uzbek. Three of these are new to the
 * spec's list and are recorded in D-073.
 */

/** Spec §6: an empty balance is a 402, not a 403 — the seller can fix it by buying. */
export class NoCreditsError extends DomainError {
  readonly code = 'NO_CREDITS';
  readonly status = 402;
}

/**
 * Missing, or someone else's. One answer for both, as P2 settled for project ids: a 403
 * would confirm the id exists, which is itself the leak.
 */
export class OrderNotFoundError extends DomainError {
  readonly code = 'ORDER_NOT_FOUND';
  readonly status = 404;
}

export class OrderNotPendingError extends DomainError {
  readonly code = 'ORDER_NOT_PENDING';
  readonly status = 409;
}

/** The pack is unknown, inactive, or has no price. D-009: an unpriced pack is not for sale. */
export class PackNotAvailableError extends DomainError {
  readonly code = 'PACK_NOT_AVAILABLE';
  readonly status = 409;
}

/** Addendum A §A3: a grant without a reason is not auditable. */
export class GrantNoteRequiredError extends DomainError {
  readonly code = 'GRANT_NOTE_REQUIRED';
  readonly status = 400;
}

/**
 * Addendum A §A4 step 2. An order the seller cannot act on is worse than no order: it
 * banks a pending row the owner can never match to a payment.
 */
export class PaymentNotConfiguredError extends DomainError {
  readonly code = 'PAYMENT_NOT_CONFIGURED';
  readonly status = 409;
}

export class OrderRateLimitedError extends DomainError {
  readonly code = 'RATE_LIMITED';
  readonly status = 429;
}

/**
 * Not a DomainError. A debit or release against an empty reservation cannot be caused by
 * a seller — only by our own bug — so it must page us rather than apologise to them.
 */
export class LedgerInvariantError extends InfraError {
  readonly code = 'LEDGER_INVARIANT';
}
