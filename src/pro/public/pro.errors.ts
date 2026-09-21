import { DomainError } from '../../common/errors/app.error';

/**
 * The example exists and is published, but its prompt is PRO and this caller has none.
 *
 * 403, not 404: unlike an unpublished example, a PRO one is visible on the page with its
 * badge, so refusing it confirms nothing a visitor cannot already see. Hiding it as a 404
 * would make the badge a lie.
 */
export class PromptLockedError extends DomainError {
  readonly code = 'PROMPT_LOCKED';
  readonly status = 403;
}

/** PRO has no price yet (D-102), so there is nothing to sell. */
export class ProNotForSaleError extends DomainError {
  readonly code = 'PRO_NOT_FOR_SALE';
  readonly status = 409;
}

/** The order is not pending: it was already confirmed or rejected. Confirming twice is refused. */
export class ProOrderNotPendingError extends DomainError {
  readonly code = 'PRO_ORDER_NOT_PENDING';
  readonly status = 409;
}

export class ProOrderNotFoundError extends DomainError {
  readonly code = 'PRO_ORDER_NOT_FOUND';
  readonly status = 404;
}
