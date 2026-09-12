import { DomainError } from '../common/errors/app.error';

/**
 * Spec §9 names the codes the web app translates. A bare Nest HttpException would arrive
 * at the filter as "UNAUTHORIZED", losing the distinction the Uzbek copy depends on.
 */

export class SessionExpiredError extends DomainError {
  readonly code = 'SESSION_EXPIRED';
  readonly status = 401;
}

export class CrossOriginRefusedError extends DomainError {
  readonly code = 'CROSS_ORIGIN_REFUSED';
  readonly status = 403;
}
