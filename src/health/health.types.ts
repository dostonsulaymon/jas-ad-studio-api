/** DI token for the readiness checks the app should run. */
export const READINESS_INDICATORS = Symbol('READINESS_INDICATORS');

/** DI token for how long a single readiness check may take, from validated config. */
export const HEALTH_CHECK_TIMEOUT_MS = Symbol('HEALTH_CHECK_TIMEOUT_MS');

export interface ReadinessIndicator {
  readonly name: string;
  /** Resolves when the dependency is usable, rejects when it is not. */
  check(): Promise<void>;
}

export type IndicatorState = 'up' | 'down';

export interface ReadinessReport {
  status: 'ready' | 'not_ready';
  checks: Record<string, IndicatorState>;
}
