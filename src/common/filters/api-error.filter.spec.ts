import { ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DomainError, InfraError } from '../errors/app.error';
import { ApiErrorFilter, type ApiError } from './api-error.filter';

class NoCreditsError extends DomainError {
  readonly code = 'NO_CREDITS';
  readonly status = HttpStatus.PAYMENT_REQUIRED;
  override readonly details = { available: 0 };
}

class SessionExpiredError extends DomainError {
  readonly code = 'SESSION_EXPIRED';
  readonly status = HttpStatus.UNAUTHORIZED;
}

class ProviderDownError extends InfraError {
  readonly code = 'AI_TIMEOUT';
}

function loggerStub(): PinoLogger {
  return { setContext: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as PinoLogger;
}

// The request is passed whole rather than as an optional id: a default parameter fires
// on an explicit `undefined` too, which silently gave the "no request id" case an id.
function run(
  exception: unknown,
  request: { id?: unknown } = { id: 'req-1' },
): { status: number; body: ApiError } {
  const json = vi.fn<(body: ApiError) => void>();
  const status = vi.fn<(code: number) => { json: typeof json }>(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status, json }),
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  new ApiErrorFilter(loggerStub()).catch(exception, host);

  const [statusCall] = status.mock.calls;
  const [jsonCall] = json.mock.calls;

  if (!statusCall || !jsonCall) throw new Error('filter did not answer the request');

  return { status: statusCall[0], body: jsonCall[0] };
}

describe('ApiErrorFilter', () => {
  it('maps a DomainError to its own status, code and translation key', () => {
    const { status, body } = run(new NoCreditsError('out of credits'));

    expect(status).toBe(HttpStatus.PAYMENT_REQUIRED);
    expect(body).toEqual({
      code: 'NO_CREDITS',
      messageKey: 'errors.no_credits',
      details: { available: 0 },
      requestId: 'req-1',
    });
  });

  it('omits details when a DomainError carries none', () => {
    const { body } = run(new SessionExpiredError('session gone'));

    expect(body).toEqual({
      code: 'SESSION_EXPIRED',
      messageKey: 'errors.session_expired',
      requestId: 'req-1',
    });
  });

  it('never leaks an InfraError message to the caller', () => {
    const { status, body } = run(new ProviderDownError('openai timed out after 60s'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('openai');
  });

  it('never leaks an unknown throw to the caller', () => {
    const { status, body } = run(new Error('connect ECONNREFUSED 127.0.0.1:5437'));

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('127.0.0.1');
  });

  it('reports a ZodError as a 400 naming the bad fields, not a 500', () => {
    const schema = z.object({ aspectRatio: z.enum(['9:16', '16:9']) });
    const parsed = schema.safeParse({ aspectRatio: '4:3' });

    const { status, body } = run(parsed.success ? null : parsed.error);

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body.code).toBe('VALIDATION_FAILED');
    expect(body.details?.['fields']).toEqual([
      expect.objectContaining({ path: 'aspectRatio' }),
    ]);
  });

  it('keeps a 4xx HttpException as itself', () => {
    const { status, body } = run(new HttpException('Nope', HttpStatus.NOT_FOUND));

    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(body.code).toBe('NOT_FOUND');
    expect(body.messageKey).toBe('errors.not_found');
  });

  it('flattens a 5xx HttpException to INTERNAL_ERROR so no internal wording escapes', () => {
    const { status, body } = run(
      new HttpException('pool exhausted', HttpStatus.INTERNAL_SERVER_ERROR),
    );

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(body)).not.toContain('pool');
  });

  it('omits requestId when the request has none', () => {
    const { body } = run(new SessionExpiredError('x'), {});

    expect(body).not.toHaveProperty('requestId');
  });

  it('logs 5xx with a stack and 4xx without', () => {
    const errorLogger = loggerStub();
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json: vi.fn() }), json: vi.fn() }),
        getRequest: () => ({ id: 'req-2' }),
      }),
    } as unknown as ArgumentsHost;

    const filter = new ApiErrorFilter(errorLogger);
    filter.catch(new ProviderDownError('boom'), host);
    filter.catch(new SessionExpiredError('x'), host);

    expect(errorLogger.error).toHaveBeenCalledOnce();
    expect(errorLogger.warn).toHaveBeenCalledOnce();
  });
});
