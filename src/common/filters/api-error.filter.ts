import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import { DomainError, messageKeyFor } from '../errors/app.error';

/** Spec §9. `requestId` is ours: support cannot trace a report without it. */
export interface ApiError {
  code: string;
  messageKey: string;
  details?: Record<string, unknown>;
  requestId?: string;
}

/** Structural subset of the platform response we rely on. */
interface HttpResponse {
  status(code: number): HttpResponse;
  json(body: unknown): void;
}

interface HttpRequest {
  id?: unknown;
}

/** Widened to number so comparing it against a plain status code is type-safe. */
const SERVER_ERROR_FLOOR: number = HttpStatus.INTERNAL_SERVER_ERROR;

const INTERNAL_ERROR = 'INTERNAL_ERROR';

@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  // Injected by type rather than with @InjectPinoLogger: the named-context token is
  // registered when LoggerModule is evaluated, which happens before this class is
  // decorated, so the named token would not exist yet.
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ApiErrorFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<HttpResponse>();
    const request = http.getRequest<HttpRequest>();
    const requestId = typeof request.id === 'string' ? request.id : undefined;

    const { status, body } = this.toApiError(exception, requestId);

    if (status >= SERVER_ERROR_FLOOR) {
      // Only 5xx carries an unexpected cause worth a stack trace.
      this.logger.error({ err: exception, code: body.code }, 'Request failed');
    } else {
      this.logger.warn({ code: body.code, status }, 'Request rejected');
    }

    response.status(status).json(body);
  }

  private toApiError(
    exception: unknown,
    requestId: string | undefined,
  ): { status: number; body: ApiError } {
    if (exception instanceof DomainError) {
      return {
        status: exception.status,
        body: {
          code: exception.code,
          messageKey: messageKeyFor(exception.code),
          ...(exception.details ? { details: exception.details } : {}),
          ...(requestId ? { requestId } : {}),
        },
      };
    }

    // A malformed request body is the caller's mistake, not ours. Without this branch
    // every validation failure falls through to the generic 500 below, which both
    // misreports whose fault it is and lets anyone probing query strings fill the error
    // log at will. zod's messages describe the contract, never internals.
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        body: {
          code: 'VALIDATION_FAILED',
          messageKey: messageKeyFor('VALIDATION_FAILED'),
          details: {
            fields: exception.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          },
          ...(requestId ? { requestId } : {}),
        },
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = status < SERVER_ERROR_FLOOR ? (HttpStatus[status] ?? 'HTTP_ERROR') : INTERNAL_ERROR;

      return {
        status,
        body: {
          code,
          messageKey: messageKeyFor(code),
          ...(requestId ? { requestId } : {}),
        },
      };
    }

    // Unknown failures and InfraError alike: never leak internals to the caller.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: {
        code: INTERNAL_ERROR,
        messageKey: messageKeyFor(INTERNAL_ERROR),
        ...(requestId ? { requestId } : {}),
      },
    };
  }
}
