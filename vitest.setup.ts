// Runs before any module is imported. @nestjs/config validates inside forRoot(), which
// executes at import time, so these must be set here rather than in a beforeAll hook.
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgres://jas:jas@127.0.0.1:5437/jas_ad_studio_test';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6384';

// "No test calls a provider" is a convention; this makes it a fact. A live call from a
// test would spend real money and make the suite depend on the network.
const BLOCKED_HOSTS = ['api.openai.com', 'api.anthropic.com', 'generativelanguage.googleapis.com'];
const realFetch = globalThis.fetch;

globalThis.fetch = ((input: Parameters<typeof realFetch>[0], init?: Parameters<typeof realFetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

  if (BLOCKED_HOSTS.some((host) => url.includes(host))) {
    // Rejects rather than throws: callers await fetch, and a synchronous throw would
    // escape their try/catch and read as a different failure than it is.
    return Promise.reject(new Error(`Blocked a live provider call from a test: ${url}`));
  }

  return realFetch(input, init);
}) as typeof realFetch;
