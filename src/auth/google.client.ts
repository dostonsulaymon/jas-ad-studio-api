import { DomainError } from '../common/errors/app.error';

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** D-061: non-sensitive scopes only, so Google requires no verification review. */
const SCOPES = 'openid email profile';

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
}

export class GoogleAuthError extends DomainError {
  readonly code = 'AUTH_PROVIDER_FAILED';
  readonly status = 502;
}

export function buildAuthorizeUrl(config: GoogleConfig, state: string): string {
  const url = new URL(AUTHORIZE_ENDPOINT);

  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('state', state);
  // Lets a seller choose which Google account to use instead of being silently signed in
  // as whoever the browser saw last.
  url.searchParams.set('prompt', 'select_account');

  return url.href;
}

export async function exchangeCode(config: GoogleConfig, code: string): Promise<GoogleIdentity> {
  // POST body, never a query string: an authorization code in a URL ends up in proxy and
  // server logs.
  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    // Google's error body can echo client configuration back. It never reaches a caller.
    throw new GoogleAuthError(`Google token exchange failed with ${String(response.status)}`);
  }

  const payload = (await response.json()) as { id_token?: string };
  if (!payload.id_token) throw new GoogleAuthError('Google returned no id_token');

  const claims = decodeIdToken(payload.id_token);

  if (!claims.sub || !claims.email) {
    throw new GoogleAuthError('Google id_token is missing sub or email');
  }
  if (claims.email_verified !== true) {
    // An unverified address may belong to someone else entirely, and sign-in identity is
    // the one thing that has to be real.
    throw new GoogleAuthError('Google email is not verified');
  }

  return {
    sub: claims.sub,
    email: claims.email.toLowerCase(),
    name: claims.name ?? null,
    emailVerified: true,
  };
}

interface IdTokenClaims {
  sub?: string;
  email?: string;
  name?: string;
  email_verified?: boolean;
}

/**
 * No signature verification, on purpose. This token arrived on our own TLS connection to
 * Google's token endpoint, authenticated with our client secret — Google documents that
 * as sufficient, and the channel is the proof. A token reaching us any other way must
 * never be passed to this function.
 */
function decodeIdToken(token: string): IdTokenClaims {
  const body = token.split('.')[1];
  if (!body) throw new GoogleAuthError('Google id_token is malformed');

  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as IdTokenClaims;
  } catch (cause) {
    throw new GoogleAuthError('Google id_token payload is not JSON', { cause });
  }
}
