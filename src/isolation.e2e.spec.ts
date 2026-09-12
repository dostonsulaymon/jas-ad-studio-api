import { mkdtempSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { FileStorage } from './assets/storage';
import { SESSION_COOKIE } from './auth/public/auth.port';
import { SessionService } from './auth/session.service';
import { applyGlobalSetup } from './bootstrap';
import { PG_POOL } from './common/db/tokens';
import { createTestDatabase, type TestDatabase } from './common/testing/database';

/**
 * PLAN.md's P2 exit check: user A cannot read, overwrite, generate from, or delete user
 * B's data. The service tests prove it piecewise; this proves it once through real HTTP,
 * because that is where an attacker actually stands.
 *
 * Every refusal must be 404, never 403. A 403 confirms the id exists, which is itself a
 * leak of Bob's data.
 */

let db: TestDatabase;
let app: INestApplication;
let origin: string;

let aliceCookie: string;
let bobCookie: string;
let bobProjectId: string;
let bobAssetId: string;

const WEB_ORIGIN = 'http://localhost:3040';

const brief = {
  productName: 'Krossovka',
  description: 'Bej rangli trikotaj krossovka',
  goal: 'sales',
  formatId: 'product-film',
  platform: 'instagram',
  aspectRatio: '9:16',
  durationSeconds: 10,
  audience: null,
  offer: null,
  confirmedClaims: [],
  galleryInspirationId: null,
};

function jpeg(): Promise<Buffer> {
  return sharp({ create: { width: 600, height: 400, channels: 3, background: '#c0ffee' } })
    .jpeg()
    .toBuffer();
}

/** Every mutating request carries what the CSRF guard demands, so 403s mean something else. */
function send(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown; omitCsrf?: boolean } = {},
): Promise<Response> {
  const headers: Record<string, string> = { Origin: WEB_ORIGIN };
  if (!options.omitCsrf) headers['X-Requested-With'] = 'XMLHttpRequest';
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  return fetch(`${origin}${path}`, {
    method: options.method ?? 'GET',
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

async function sendPhoto(path: string, cookie: string): Promise<Response> {
  const form = new FormData();
  form.append('photo', new Blob([await jpeg()], { type: 'image/jpeg' }), 'photo.jpg');

  return fetch(`${origin}${path}`, {
    method: 'POST',
    headers: { Origin: WEB_ORIGIN, 'X-Requested-With': 'XMLHttpRequest', Cookie: cookie },
    body: form,
  });
}

beforeAll(async () => {
  db = await createTestDatabase();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue(db.pool)
    .overrideProvider(FileStorage)
    .useValue(new FileStorage(mkdtempSync(join(tmpdir(), 'jas-e2e-'))))
    .compile();

  app = moduleRef.createNestApplication();
  applyGlobalSetup(app);
  await app.listen(0);

  const address = (app.getHttpServer() as Server).address() as AddressInfo;
  origin = `http://127.0.0.1:${String(address.port)}`;

  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('alice','alice@x.uz'),('bob','bob@x.uz')
     RETURNING id`,
  );

  // Sessions are issued directly: this suite is about ownership, not about Google.
  const sessions = moduleRef.get(SessionService);
  const alice = await sessions.issue(made.rows[0]?.id ?? '');
  const bob = await sessions.issue(made.rows[1]?.id ?? '');
  aliceCookie = `${SESSION_COOKIE}=${alice.token}`;
  bobCookie = `${SESSION_COOKIE}=${bob.token}`;

  const created = await send('/api/projects', { cookie: bobCookie, method: 'POST', body: brief });
  bobProjectId = ((await created.json()) as { id: string }).id;

  const uploaded = await sendPhoto(`/api/projects/${bobProjectId}/assets`, bobCookie);
  bobAssetId = ((await uploaded.json()) as { id: string }).id;
}, 60_000);

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe("Alice against Bob's data", () => {
  it("cannot read Bob's project", async () => {
    const response = await send(`/api/projects/${bobProjectId}`, { cookie: aliceCookie });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: 'PROJECT_NOT_FOUND' });
  });

  it("cannot overwrite Bob's project", async () => {
    const response = await send(`/api/projects/${bobProjectId}`, {
      cookie: aliceCookie,
      method: 'PATCH',
      body: { ...brief, productName: 'Hijacked' },
    });

    expect(response.status).toBe(404);

    const stillBobs = await send(`/api/projects/${bobProjectId}`, { cookie: bobCookie });
    await expect(stillBobs.json()).resolves.toMatchObject({ name: 'Krossovka' });
  });

  it("cannot delete Bob's project", async () => {
    const response = await send(`/api/projects/${bobProjectId}`, {
      cookie: aliceCookie,
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect((await send(`/api/projects/${bobProjectId}`, { cookie: bobCookie })).status).toBe(200);
  });

  it("cannot upload into Bob's project", async () => {
    const response = await sendPhoto(`/api/projects/${bobProjectId}/assets`, aliceCookie);

    expect(response.status).toBe(404);

    const bobsAssets = await send(`/api/projects/${bobProjectId}/assets`, { cookie: bobCookie });
    await expect(bobsAssets.json()).resolves.toHaveLength(1);
  });

  it("cannot list Bob's project assets", async () => {
    const response = await send(`/api/projects/${bobProjectId}/assets`, { cookie: aliceCookie });

    expect(response.status).toBe(404);
  });

  it("cannot download Bob's photo", async () => {
    const response = await send(`/api/assets/${bobAssetId}/reference`, { cookie: aliceCookie });

    expect(response.status).toBe(404);
  });

  it("cannot delete Bob's photo", async () => {
    const response = await send(`/api/assets/${bobAssetId}`, {
      cookie: aliceCookie,
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect((await send(`/api/assets/${bobAssetId}/reference`, { cookie: bobCookie })).status).toBe(
      200,
    );
  });

  it("never sees Bob's project in her own listing", async () => {
    const response = await send('/api/projects', { cookie: aliceCookie });

    await expect(response.json()).resolves.toEqual([]);
  });
});

describe('Bob against his own data', () => {
  it('can read his project and download his photo', async () => {
    expect((await send(`/api/projects/${bobProjectId}`, { cookie: bobCookie })).status).toBe(200);

    const photo = await send(`/api/assets/${bobAssetId}/reference`, { cookie: bobCookie });
    expect(photo.status).toBe(200);
    expect(photo.headers.get('content-type')).toContain('image/jpeg');
    // A product photo must never sit in a shared cache, where ownership no longer applies.
    expect(photo.headers.get('cache-control')).toBe('private, no-store');
  });
});

describe('an unauthenticated caller', () => {
  it('is refused on every project and asset route', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/projects'],
      ['GET', `/api/projects/${bobProjectId}`],
      ['PATCH', `/api/projects/${bobProjectId}`],
      ['DELETE', `/api/projects/${bobProjectId}`],
      ['GET', `/api/projects/${bobProjectId}/assets`],
      ['GET', `/api/assets/${bobAssetId}/reference`],
      ['DELETE', `/api/assets/${bobAssetId}`],
      ['GET', '/api/me'],
    ];

    for (const [method, path] of routes) {
      const response = await send(path, { method, ...(method === 'PATCH' ? { body: brief } : {}) });

      expect(response.status, `${method} ${path}`).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ code: 'SESSION_EXPIRED' });
    }
  });
});

// A stale or forged callback is the caller's problem. It must not read as a Google
// outage, or the 5xx that means a real outage stops meaning anything.
describe('the OAuth callback', () => {
  const cases: [string, string, string | undefined][] = [
    ['no code and no state', '', undefined],
    ['a code but no state cookie', '?code=x&state=abc', undefined],
    ['a state that does not match the cookie', '?code=x&state=abc', 'different'],
    ['a matching state but no code', '?state=abc', 'abc'],
  ];

  for (const [name, query, cookie] of cases) {
    it(`refuses ${name} as a client error`, async () => {
      const response = await send(
        `/api/auth/google/callback${query}`,
        cookie === undefined ? {} : { cookie: `jas_oauth_state=${cookie}` },
      );

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ code: 'OAUTH_STATE_INVALID' });
    });
  }
});

describe('CSRF', () => {
  it('refuses a state-changing request with a valid session but no X-Requested-With', async () => {
    const response = await send('/api/projects', {
      cookie: aliceCookie,
      method: 'POST',
      body: brief,
      omitCsrf: true,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: 'CROSS_ORIGIN_REFUSED' });
  });

  it('refuses a state-changing request from another origin', async () => {
    const response = await fetch(`${origin}/api/projects`, {
      method: 'POST',
      headers: {
        Origin: 'https://evil.example',
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/json',
        Cookie: aliceCookie,
      },
      body: JSON.stringify(brief),
    });

    expect(response.status).toBe(403);
  });
});
