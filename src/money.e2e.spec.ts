import { readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from './app.module';
import { SESSION_COOKIE } from './auth/public/auth.port';
import { SessionService } from './auth/session.service';
import { applyGlobalSetup } from './bootstrap';
import { PG_POOL } from './common/db/tokens';
import { createTestDatabase, type TestDatabase } from './common/testing/database';
import {
  assertLedgerMatchesAccounts,
  assertNoNegativeBalances,
} from './common/testing/ledger';
import { AccountsService } from './credits/accounts.service';

/**
 * THE P3 EXIT GATE.
 *
 * docs/PLAN.md's P3 exit check is "double confirm credits once; a user can't confirm their
 * own order; balance always matches the ledger", and Addendum A §A8 adds the rest. The
 * service suites prove each piece against a real Postgres; this proves it once through
 * real HTTP, because that is where a seller and an attacker both actually stand — and
 * because P2's four defects were all invisible to 370 unit tests.
 *
 * Every refusal to a seller is a 404, never a 403: a 403 confirms the route or the id
 * exists, which is itself the leak.
 */

let db: TestDatabase;
let app: INestApplication;
let origin: string;

let aliceCookie: string;
let bobCookie: string;
let ownerCookie: string;
let aliceId: string;
let accounts: AccountsService;

/**
 * The origin the CSRF guard accepts, read from the same env the app reads.
 *
 * This was hard-coded to localhost:3040 and broke all three e2e suites the moment
 * WEB_ORIGIN was legitimately pointed at the web dev server on 3042. A test that asserts
 * a guard's behaviour must take the guard's own configuration from the same place the
 * guard does, or it is testing the developer's .env.
 */
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3040';

/**
 * Every route this suite actually exercised SUCCESSFULLY, as `METHOD /templated/path`.
 *
 * Only 2xx responses count. A 404 probe proves a door is shut, not that the room behind
 * it works, so the refusal loops below must not be able to pass for coverage.
 */
const exercised = new Set<string>();

const UUID_SEGMENT = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Collapses a real URL back to its contract template: ids out, query string out. */
function templatePath(path: string): string {
  const [withoutQuery = ''] = path.split('?');
  return withoutQuery.replace(UUID_SEGMENT, '/{id}').replace(/\/packs\/[^/]+/, '/packs/{id}');
}

async function send(
  path: string,
  options: { cookie?: string; method?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    Origin: WEB_ORIGIN,
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';

  const method = options.method ?? 'GET';
  const response = await fetch(`${origin}${path}`, {
    method,
    headers,
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.ok) exercised.add(`${method} ${templatePath(path)}`);
  return response;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** A live pack and somewhere to pay: the state a seller needs before ordering. */
async function openForBusiness(): Promise<void> {
  await send('/api/owner/packs/pack_5', {
    cookie: ownerCookie,
    method: 'PATCH',
    body: { priceUzs: 40000, isActive: true },
  });
  await send('/api/owner/settings/payment-instructions', {
    cookie: ownerCookie,
    method: 'PATCH',
    body: { cardNumber: '8600123412341234', cardHolder: 'JAS STUDIO' },
  });
}

async function placeOrder(cookie: string): Promise<string> {
  const response = await send('/api/orders', {
    cookie,
    method: 'POST',
    body: { packId: 'pack_5', paymentMethod: 'card_transfer' },
  });
  expect(response.status).toBe(201);
  return (await json<{ id: string }>(response)).id;
}

async function balanceOf(cookie: string): Promise<{ available: number; reserved: number }> {
  return json(await send('/api/credits/balance', { cookie }));
}

beforeAll(async () => {
  db = await createTestDatabase();

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PG_POOL)
    .useValue(db.pool)
    .compile();

  app = moduleRef.createNestApplication();
  applyGlobalSetup(app);
  await app.listen(0);

  const address = (app.getHttpServer() as Server).address() as AddressInfo;
  origin = `http://127.0.0.1:${String(address.port)}`;

  accounts = moduleRef.get(AccountsService);

  const made = await db.pool.query<{ id: string; email: string }>(
    `INSERT INTO users (google_sub, email, role) VALUES
       ('alice','alice@x.uz','seller'),
       ('bob','bob@x.uz','seller'),
       ('owner','owner@x.uz','owner')
     RETURNING id, email`,
  );
  const idOf = (email: string) => made.rows.find((row) => row.email === email)?.id ?? '';
  aliceId = idOf('alice@x.uz');

  // Sessions are issued directly: this suite is about money, not about Google.
  const sessions = moduleRef.get(SessionService);
  aliceCookie = `${SESSION_COOKIE}=${(await sessions.issue(aliceId)).token}`;
  bobCookie = `${SESSION_COOKIE}=${(await sessions.issue(idOf('bob@x.uz'))).token}`;
  ownerCookie = `${SESSION_COOKIE}=${(await sessions.issue(idOf('owner@x.uz'))).token}`;
}, 60_000);

afterAll(async () => {
  // The books must balance at the very end, after everything every test did.
  await assertLedgerMatchesAccounts(db.pool);
  await assertNoNegativeBalances(db.pool);
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query(`DELETE FROM owner_audit_log`);
  await db.pool.query(`DELETE FROM credit_ledger`);
  await db.pool.query(`DELETE FROM credit_orders`);
  await db.pool.query(`DELETE FROM credit_accounts`);
  await db.pool.query(`DELETE FROM site_settings`);
  await db.pool.query(`UPDATE credit_packs SET is_active = false`);
});

describe("PLAN.md's P3 exit check", () => {
  it('credits a confirmed order exactly once, however many times it is confirmed', async () => {
    await openForBusiness();
    const orderId = await placeOrder(aliceCookie);

    const first = await send(`/api/owner/orders/${orderId}/confirm`, {
      cookie: ownerCookie,
      method: 'POST',
    });
    const second = await send(`/api/owner/orders/${orderId}/confirm`, {
      cookie: ownerCookie,
      method: 'POST',
    });

    // 200, not 201: a confirm creates nothing, and a second one does nothing at all
    // (D-076 — the hand-walk found this reporting 201).
    expect(first.status).toBe(200);
    // A second confirm is a no-op, not an error the owner has to interpret.
    expect(second.status).toBe(200);
    expect(await json<{ credited: number }>(second)).toMatchObject({
      credited: 0,
      alreadyPaid: true,
    });

    expect(await balanceOf(aliceCookie)).toEqual({ available: 5, reserved: 0 });
    await assertLedgerMatchesAccounts(db.pool);
  });

  it('does not let a seller confirm their own order', async () => {
    await openForBusiness();
    const orderId = await placeOrder(aliceCookie);

    const response = await send(`/api/owner/orders/${orderId}/confirm`, {
      cookie: aliceCookie,
      method: 'POST',
    });

    expect(response.status).toBe(404);
    expect(await balanceOf(aliceCookie)).toEqual({ available: 0, reserved: 0 });
  });

  it('keeps the balance and the ledger in step through a full purchase lifecycle', async () => {
    await openForBusiness();
    const paid = await placeOrder(aliceCookie);
    const rejected = await placeOrder(aliceCookie);
    const cancelled = await placeOrder(aliceCookie);

    await send(`/api/owner/orders/${paid}/confirm`, { cookie: ownerCookie, method: 'POST' });
    await send(`/api/owner/orders/${rejected}/reject`, {
      cookie: ownerCookie,
      method: 'POST',
      body: { reason: 'no transfer found' },
    });
    await send(`/api/orders/${cancelled}/cancel`, { cookie: aliceCookie, method: 'POST' });
    await send('/api/owner/grants', {
      cookie: ownerCookie,
      method: 'POST',
      body: { userId: aliceId, credits: 2, note: 'goodwill, D-020' },
    });

    expect(await balanceOf(aliceCookie)).toEqual({ available: 7, reserved: 0 });
    await assertLedgerMatchesAccounts(db.pool);
  });
});

describe('Addendum A §A8', () => {
  it('starts a new account at zero, with no ledger row anywhere', async () => {
    expect(await balanceOf(bobCookie)).toEqual({ available: 0, reserved: 0 });

    // The strongest form of "no starter grant exists anywhere in code, migrations or copy".
    const { rows } = await db.pool.query(`SELECT id FROM credit_ledger`);
    expect(rows).toEqual([]);
  });

  it('shows no price until the owner has configured a pack', async () => {
    const response = await send('/api/packs');

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual([]);
  });

  it('shows a pack only once the owner prices AND activates it', async () => {
    await openForBusiness();

    expect(await json(await send('/api/packs'))).toEqual([
      { id: 'pack_5', credits: 5, priceUzs: 40000, sortOrder: 2 },
    ]);
  });

  it('refuses to activate a pack without re-stating the price (D-072)', async () => {
    const response = await send('/api/owner/packs/pack_1', {
      cookie: ownerCookie,
      method: 'PATCH',
      body: { isActive: true },
    });

    expect(response.status).toBe(400);
    expect(await json(await send('/api/packs'))).toEqual([]);
  });

  it('gives a seller no route to write a ledger row or set an order status', async () => {
    await openForBusiness();
    const orderId = await placeOrder(aliceCookie);

    // A test that the door is missing, not merely locked.
    const attempts = await Promise.all([
      send('/api/credits/balance', { cookie: aliceCookie, method: 'POST', body: { available: 99 } }),
      send('/api/ledger', { cookie: aliceCookie, method: 'POST', body: { type: 'purchase' } }),
      send(`/api/orders/${orderId}`, {
        cookie: aliceCookie,
        method: 'PATCH',
        body: { status: 'paid' },
      }),
      send('/api/packs/pack_5', {
        cookie: aliceCookie,
        method: 'PATCH',
        body: { priceUzs: 1 },
      }),
    ]);

    for (const attempt of attempts) {
      expect([404, 405]).toContain(attempt.status);
    }
    expect(await balanceOf(aliceCookie)).toEqual({ available: 0, reserved: 0 });
  });

  it('makes no paid call possible on a zero balance (§A5, the gate P4 inherits)', async () => {
    // P3 owns the gate; P4 wires it to the AI call.
    await expect(accounts.reserveOne(aliceId, null)).rejects.toMatchObject({
      code: 'NO_CREDITS',
      status: 402,
    });

    const { rows } = await db.pool.query(`SELECT id FROM credit_ledger`);
    expect(rows).toEqual([]);
  });
});

describe("Alice against Bob's money", () => {
  it("cannot see Bob's orders in her own list", async () => {
    await openForBusiness();
    await placeOrder(bobCookie);

    expect(await json(await send('/api/orders', { cookie: aliceCookie }))).toEqual([]);
  });

  it("cannot cancel Bob's order", async () => {
    await openForBusiness();
    const bobs = await placeOrder(bobCookie);

    const response = await send(`/api/orders/${bobs}/cancel`, {
      cookie: aliceCookie,
      method: 'POST',
    });

    expect(response.status).toBe(404);
    await expect(json(response)).resolves.toMatchObject({ code: 'ORDER_NOT_FOUND' });

    const [stillPending] = await json<{ status: string }[]>(
      await send('/api/orders', { cookie: bobCookie }),
    );
    expect(stillPending?.status).toBe('pending');
  });

  it('has no route that takes a user id, so there is no balance to read but her own', async () => {
    const response = await send(`/api/credits/balance/${aliceId}`, { cookie: bobCookie });
    expect(response.status).toBe(404);
  });
});

describe('the owner reports', () => {
  it('lists generations and daily spend, and never calls cost a credit', async () => {
    const generations = await send('/api/owner/generations', { cookie: ownerCookie });
    expect(generations.status).toBe(200);
    expect(Array.isArray(await json(generations))).toBe(true);

    const spend = await send('/api/owner/spend', { cookie: ownerCookie });
    expect(spend.status).toBe(200);
    const days = await json<Record<string, unknown>[]>(spend);
    expect(Array.isArray(days)).toBe(true);
    // Spend is USD cost, not credits. A row that conflated them would be a lie the
    // owner would act on.
    for (const day of days) {
      expect(day).not.toHaveProperty('credits');
      expect(typeof day.estCostUsd).toBe('number');
    }
  });
});

describe('the owner route tree', () => {
  const ownerRoutes: [string, string][] = [
    ['GET', '/api/owner/orders'],
    ['GET', '/api/owner/users'],
    ['GET', '/api/owner/generations'],
    ['GET', '/api/owner/spend'],
    ['POST', '/api/owner/grants'],
    ['PATCH', '/api/owner/packs/pack_1'],
    ['PATCH', '/api/owner/settings/payment-instructions'],
  ];

  it('answers 404 to a seller on every route, never 403', async () => {
    for (const [method, path] of ownerRoutes) {
      const response = await send(path, {
        cookie: aliceCookie,
        method,
        ...(method === 'GET' ? {} : { body: {} }),
      });

      // 403 would confirm the route exists and that someone can use it.
      expect(response.status, `${method} ${path}`).toBe(404);
      const body = await json<{ code: string }>(response);
      expect(body.code, `${method} ${path}`).not.toBe('FORBIDDEN');
    }
  });

  it('answers 401 to an anonymous caller, because the session guard fires first', async () => {
    for (const [method, path] of ownerRoutes) {
      const response = await send(path, {
        method,
        ...(method === 'GET' ? {} : { body: {} }),
      });

      expect(response.status, `${method} ${path}`).toBe(401);
      await expect(json(response)).resolves.toMatchObject({ code: 'SESSION_EXPIRED' });
    }
  });

  it('writes an audit row for every owner action, in the action\'s own transaction', async () => {
    await openForBusiness();
    const orderId = await placeOrder(aliceCookie);
    await send(`/api/owner/orders/${orderId}/confirm`, { cookie: ownerCookie, method: 'POST' });
    await send('/api/owner/grants', {
      cookie: ownerCookie,
      method: 'POST',
      body: { userId: aliceId, credits: 1, note: 'pilot' },
    });

    const { rows } = await db.pool.query<{ action: string; target_type: string }>(
      `SELECT action, target_type FROM owner_audit_log ORDER BY created_at`,
    );

    expect(rows.map((row) => row.action)).toEqual([
      'pack.update',
      'setting.update',
      'order.confirm',
      'credits.grant',
    ]);
    expect(rows.map((row) => row.target_type)).toEqual([
      'credit_pack',
      'site_setting',
      'credit_order',
      'user',
    ]);
  });

  it('leaves no audit row when the action it describes fails', async () => {
    // The audit write shares the action's transaction, so a rolled-back confirm must not
    // leave a record claiming it happened.
    const response = await send('/api/owner/orders/00000000-0000-0000-0000-000000000000/confirm', {
      cookie: ownerCookie,
      method: 'POST',
    });

    expect(response.status).toBe(404);
    const { rows } = await db.pool.query(`SELECT id FROM owner_audit_log`);
    expect(rows).toEqual([]);
  });
});

describe('the seller-facing payment surface', () => {
  it('publishes payment instructions without a session (§A4 step 2)', async () => {
    await openForBusiness();

    const response = await send('/api/settings/public');

    expect(response.status).toBe(200);
    // A card number a seller is meant to pay into is published by definition.
    expect(await json(response)).toMatchObject({
      paymentInstructions: { cardNumber: '8600123412341234', cardHolder: 'JAS STUDIO' },
    });
  });

  it('refuses an order while there is nowhere to send the money', async () => {
    await send('/api/owner/packs/pack_5', {
      cookie: ownerCookie,
      method: 'PATCH',
      body: { priceUzs: 40000, isActive: true },
    });

    const response = await send('/api/orders', {
      cookie: aliceCookie,
      method: 'POST',
      body: { packId: 'pack_5', paymentMethod: 'card_transfer' },
    });

    expect(response.status).toBe(409);
    await expect(json(response)).resolves.toMatchObject({ code: 'PAYMENT_NOT_CONFIGURED' });
  });

  it('never reports a payment as successful before the owner confirms it', async () => {
    await openForBusiness();
    await placeOrder(aliceCookie);

    const [order] = await json<{ status: string; confirmedAt: string | null }[]>(
      await send('/api/orders', { cookie: aliceCookie }),
    );

    expect(order?.status).toBe('pending');
    expect(order?.confirmedAt).toBeNull();
    expect(await balanceOf(aliceCookie)).toEqual({ available: 0, reserved: 0 });
  });
});

describe('the owner reads', () => {
  it('lists the order queue with the seller behind each row', async () => {
    await openForBusiness();
    const orderId = await placeOrder(aliceCookie);

    const response = await send('/api/owner/orders?status=pending', { cookie: ownerCookie });

    expect(response.status).toBe(200);
    const queue = await json<{ id: string; userEmail: string; status: string }[]>(response);
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      id: orderId,
      userEmail: 'alice@x.uz',
      status: 'pending',
    });
  });

  it('lists users with their balances, and nothing a support view should not hold', async () => {
    await openForBusiness();
    const orderId = await placeOrder(aliceCookie);
    await send(`/api/owner/orders/${orderId}/confirm`, { cookie: ownerCookie, method: 'POST' });

    const response = await send('/api/owner/users', { cookie: ownerCookie });

    expect(response.status).toBe(200);
    const users = await json<Record<string, unknown>[]>(response);
    const alice = users.find((user) => user.email === 'alice@x.uz');

    expect(alice).toMatchObject({ role: 'seller', available: 5, reserved: 0 });
    // A support view, not an export: no session token, no photo, no project.
    for (const user of users) {
      expect(Object.keys(user).sort()).toEqual([
        'available',
        'createdAt',
        'email',
        'id',
        'reserved',
        'role',
      ]);
    }
  });
});

describe('the support contacts (D-023)', () => {
  it('lets the owner edit them, and shows them to an anonymous visitor', async () => {
    const response = await send('/api/owner/settings/support-contacts', {
      cookie: ownerCookie,
      method: 'PATCH',
      body: {
        telegramUser: '@jas_support',
        telegramBot: '@jas_bot',
        email: 'support@jas.uz',
      },
    });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      telegramUser: '@jas_support',
      telegramBot: '@jas_bot',
      email: 'support@jas.uz',
    });

    const published = await json<{ supportContacts: { telegramUser: string } }>(
      await send('/api/settings/public'),
    );
    expect(published.supportContacts.telegramUser).toBe('@jas_support');
  });

  it('refuses a malformed support email, and stores nothing', async () => {
    const response = await send('/api/owner/settings/support-contacts', {
      cookie: ownerCookie,
      method: 'PATCH',
      body: { email: 'not-an-email' },
    });

    expect(response.status).toBe(400);
    const { rows } = await db.pool.query(
      `SELECT key FROM site_settings WHERE key = 'support_contacts'`,
    );
    expect(rows).toEqual([]);
  });

  it('refuses a setting key that is not on the whitelist', async () => {
    // There is no route for one, which is the strongest form of the rule.
    const response = await send('/api/owner/settings/admin-password', {
      cookie: ownerCookie,
      method: 'PATCH',
      body: { value: 'x' },
    });

    expect(response.status).toBe(404);
  });
});

