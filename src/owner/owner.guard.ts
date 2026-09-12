import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { DomainError } from '../common/errors/app.error';
import type { RequestWithUser } from '../auth/public/session.guard';

/**
 * A 404, not a 403.
 *
 * A 403 on /api/owner/orders tells a signed-in seller that the route exists and that
 * someone can use it. P2 settled this for project ids; the same reasoning applies to a
 * whole route tree — a refusal must not double as an inventory.
 */
export class OwnerRouteNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly status = 404;
}

/** Runs after SessionGuard, which has already put the user on the request. */
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    if (request.user?.role !== 'owner') {
      throw new OwnerRouteNotFoundError('Not an owner');
    }

    return true;
  }
}
