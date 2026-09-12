import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const valid = {
  DATABASE_URL: 'postgres://jas:jas@127.0.0.1:5437/jas_ad_studio',
  REDIS_URL: 'redis://127.0.0.1:6384',
};

describe('validateEnv', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = validateEnv({ ...valid });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3040);
    expect(env.HEALTH_CHECK_TIMEOUT_MS).toBe(2000);
    expect(env.LOG_LEVEL).toBeUndefined();
    expect(env.OPENAI_API_KEY).toBeUndefined();
  });

  it('coerces numeric strings, as process.env only ever holds strings', () => {
    const env = validateEnv({ ...valid, PORT: '8080', HEALTH_CHECK_TIMEOUT_MS: '500' });

    expect(env.PORT).toBe(8080);
    expect(env.HEALTH_CHECK_TIMEOUT_MS).toBe(500);
  });

  it('refuses a missing DATABASE_URL and names the field', () => {
    expect(() => validateEnv({ REDIS_URL: valid.REDIS_URL })).toThrow(/DATABASE_URL/);
  });

  it('refuses a missing REDIS_URL and names the field', () => {
    expect(() => validateEnv({ DATABASE_URL: valid.DATABASE_URL })).toThrow(/REDIS_URL/);
  });

  it('refuses a DATABASE_URL that is not a postgres connection string', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: 'mysql://x/y' })).toThrow(
      /must be a postgres:\/\/ connection string/,
    );
  });

  it('refuses a REDIS_URL that is not a redis connection string', () => {
    expect(() => validateEnv({ ...valid, REDIS_URL: 'http://127.0.0.1:6384' })).toThrow(
      /must be a redis:\/\/ connection string/,
    );
  });

  it('refuses a PORT outside the valid range', () => {
    expect(() => validateEnv({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('refuses an unknown LOG_LEVEL', () => {
    expect(() => validateEnv({ ...valid, LOG_LEVEL: 'chatty' })).toThrow(/LOG_LEVEL/);
  });

  it('refuses an empty OPENAI_API_KEY rather than treating it as absent', () => {
    expect(() => validateEnv({ ...valid, OPENAI_API_KEY: '' })).toThrow(/OPENAI_API_KEY/);
  });

  it('reports every problem at once, not just the first', () => {
    const error = (): unknown => validateEnv({ DATABASE_URL: 'nope', REDIS_URL: 'nope' });

    expect(error).toThrow(/DATABASE_URL/);
    expect(error).toThrow(/REDIS_URL/);
  });
});

describe('google sign-in and storage config', () => {
  it('parses OWNER_EMAILS into a lowercased, trimmed list', () => {
    const env = validateEnv({ ...valid, OWNER_EMAILS: 'A@b.com, c@d.com ' });
    expect(env.OWNER_EMAILS).toEqual(['a@b.com', 'c@d.com']);
  });

  it('defaults OWNER_EMAILS to empty rather than inventing an owner', () => {
    expect(validateEnv({ ...valid }).OWNER_EMAILS).toEqual([]);
  });

  it('refuses a GOOGLE_REDIRECT_URI that is not an absolute URL', () => {
    expect(() => validateEnv({ ...valid, GOOGLE_REDIRECT_URI: 'not-a-url' })).toThrow(
      /GOOGLE_REDIRECT_URI/,
    );
  });

  it('refuses an empty GOOGLE_CLIENT_SECRET rather than treating it as absent', () => {
    expect(() => validateEnv({ ...valid, GOOGLE_CLIENT_SECRET: '' })).toThrow(
      /GOOGLE_CLIENT_SECRET/,
    );
  });

  it('defaults STORAGE_ROOT under the app directory', () => {
    expect(validateEnv({ ...valid }).STORAGE_ROOT).toBe('./storage/photos');
  });

  it('defaults WEB_ORIGIN to the dev api origin', () => {
    expect(validateEnv({ ...valid }).WEB_ORIGIN).toBe('http://localhost:3040');
  });
});
