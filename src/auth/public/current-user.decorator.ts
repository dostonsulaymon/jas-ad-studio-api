import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CurrentUser } from './auth.port';
import type { RequestWithUser } from './session.guard';

/**
 * Only valid on a route guarded by SessionGuard, which throws before the handler runs and
 * is therefore what makes the non-null assertion below true.
 */
export const User = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      throw new Error('@User() used on a route without SessionGuard');
    }

    return user;
  },
);
