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
