import { DomainError } from '../../common/errors/app.error';

/**
 * Spec §9 names the codes the web app translates into Uzbek. A bare Nest HttpException
 * reaches the filter as "UNAUTHORIZED" and throws the distinction away.
 */

export class SessionExpiredError extends DomainError {
  readonly code = 'SESSION_EXPIRED';
  readonly status = 401;
}

export class CrossOriginRefusedError extends DomainError {
  readonly code = 'CROSS_ORIGIN_REFUSED';
  readonly status = 403;
}
