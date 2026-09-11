/**
 * Two families of error.
 *
 * DomainError — an expected outcome the caller can act on. Maps to 4xx, and its code
 * becomes an Uzbek message in the web app (spec §9).
 *
 * InfraError — something we depend on failed. Maps to 5xx, is logged with its stack,
 * and never has its message returned to a caller.
 */
export abstract class AppError extends Error {
  abstract readonly code: string;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

export abstract class DomainError extends AppError {
  abstract readonly status: number;
  /** Extra facts the client may show or act on. Never internals. */
  readonly details?: Record<string, unknown>;
}

export abstract class InfraError extends AppError {
  readonly status = 500;
}

/**
 * The single translation key convention (spec §9). The web app owns the Uzbek strings;
 * the API only ever names the key, so a new error never ships an untranslated sentence.
 */
export function messageKeyFor(code: string): string {
  return `errors.${code.toLowerCase()}`;
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}

export function isInfraError(error: unknown): error is InfraError {
  return error instanceof InfraError;
}
