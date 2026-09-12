import { afterEach, expect, it, vi } from 'vitest';
import { buildAuthorizeUrl, exchangeCode, GoogleAuthError } from './google.client';

const config = { clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://x/cb' };

function idToken(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${body}.signature`;
}

function respondWith(payload: unknown, status = 200): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(payload), { status }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('asks only for openid email profile, and nothing sensitive', () => {
  const url = new URL(buildAuthorizeUrl(config, 'state-123'));

  expect(url.searchParams.get('scope')).toBe('openid email profile');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('state')).toBe('state-123');
  expect(url.searchParams.get('redirect_uri')).toBe('http://x/cb');
  expect(url.searchParams.get('client_id')).toBe('cid');
});

it('never puts the client secret in the authorize URL', () => {
  expect(buildAuthorizeUrl(config, 'state')).not.toContain('secret');
});

it('extracts the identity from the id_token and lowercases the email', async () => {
  respondWith({
    id_token: idToken({ sub: '123', email: 'A@B.com', name: 'Doston', email_verified: true }),
  });

  await expect(exchangeCode(config, 'the-code')).resolves.toEqual({
    sub: '123',
    email: 'a@b.com',
    name: 'Doston',
    emailVerified: true,
  });
});

it('treats a missing name as null rather than inventing one', async () => {
  respondWith({ id_token: idToken({ sub: '1', email: 'a@b.com', email_verified: true }) });

  await expect(exchangeCode(config, 'c')).resolves.toMatchObject({ name: null });
});

it('refuses an unverified email rather than trusting it', async () => {
  respondWith({ id_token: idToken({ sub: '1', email: 'a@b.com', email_verified: false }) });

  await expect(exchangeCode(config, 'c')).rejects.toBeInstanceOf(GoogleAuthError);
});

it('refuses an id_token with no sub', async () => {
  respondWith({ id_token: idToken({ email: 'a@b.com', email_verified: true }) });

  await expect(exchangeCode(config, 'c')).rejects.toBeInstanceOf(GoogleAuthError);
});

it('refuses a response carrying no id_token at all', async () => {
  respondWith({ access_token: 'ya29.something' });

  await expect(exchangeCode(config, 'c')).rejects.toBeInstanceOf(GoogleAuthError);
});

it("never leaks Google's error body to the caller", async () => {
  respondWith({ error: 'invalid_client', secret_hint: 'GOCSPX-leaked' }, 401);

  await expect(exchangeCode(config, 'c')).rejects.toThrow(/token exchange failed/i);

  respondWith({ error: 'invalid_client', secret_hint: 'GOCSPX-leaked' }, 401);
  await expect(exchangeCode(config, 'c')).rejects.not.toThrow(/GOCSPX/);
});

it('refuses a malformed id_token instead of crashing', async () => {
  respondWith({ id_token: 'not-a-jwt' });

  await expect(exchangeCode(config, 'c')).rejects.toBeInstanceOf(GoogleAuthError);
});

it('sends the code as form-encoded body, not as a query string', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(
        JSON.stringify({ id_token: idToken({ sub: '1', email: 'a@b.com', email_verified: true }) }),
        { status: 200 },
      ),
    );

  await exchangeCode(config, 'the-code');

  const call = fetchSpy.mock.calls[0];
  const target = call?.[0];
  const body = call?.[1]?.body;

  expect(typeof target).toBe('string');
  expect(target).toBe('https://oauth2.googleapis.com/token');
  // The code must not ride in the URL, or it lands in every proxy log on the way.
  expect(target).not.toContain('the-code');

  expect(body).toBeInstanceOf(URLSearchParams);
  expect((body as URLSearchParams).get('code')).toBe('the-code');
  expect((body as URLSearchParams).get('grant_type')).toBe('authorization_code');
});
