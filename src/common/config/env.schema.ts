import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'] as const;

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3040),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),

  /** Required: no default, so a missing database refuses the boot rather than hiding. */
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\/.+/, 'must be a postgres:// connection string'),

  /** Required: BullMQ has nowhere to put jobs without it (D-030). */
  REDIS_URL: z.string().regex(/^rediss?:\/\/.+/, 'must be a redis:// connection string'),

  /** How long a single readiness check may take before it counts as down. */
  HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),

  /**
   * D-029. Optional in P0 because nothing calls a model yet, and CI must boot without
   * a key (spec §11: no live AI calls in CI). P1 makes the provider module require it
   * at the point of use, so a missing key fails the generate command, not the boot.
   */
  OPENAI_API_KEY: z.string().min(1).optional(),

  /**
   * Source 01 §27 forbids hard-coding an unverified model name. Optional in P1 because
   * the CLI's --model overrides it; the provider refuses a model it has no pricing for
   * rather than reporting every generation as free.
   */
  OPENAI_MODEL: z.string().min(1).optional(),

  /**
   * D-061. Optional at boot on purpose: CI and a fresh checkout must start without them,
   * and the auth controller refuses at the point of use — so a missing key fails sign-in
   * rather than killing the whole process.
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z
    .url('GOOGLE_REDIRECT_URI must be an absolute URL')
    .default('http://localhost:3040/api/auth/google/callback'),

  /** Where a completed sign-in lands, and the only origin CSRF accepts (spec §10). */
  WEB_ORIGIN: z.url('WEB_ORIGIN must be an absolute URL').default('http://localhost:3040'),

  /**
   * D-037. Role `owner` comes only from here, never from a request. Empty means nobody is
   * an owner, which is the safe direction to fail in.
   */
  OWNER_EMAILS: z
    .string()
    .default('')
    .transform((raw) =>
      raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry.length > 0),
    ),

  /** R-6. Private photo volume root, mounted at /app/storage/photos in the container. */
  STORAGE_ROOT: z.string().min(1).default('./storage/photos'),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}