/**
 * The owner's gallery, editable without a deploy (D-090).
 *
 * Here rather than in `gallery.e2e.spec.ts` because these are `/api/owner/*` routes and
 * this is the suite that owns that prefix's coverage — splitting them would leave each
 * file's guard blind to half the surface.
 */
describe('the owner edits the gallery', () => {
  const example = (patch: Record<string, unknown> = {}) => ({
    slug: 'owner-made',
    titleUz: 'Egasi qoʻshgan namuna',
    category: 'kiyim',
    style: 'product-film',
    videoPath: 'aa11.mp4',
    posterPath: 'aa11.jpg',
    aspectRatio: '9:16',
    durationSeconds: 10,
    promptEn: 'A prompt.',
    conceptUz: 'Konsepsiya.',
    creativePreset: {
      environment: 'clean seamless backdrop',
      lighting: 'soft key',
      cameraLanguage: 'slow orbit',
      pacing: 'restrained',
      mood: 'composed',
    },
    sourceType: 'app-prompt',
    sourceNote: 'Namuna.',
    flowModel: 'Veo 3.1',
    flowMode: 'Frames to video',
    isPublished: false,
    sortOrder: 9,
    ...patch,
  });

  it('creates, edits, publishes and deletes an example', async () => {
    const created = await send('/api/owner/gallery', {
      cookie: ownerCookie,
      method: 'POST',
      body: example(),
    });
    expect(created.status).toBe(201);
    const { id } = await json<{ id: string; isPublished: boolean }>(created);

    // A new example is never live until somebody says so.
    const listed = await send('/api/owner/gallery', { cookie: ownerCookie });
    expect(listed.status).toBe(200);
    const all = await json<{ examples: { id: string; isPublished: boolean }[] }>(listed);
    expect(all.examples.find((e) => e.id === id)?.isPublished).toBe(false);

    // …and the public list does not show it meanwhile.
    const beforePublish = await fetch(`${origin}/api/gallery`);
    expect(
      (await json<{ examples: { slug: string }[] }>(beforePublish)).examples.some(
        (e) => e.slug === 'owner-made',
      ),
    ).toBe(false);

    const published = await send(`/api/owner/gallery/${id}`, {
      cookie: ownerCookie,
      method: 'PATCH',
      body: example({ isPublished: true, titleUz: 'Chiqarildi' }),
    });
    expect(published.status).toBe(200);

    const afterPublish = await fetch(`${origin}/api/gallery`);
    expect(
      (await json<{ examples: { slug: string }[] }>(afterPublish)).examples.some(
        (e) => e.slug === 'owner-made',
      ),
    ).toBe(true);

    const removed = await send(`/api/owner/gallery/${id}`, {
      cookie: ownerCookie,
      method: 'DELETE',
    });
    expect(removed.status).toBe(204);

    // Asserted here rather than in its own test: truncateAll runs between tests, so a
    // separate test would be reading an empty table and passing for the wrong reason.
    const { rows } = await db.pool.query<{ action: string }>(
      `SELECT action FROM owner_audit_log WHERE target_type = 'gallery_example'
        ORDER BY created_at`,
    );
    expect(rows.map((r) => r.action)).toEqual([
      'gallery.create',
      'gallery.update',
      'gallery.delete',
    ]);
  });

  it('stores an uploaded clip under a content hash, and refuses a fake one', async () => {
    // A minimal but real ISO base-media header: 'ftyp' at offset 4 is what the store checks.
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypisom', 'latin1'),
      Buffer.alloc(16),
    ]);

    const form = new FormData();
    form.append('file', new Blob([mp4], { type: 'video/mp4' }), 'clip.mp4');
    const uploaded = await fetch(`${origin}/api/owner/gallery/media`, {
      method: 'POST',
      headers: { Origin: WEB_ORIGIN, 'X-Requested-With': 'XMLHttpRequest', Cookie: ownerCookie },
      body: form,
    });
    expect(uploaded.status).toBe(201);
    exercised.add('POST /api/owner/gallery/media');

    const stored = await json<{ path: string; contentType: string }>(uploaded);
    expect(stored.contentType).toBe('video/mp4');
    expect(stored.path).toMatch(/^[0-9a-f]{16}\.mp4$/);

    // The type comes from the bytes, never the name: a script called .mp4 is refused.
    const liar = new FormData();
    liar.append('file', new Blob([Buffer.from('#!/bin/sh\nrm -rf /')]), 'clip.mp4');
    const refused = await fetch(`${origin}/api/owner/gallery/media`, {
      method: 'POST',
      headers: { Origin: WEB_ORIGIN, 'X-Requested-With': 'XMLHttpRequest', Cookie: ownerCookie },
      body: liar,
    });
    expect(refused.status).toBe(400);
    expect((await json<{ code: string }>(refused)).code).toBe('MEDIA_TYPE');
  });

  it('lets the owner set the hero photos the landing page shows', async () => {
    const saved = await send('/api/owner/settings/hero-photos', {
      cookie: ownerCookie,
      method: 'PATCH',
      body: { photos: [{ slot: 2, path: 'aa11.jpg', altUz: 'Mahsulot rasmi' }] },
    });
    expect(saved.status).toBe(200);

    const publicSettings = await fetch(`${origin}/api/settings/public`);
    const body = await json<{ heroPhotos: { photos: { slot: number; altUz: string }[] } }>(
      publicSettings,
    );
    // Keyed by slot (R-005): replacing the third plate says so, and leaves the rest alone.
    expect(body.heroPhotos.photos).toEqual([
      { slot: 2, path: 'aa11.jpg', altUz: 'Mahsulot rasmi' },
    ]);
  });

  it('refuses two overrides for the same plate', async () => {
    const refused = await send('/api/owner/settings/hero-photos', {
      cookie: ownerCookie,
      method: 'PATCH',
      body: {
        photos: [
          { slot: 1, path: 'a.jpg', altUz: 'A' },
          { slot: 1, path: 'b.jpg', altUz: 'B' },
        ],
      },
    });

    // Otherwise the later one silently wins and the owner stares at the photo they
    // thought they had just replaced.
    expect(refused.status).toBe(400);
  });
});

/**
 * The question this suite must be able to answer: was every P3 endpoint actually
 * exercised, or only most of them?
 *
 * The list comes from `openapi.json` rather than from a hand-kept array here, so adding a
 * route to the API without a test that drives it to a 2xx fails this test — and a route
 * proved only by a 404 does not count.
 */
describe('endpoint coverage', () => {
  it('drives every P3 route in the contract to a success at least once', () => {
    // Read rather than imported: openapi.json sits outside src/, where the boundary lint
    // allows no import, and a JSON import attribute would need a module setting changed
    // for the whole project to suit one test.
    const contract = JSON.parse(readFileSync('openapi.json', 'utf8')) as {
      paths: Record<string, Record<string, unknown>>;
    };

    const routes: string[] = [];
    for (const [path, methods] of Object.entries(contract.paths)) {
      if (!/^\/api\/(packs|orders|credits|settings|owner)/.test(path)) continue;
      for (const method of Object.keys(methods)) {
        routes.push(`${method.toUpperCase()} ${path}`);
      }
    }

    expect(routes.length).toBeGreaterThan(0);
    const untested = routes.filter((route) => !exercised.has(route));
    expect(untested, `never driven to a 2xx: ${untested.join(', ')}`).toEqual([]);
  });
});
