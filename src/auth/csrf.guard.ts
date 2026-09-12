import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { CrossOriginRefusedError } from './auth.errors';
import { ALLOWED_ORIGINS } from './auth.tokens';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

interface CsrfRequest {
  method: string;
  headers: Record<string, string | undefined>;
}

/**
 * Spec §10. Two independent checks, because either one alone has a known bypass:
 * a custom header cannot be set by a cross-origin HTML form post, and an Origin header
 * cannot be forged by a browser. Together they close both.
 *
 * The comparison is exact-match against a list, never a prefix test — "localhost:3040"
 * as a prefix would also accept "localhost:3040.evil.example".
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ALLOWED_ORIGINS) private readonly allowedOrigins: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<CsrfRequest>();

    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (!origin || !this.allowedOrigins.includes(origin)) {
      throw new CrossOriginRefusedError('Origin is missing or not allowed');
    }

    if (!request.headers['x-requested-with']) {
      throw new CrossOriginRefusedError('Missing X-Requested-With');
    }

    return true;
  }
}
