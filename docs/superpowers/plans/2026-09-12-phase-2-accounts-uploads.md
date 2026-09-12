# Phase 2 — Accounts and Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller signs in with Google, creates a project with a brief, and uploads product photos that only they can ever read.

**Architecture:** Three new modules — `auth`, `projects`, `assets` — each owning its own tables and exposing one public port file (R-7, lint-enforced). Sessions are opaque 256-bit IDs stored hashed in Postgres behind an httpOnly cookie (D-036), not JWTs. Google sign-in is the server-side authorization-code flow written directly against Google's endpoints with no auth library. Uploads are decoded with sharp, reduced to exactly two stripped copies, and stored under random paths on a private volume that is never publicly addressable (R-6).

**Tech Stack:** NestJS 11, Drizzle + Postgres, zod 4, sharp 0.35, vitest 3. No new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` (§3 modules, §4 data model, §7 photo pipeline, §9 errors, §10 security, §11 testing)

## Global Constraints

- **R-7 module boundaries.** A module imports `common/`, its own files, its own `db/` schema, and any module's `public/` port. Nothing else. `pnpm lint` fails otherwise.
- **Ports are contracts.** `public/*` holds types and DI tokens only. No implementation, no database access.
- **Every table change is a committed SQL migration** via `pnpm db:generate`. Never hand-edit generated SQL.
- **Error shape is `{ code, messageKey, details?, requestId }`** (spec §9). Throw a `DomainError` subclass; never return a raw message. Codes come from spec §9's list.
- **Logs never contain** images, full prompts, full briefs, cookies, or keys. The redaction list is already in `src/common/logger/logger.module.ts` — extend it, never bypass it.
- **Private photos are never public URLs** (spec §7.4). Serving happens only through an ownership-checked endpoint.
- **Money is out of scope.** P2 writes no credit row and reads no balance. If a task seems to need one, stop and ask.
- **Node 24.** Run `nvm use` before any command in this plan.
- **Verification is by real output.** A task is done when its command is run and its output pasted, not when it looks right.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/common/testing/database.ts` | Throwaway Postgres per test run: create, migrate, truncate, drop (R-4) |
| `src/common/config/env.schema.ts` *(modify)* | Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OWNER_EMAILS`, `STORAGE_ROOT` |
| `src/auth/db/schema.ts` | `users`, `sessions` tables |
| `src/auth/public/auth.port.ts` | `CurrentUser`, `UserRole`, `CURRENT_USER` decorator token |
| `src/auth/google.client.ts` | Authorize URL, code→token exchange, ID-token claim extraction |
| `src/auth/session.service.ts` | Issue, validate, revoke sessions; hash at rest |
| `src/auth/user.service.ts` | Upsert by `google_sub`; assign role from `OWNER_EMAILS` |
| `src/auth/session.guard.ts` | Reads the cookie, loads the user, rejects with `SESSION_EXPIRED` |
| `src/auth/csrf.guard.ts` | Same-origin `Origin` + `X-Requested-With` on state-changing verbs (spec §10) |
| `src/auth/auth.controller.ts` | `/auth/google`, `/auth/google/callback`, `/auth/logout`, `/me` |
| `src/auth/auth.module.ts` | Wiring |
| `src/projects/db/schema.ts` | `projects` table, including `format_id` (D-062) |
| `src/projects/public/projects.port.ts` | `ProjectSummary`, `PROJECT_READER` token for `assets` to check ownership |
| `src/projects/projects.service.ts` | CRUD with an owner check on every read and write |
| `src/projects/projects.controller.ts` | `POST/GET/PATCH/DELETE /projects` |
| `src/projects/projects.module.ts` | Wiring |
| `src/assets/db/schema.ts` | `assets` table |
| `src/assets/public/assets.port.ts` | `AssetKind`, `StoredAsset` |
| `src/assets/image.pipeline.ts` | Decode, validate, produce the reference and model-input copies |
| `src/assets/storage.ts` | Random-path read/write under `STORAGE_ROOT` |
| `src/assets/assets.service.ts` | Upload orchestration, ownership checks, deletion |
| `src/assets/assets.controller.ts` | `POST /projects/:id/assets`, `GET /assets/:id/reference`, `DELETE /assets/:id` |
| `src/assets/assets.module.ts` | Wiring |
| `src/ai/public/brief.schema.ts` *(modify)* | `formatId` replaces `style` (D-065) |
| `src/ai/formats/formats.ts` *(modify)* | Drop `styles`, add seller-facing Uzbek label and description |

---

## Standing-gate approvals needed before starting

1. **One dev dependency: `@types/multer`.** Needed to type `Express.Multer.File` in Task 11. `multer@2.2.0` already ships inside `@nestjs/platform-express`, so no runtime dependency is added. **Ask Doston before installing.**
2. **D-065 changes the AI module's input contract** (`style` → `formatId`). Already recorded as a decision; Task 8 implements it. No further approval needed, but it is the one task that touches P1's tested core — do it test-first and run the full suite after.

---

### Task 1: Throwaway Postgres for integration tests

R-4/D-038 requires money and job logic tested against a real database. Nothing in the repo does this yet, and P3 and P4 are unverifiable without it. It comes first so every later task can use it.

**Files:**
- Create: `src/common/testing/database.ts`
- Create: `src/common/testing/database.spec.ts`

**Interfaces:**
- Consumes: `PG_POOL` token, `MIGRATIONS_FOLDER` layout from `src/common/db/migration.runner.ts`
- Produces:
  - `createTestDatabase(): Promise<TestDatabase>`
  - `interface TestDatabase { pool: Pool; url: string; truncateAll(): Promise<void>; drop(): Promise<void> }`

- [x] **Step 1: Write the failing test**

```ts
// src/common/testing/database.spec.ts
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './database';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 30_000);

afterAll(async () => {
  await db.drop();
});

it('gives each run its own database', async () => {
  const { rows } = await db.pool.query<{ current_database: string }>('SELECT current_database()');
  expect(rows[0]?.current_database).toMatch(/^jas_test_/);
});

it('truncateAll empties tables without dropping them', async () => {
  await db.pool.query('CREATE TABLE IF NOT EXISTS probe (id int)');
  await db.pool.query('INSERT INTO probe VALUES (1)');
  await db.truncateAll();
  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM probe');
  expect(rows[0]?.count).toBe('0');
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `nvm use && pnpm vitest run src/common/testing/database.spec.ts`
Expected: FAIL — `Cannot find module './database'`

- [x] **Step 3: Implement**

```ts
// src/common/testing/database.ts
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';

export interface TestDatabase {
  pool: Pool;
  url: string;
  truncateAll(): Promise<void>;
  drop(): Promise<void>;
}

const MIGRATIONS_FOLDER = join(process.cwd(), 'drizzle', 'migrations');

/**
 * A database per run, not per file: creating one costs ~200ms, and tests that share a
 * run share a schema but never rows, because each suite calls truncateAll().
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const base = process.env.DATABASE_URL;
  if (!base) throw new Error('DATABASE_URL must be set to create a test database');

  const name = `jas_test_${randomBytes(6).toString('hex')}`;
  const admin = new Pool({ connectionString: base });

  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }

  const url = new URL(base);
  url.pathname = `/${name}`;
  const pool = new Pool({ connectionString: url.href });

  if (existsSync(join(MIGRATIONS_FOLDER, 'meta', '_journal.json'))) {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  }

  return {
    pool,
    url: url.href,

    async truncateAll(): Promise<void> {
      const { rows } = await pool.query<{ tablename: string }>(
        `SELECT tablename FROM pg_tables
          WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
      );
      if (rows.length === 0) return;
      const list = rows.map((r) => `"${r.tablename}"`).join(', ');
      await pool.query(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    },

    async drop(): Promise<void> {
      await pool.end();
      const cleanup = new Pool({ connectionString: base });
      try {
        await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await cleanup.end();
      }
    },
  };
}
```

- [x] **Step 4: Run and watch it pass**

Run: `pnpm infra:up && pnpm vitest run src/common/testing/database.spec.ts`
Expected: PASS, 2 tests. If it fails with `database "jas_ad_studio_test" does not exist`, create it once: `docker exec -i $(docker ps -qf name=jas-ad-studio-dev-postgres) psql -U jas -d jas_ad_studio -c 'CREATE DATABASE jas_ad_studio_test'`

- [x] **Step 5: Confirm the whole suite still passes**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: 255 tests, all green.

- [x] **Step 6: Commit**

```bash
git add src/common/testing/
git commit -m "test: throwaway Postgres per run, so money and job logic can be tested for real (R-4)"
```

---

### Task 2: Environment for sign-in and storage

**Files:**
- Modify: `src/common/config/env.schema.ts`
- Modify: `src/common/config/env.schema.spec.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces: `Env` gains `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `OWNER_EMAILS: string[]`, `STORAGE_ROOT: string`

- [x] **Step 1: Write the failing tests**

```ts
// append to src/common/config/env.schema.spec.ts
import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5437/db',
  REDIS_URL: 'redis://localhost:6384',
};

describe('google sign-in config', () => {
  it('parses OWNER_EMAILS into a lowercased list', () => {
    const env = validateEnv({ ...base, OWNER_EMAILS: 'A@b.com, c@d.com ' });
    expect(env.OWNER_EMAILS).toEqual(['a@b.com', 'c@d.com']);
  });

  it('defaults OWNER_EMAILS to empty rather than inventing an owner', () => {
    expect(validateEnv(base).OWNER_EMAILS).toEqual([]);
  });

  it('rejects a redirect URI that is not a URL', () => {
    expect(() => validateEnv({ ...base, GOOGLE_REDIRECT_URI: 'not-a-url' })).toThrow(
      /GOOGLE_REDIRECT_URI/,
    );
  });

  it('defaults STORAGE_ROOT under the app directory', () => {
    expect(validateEnv(base).STORAGE_ROOT).toBe('./storage/photos');
  });
});
```

- [x] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/common/config/env.schema.spec.ts`
Expected: FAIL — `OWNER_EMAILS` undefined.

- [x] **Step 3: Implement**

Add to the `envSchema` object in `src/common/config/env.schema.ts`:

```ts
  /**
   * D-061. Optional at boot: CI and a fresh checkout must start without them, and the
   * auth controller refuses at the point of use so a missing key fails sign-in rather
   * than the whole process.
   */
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_REDIRECT_URI: z
    .string()
    .url('GOOGLE_REDIRECT_URI must be an absolute URL')
    .default('http://localhost:3040/api/auth/google/callback'),

  /**
   * D-037. Role `owner` comes only from here, never from a request. Empty means nobody
   * is an owner, which is the safe failure.
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

  /** R-6. Private volume root. Mounted at /app/storage/photos in the container. */
  STORAGE_ROOT: z.string().min(1).default('./storage/photos'),
```

- [x] **Step 4: Run and watch it pass**

Run: `pnpm vitest run src/common/config/env.schema.spec.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/common/config/ .env.example
git commit -m "feat(config): Google sign-in, owner allowlist and storage root (D-061, D-037)"
```

---

### Task 3: users and sessions tables

**Files:**
- Create: `src/auth/db/schema.ts`
- Create: `drizzle/migrations/0000_*.sql` (generated)
- Create: `src/auth/db/schema.spec.ts`

**Interfaces:**
- Produces: `users`, `sessions` Drizzle tables; `type UserRow`, `type SessionRow`

- [x] **Step 1: Write the schema**

```ts
// src/auth/db/schema.ts
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Google's stable subject id. Email can change; this cannot. */
    googleSub: text('google_sub').notNull().unique(),
    email: text('email').notNull(),
    name: text('name'),
    locale: text('locale').notNull().default('uz-Latn'),
    /** D-037: only ever set from OWNER_EMAILS at sign-in, never from a request. */
    role: text('role', { enum: ['seller', 'owner'] })
      .notNull()
      .default('seller'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('users_email_idx').on(table.email)],
);

export const sessions = pgTable(
  'sessions',
  {
    /**
     * The SHA-256 of the cookie value, never the value itself. A database leak then
     * hands an attacker hashes, not usable sessions (D-036).
     */
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('sessions_user_idx').on(table.userId)],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
```

- [x] **Step 2: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file under `drizzle/migrations/` creating both tables, plus `meta/_journal.json`. Read the SQL before continuing — confirm `google_sub` is UNIQUE and the session FK is `ON DELETE CASCADE`.

- [x] **Step 3: Write the integration test**

```ts
// src/auth/db/schema.spec.ts
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../../common/testing/database';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); }, 30_000);
beforeEach(async () => { await db.truncateAll(); });
afterAll(async () => { await db.drop(); });

it('refuses two users with the same google_sub', async () => {
  await db.pool.query("INSERT INTO users (google_sub, email) VALUES ('sub-1', 'a@b.com')");
  await expect(
    db.pool.query("INSERT INTO users (google_sub, email) VALUES ('sub-1', 'c@d.com')"),
  ).rejects.toThrow(/duplicate key/);
});

it('deletes a user’s sessions with the user', async () => {
  const { rows } = await db.pool.query<{ id: string }>(
    "INSERT INTO users (google_sub, email) VALUES ('sub-2', 'a@b.com') RETURNING id",
  );
  const userId = rows[0]!.id;
  await db.pool.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('h', $1, now() + interval '1 day')",
    [userId],
  );
  await db.pool.query('DELETE FROM users WHERE id = $1', [userId]);
  const left = await db.pool.query('SELECT count(*) FROM sessions');
  expect(left.rows[0]).toMatchObject({ count: '0' });
});

it('defaults a new user to seller, never owner', async () => {
  const { rows } = await db.pool.query<{ role: string }>(
    "INSERT INTO users (google_sub, email) VALUES ('sub-3', 'a@b.com') RETURNING role",
  );
  expect(rows[0]?.role).toBe('seller');
});
```

- [x] **Step 4: Run and watch it pass**

Run: `pnpm vitest run src/auth/db/schema.spec.ts`
Expected: PASS, 3 tests.

- [x] **Step 5: Confirm the migration runner now takes the real branch**

Run: `pnpm build && pnpm dev` (then Ctrl-C)
Expected: the log line is `Migrations up to date`, **not** `No migrations to apply`. This is the branch P0 left dangling.

- [x] **Step 6: Commit**

```bash
git add src/auth/db/ drizzle/
git commit -m "feat(auth): users and sessions tables, with the first real migration"
```

---

### Task 4: Google authorization-code client

No auth library. Two HTTPS calls and one base64 decode. The ID token arrives directly from Google's token endpoint over TLS in a server-to-server call, so per Google's own documentation its signature does not need local verification — the channel is the proof.

**Files:**
- Create: `src/auth/google.client.ts`
- Create: `src/auth/google.client.spec.ts`

**Interfaces:**
- Produces:
  - `buildAuthorizeUrl(config: GoogleConfig, state: string): string`
  - `exchangeCode(config: GoogleConfig, code: string): Promise<GoogleIdentity>`
  - `interface GoogleConfig { clientId: string; clientSecret: string; redirectUri: string }`
  - `interface GoogleIdentity { sub: string; email: string; name: string | null; emailVerified: boolean }`
  - `class GoogleAuthError extends DomainError` with `code = 'AUTH_PROVIDER_FAILED'`, `status = 502`

- [x] **Step 1: Write the failing tests**

```ts
// src/auth/google.client.spec.ts
import { afterEach, expect, it, vi } from 'vitest';
import { buildAuthorizeUrl, exchangeCode, GoogleAuthError } from './google.client';

const config = { clientId: 'cid', clientSecret: 'secret', redirectUri: 'http://x/cb' };

function idToken(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `header.${body}.signature`;
}

afterEach(() => { vi.restoreAllMocks(); });

it('asks only for openid email profile, and nothing sensitive', () => {
  const url = new URL(buildAuthorizeUrl(config, 'state-123'));
  expect(url.searchParams.get('scope')).toBe('openid email profile');
  expect(url.searchParams.get('response_type')).toBe('code');
  expect(url.searchParams.get('state')).toBe('state-123');
  expect(url.searchParams.get('redirect_uri')).toBe('http://x/cb');
});

it('extracts the identity from the id_token', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({
        id_token: idToken({ sub: '123', email: 'A@B.com', name: 'Doston', email_verified: true }),
      }),
      { status: 200 },
    ),
  );

  const identity = await exchangeCode(config, 'the-code');
  expect(identity).toEqual({
    sub: '123',
    email: 'a@b.com',
    name: 'Doston',
    emailVerified: true,
  });
});

it('refuses an unverified email rather than trusting it', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(
      JSON.stringify({ id_token: idToken({ sub: '1', email: 'a@b.com', email_verified: false }) }),
      { status: 200 },
    ),
  );
  await expect(exchangeCode(config, 'c')).rejects.toBeInstanceOf(GoogleAuthError);
});

it('never leaks Google’s error body to the caller', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ error: 'invalid_client', secret_hint: 'GOCSPX-xyz' }), {
      status: 401,
    }),
  );
  await expect(exchangeCode(config, 'c')).rejects.toThrow(/token exchange failed/i);
  await expect(exchangeCode(config, 'c')).rejects.not.toThrow(/GOCSPX/);
});
```

- [x] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/auth/google.client.spec.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/auth/google.client.ts
import { DomainError } from '../common/errors/app.error';

const AUTHORIZE_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
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
  // Without this Google skips the consent screen on repeat sign-ins and returns no
  // refresh token. We never use one, but 'select_account' lets a seller switch accounts.
  url.searchParams.set('prompt', 'select_account');
  return url.href;
}

export async function exchangeCode(config: GoogleConfig, code: string): Promise<GoogleIdentity> {
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
    // The body can echo client configuration. It is logged upstream, never returned.
    throw new GoogleAuthError(`Google token exchange failed with ${String(response.status)}`);
  }

  const payload = (await response.json()) as { id_token?: string };
  if (!payload.id_token) throw new GoogleAuthError('Google returned no id_token');

  const claims = decodeIdToken(payload.id_token);

  if (!claims.sub || !claims.email) {
    throw new GoogleAuthError('Google id_token is missing sub or email');
  }
  if (claims.email_verified !== true) {
    // An unverified address could belong to someone else. Sign-in identity must be real.
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
 * No signature check on purpose. This token came back on our own TLS connection to
 * Google's token endpoint, authenticated with our client secret — Google documents that
 * as sufficient. A token arriving any other way must never reach here.
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
```

- [x] **Step 4: Run and watch it pass**

Run: `pnpm vitest run src/auth/google.client.spec.ts`
Expected: PASS, 4 tests.

- [x] **Step 5: Commit**

```bash
git add src/auth/google.client.ts src/auth/google.client.spec.ts
git commit -m "feat(auth): Google authorization-code client, no auth library (D-015)"
```

---

### Task 5: Sessions, hashed at rest

**Files:**
- Create: `src/auth/session.service.ts`
- Create: `src/auth/session.service.spec.ts`
- Create: `src/auth/public/auth.port.ts`

**Interfaces:**
- Produces:
  - `SessionService.issue(userId: string): Promise<{ token: string; expiresAt: Date }>`
  - `SessionService.resolve(token: string): Promise<CurrentUser | null>`
  - `SessionService.revoke(token: string): Promise<void>`
  - `interface CurrentUser { id: string; email: string; role: 'seller' | 'owner' }`
  - `const SESSION_COOKIE = 'jas_session'`, `const SESSION_TTL_DAYS = 30`

- [x] **Step 1: Write the port**

```ts
// src/auth/public/auth.port.ts
export type UserRole = 'seller' | 'owner';

export interface CurrentUser {
  id: string;
  email: string;
  role: UserRole;
}

/** D-036: opaque id in an httpOnly cookie. Never a JWT, so it can be revoked instantly. */
export const SESSION_COOKIE = 'jas_session';
export const SESSION_TTL_DAYS = 30;
```

- [x] **Step 2: Write the failing tests**

```ts
// src/auth/session.service.spec.ts
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { SessionService } from './session.service';

let db: TestDatabase;
let service: SessionService;
let userId: string;

beforeAll(async () => { db = await createTestDatabase(); }, 30_000);
afterAll(async () => { await db.drop(); });

beforeEach(async () => {
  await db.truncateAll();
  service = new SessionService(db.pool);
  const { rows } = await db.pool.query<{ id: string }>(
    "INSERT INTO users (google_sub, email) VALUES ('s', 'a@b.com') RETURNING id",
  );
  userId = rows[0]!.id;
});

it('never stores the raw token', async () => {
  const { token } = await service.issue(userId);
  const { rows } = await db.pool.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
  expect(rows[0]?.token_hash).not.toBe(token);
  expect(rows[0]?.token_hash).toHaveLength(64);
});

it('resolves a live session to its user', async () => {
  const { token } = await service.issue(userId);
  await expect(service.resolve(token)).resolves.toMatchObject({ id: userId, role: 'seller' });
});

it('resolves an unknown token to null rather than throwing', async () => {
  await expect(service.resolve('nonsense')).resolves.toBeNull();
});

it('refuses an expired session and deletes it', async () => {
  const { token } = await service.issue(userId);
  await db.pool.query("UPDATE sessions SET expires_at = now() - interval '1 second'");
  await expect(service.resolve(token)).resolves.toBeNull();
  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM sessions');
  expect(rows[0]?.count).toBe('0');
});

it('revoke makes the token stop working immediately', async () => {
  const { token } = await service.issue(userId);
  await service.revoke(token);
  await expect(service.resolve(token)).resolves.toBeNull();
});
```

- [x] **Step 3: Run and watch it fail**

Run: `pnpm vitest run src/auth/session.service.spec.ts`
Expected: FAIL — module not found.

- [x] **Step 4: Implement**

```ts
// src/auth/session.service.ts
import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import { SESSION_TTL_DAYS, type CurrentUser } from './public/auth.port';

@Injectable()
export class SessionService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async issue(userId: string): Promise<{ token: string; expiresAt: Date }> {
    // 256 bits. Guessing is not a threat model at this size.
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.pool.query(
      'INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)',
      [hash(token), userId, expiresAt],
    );

    return { token, expiresAt };
  }

  async resolve(token: string): Promise<CurrentUser | null> {
    const { rows } = await this.pool.query<{
      id: string;
      email: string;
      role: 'seller' | 'owner';
      expired: boolean;
    }>(
      `SELECT u.id, u.email, u.role, s.expires_at <= now() AS expired
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1`,
      [hash(token)],
    );

    const row = rows[0];
    if (!row) return null;

    if (row.expired) {
      // Clean up on read: there is no scheduled sweeper yet, and an expired row has no use.
      await this.revoke(token);
      return null;
    }

    return { id: row.id, email: row.email, role: row.role };
  }

  async revoke(token: string): Promise<void> {
    await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [hash(token)]);
  }
}

function hash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
```

- [x] **Step 5: Run and watch it pass**

Run: `pnpm vitest run src/auth/session.service.spec.ts`
Expected: PASS, 5 tests.

- [x] **Step 6: Commit**

```bash
git add src/auth/
git commit -m "feat(auth): sessions stored as hashes, revocable instantly (D-036)"
```

---

### Task 6: User upsert and the owner allowlist

**Files:**
- Create: `src/auth/user.service.ts`
- Create: `src/auth/user.service.spec.ts`

**Interfaces:**
- Produces: `UserService.upsertFromGoogle(identity: GoogleIdentity): Promise<CurrentUser>`

- [x] **Step 1: Write the failing tests**

```ts
// src/auth/user.service.spec.ts
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { UserService } from './user.service';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); }, 30_000);
afterAll(async () => { await db.drop(); });
beforeEach(async () => { await db.truncateAll(); });

const identity = { sub: 'g-1', email: 'seller@shop.uz', name: 'Seller', emailVerified: true };

it('creates a seller on first sign-in', async () => {
  const service = new UserService(db.pool, []);
  await expect(service.upsertFromGoogle(identity)).resolves.toMatchObject({ role: 'seller' });
});

it('gives the same user back on a second sign-in, not a duplicate', async () => {
  const service = new UserService(db.pool, []);
  const first = await service.upsertFromGoogle(identity);
  const second = await service.upsertFromGoogle(identity);
  expect(second.id).toBe(first.id);
  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM users');
  expect(rows[0]?.count).toBe('1');
});

it('promotes an allowlisted email to owner', async () => {
  const service = new UserService(db.pool, ['seller@shop.uz']);
  await expect(service.upsertFromGoogle(identity)).resolves.toMatchObject({ role: 'owner' });
});

it('demotes an owner whose email left the allowlist', async () => {
  await new UserService(db.pool, ['seller@shop.uz']).upsertFromGoogle(identity);
  const after = await new UserService(db.pool, []).upsertFromGoogle(identity);
  expect(after.role).toBe('seller');
});

it('follows the google_sub when the email changes, and does not create a second user', async () => {
  const service = new UserService(db.pool, []);
  const first = await service.upsertFromGoogle(identity);
  const renamed = await service.upsertFromGoogle({ ...identity, email: 'new@shop.uz' });
  expect(renamed.id).toBe(first.id);
  expect(renamed.email).toBe('new@shop.uz');
});
```

- [x] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/auth/user.service.spec.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/auth/user.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../common/db/tokens';
import { OWNER_EMAILS } from './auth.tokens';
import type { GoogleIdentity } from './google.client';
import type { CurrentUser, UserRole } from './public/auth.port';

@Injectable()
export class UserService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(OWNER_EMAILS) private readonly ownerEmails: string[],
  ) {}

  /**
   * Keyed on google_sub, not email: a seller can change their Google address and must
   * stay the same user, with the same projects.
   *
   * The role is recomputed on every sign-in so the allowlist is the single source of
   * truth (D-037) — removing an email from OWNER_EMAILS actually removes the power.
   */
  async upsertFromGoogle(identity: GoogleIdentity): Promise<CurrentUser> {
    const role: UserRole = this.ownerEmails.includes(identity.email) ? 'owner' : 'seller';

    const { rows } = await this.pool.query<{ id: string; email: string; role: UserRole }>(
      `INSERT INTO users (google_sub, email, name, role)
            VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_sub)
       DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, role = EXCLUDED.role
         RETURNING id, email, role`,
      [identity.sub, identity.email, identity.name, role],
    );

    return rows[0]!;
  }
}
```

```ts
// src/auth/auth.tokens.ts
export const OWNER_EMAILS = Symbol('OWNER_EMAILS');
export const GOOGLE_CONFIG = Symbol('GOOGLE_CONFIG');
```

- [x] **Step 4: Run and watch it pass**

Run: `pnpm vitest run src/auth/user.service.spec.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add src/auth/
git commit -m "feat(auth): user upsert keyed on google_sub, role from the allowlist (D-037)"
```

---

### Task 7: The sign-in endpoints, the guard, and CSRF

**Files:**
- Create: `src/auth/auth.controller.ts`, `src/auth/session.guard.ts`, `src/auth/csrf.guard.ts`, `src/auth/auth.module.ts`, `src/auth/current-user.decorator.ts`
- Create: `src/auth/auth.controller.spec.ts`, `src/auth/csrf.guard.spec.ts`
- Modify: `src/app.module.ts` (register `AuthModule`)

**Interfaces:**
- Consumes: `SessionService`, `UserService`, `buildAuthorizeUrl`, `exchangeCode`
- Produces: `SessionGuard`, `CsrfGuard`, `@User()` param decorator returning `CurrentUser`
- Routes: `GET /api/auth/google`, `GET /api/auth/google/callback`, `POST /api/auth/logout`, `GET /api/me`

- [x] **Step 1: Write the failing CSRF test**

```ts
// src/auth/csrf.guard.spec.ts
import { ForbiddenException } from '@nestjs/common';
import { expect, it } from 'vitest';
import { CsrfGuard } from './csrf.guard';

function context(method: string, headers: Record<string, string>) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, headers }) }),
  } as never;
}

const guard = new CsrfGuard(['http://localhost:3040']);

it('lets a GET through without ceremony', () => {
  expect(guard.canActivate(context('GET', {}))).toBe(true);
});

it('requires X-Requested-With on a POST', () => {
  expect(() => guard.canActivate(context('POST', { origin: 'http://localhost:3040' }))).toThrow(
    ForbiddenException,
  );
});

it('rejects a POST from another origin even with the header', () => {
  expect(() =>
    guard.canActivate(
      context('POST', { origin: 'https://evil.example', 'x-requested-with': 'XMLHttpRequest' }),
    ),
  ).toThrow(ForbiddenException);
});

it('accepts a same-origin POST carrying both', () => {
  expect(
    guard.canActivate(
      context('POST', { origin: 'http://localhost:3040', 'x-requested-with': 'XMLHttpRequest' }),
    ),
  ).toBe(true);
});
```

- [x] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/auth/csrf.guard.spec.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement the guards and decorator**

```ts
// src/auth/csrf.guard.ts
import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { ALLOWED_ORIGINS } from './auth.tokens';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Spec §10. Two independent checks, because either alone has a known bypass: a custom
 * header cannot be set by a cross-origin form post, and a matching Origin cannot be
 * forged by a browser.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(@Inject(ALLOWED_ORIGINS) private readonly allowedOrigins: string[]) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      method: string;
      headers: Record<string, string | undefined>;
    }>();

    if (SAFE_METHODS.has(request.method)) return true;

    const origin = request.headers.origin;
    if (!origin || !this.allowedOrigins.includes(origin)) {
      throw new ForbiddenException('Cross-origin request refused');
    }
    if (!request.headers['x-requested-with']) {
      throw new ForbiddenException('Missing X-Requested-With');
    }

    return true;
  }
}
```

```ts
// src/auth/session.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { SESSION_COOKIE, type CurrentUser } from './public/auth.port';
import { SessionService } from './session.service';

export interface RequestWithUser {
  headers: Record<string, string | undefined>;
  user?: CurrentUser;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);

    if (!token) throw new UnauthorizedException('SESSION_EXPIRED');

    const user = await this.sessions.resolve(token);
    if (!user) throw new UnauthorizedException('SESSION_EXPIRED');

    request.user = user;
    return true;
  }
}

/** No cookie-parser dependency: one header, split once. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return null;
}
```

```ts
// src/auth/current-user.decorator.ts
import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { CurrentUser } from './public/auth.port';
import type { RequestWithUser } from './session.guard';

export const User = createParamDecorator((_data: unknown, context: ExecutionContext): CurrentUser => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  // SessionGuard runs first and throws otherwise, so this is never undefined in practice.
  return request.user!;
});
```

- [x] **Step 4: Write the controller**

```ts
// src/auth/auth.controller.ts
import { randomBytes } from 'node:crypto';
import { Controller, Get, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { GOOGLE_CONFIG, WEB_ORIGIN } from './auth.tokens';
import { buildAuthorizeUrl, exchangeCode, GoogleAuthError, type GoogleConfig } from './google.client';
import { User } from './current-user.decorator';
import { SESSION_COOKIE, SESSION_TTL_DAYS, type CurrentUser } from './public/auth.port';
import { readCookie, SessionGuard, type RequestWithUser } from './session.guard';
import { SessionService } from './session.service';
import { UserService } from './user.service';

const STATE_COOKIE = 'jas_oauth_state';

@Controller()
export class AuthController {
  constructor(
    @Inject(GOOGLE_CONFIG) private readonly google: GoogleConfig | null,
    @Inject(WEB_ORIGIN) private readonly webOrigin: string,
    private readonly sessions: SessionService,
    private readonly users: UserService,
  ) {}

  @Get('auth/google')
  start(@Res() response: Response): void {
    if (!this.google) throw new GoogleAuthError('Google sign-in is not configured');

    // The state parameter defends the callback against a forged code. It lives in a
    // short httpOnly cookie so only this browser can complete the exchange.
    const state = randomBytes(16).toString('base64url');
    response.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 10 * 60 * 1000,
      path: '/api/auth',
    });
    response.redirect(buildAuthorizeUrl(this.google, state));
  }

  @Get('auth/google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: RequestWithUser,
    @Res() response: Response,
  ): Promise<void> {
    if (!this.google) throw new GoogleAuthError('Google sign-in is not configured');

    const expected = readCookie(request.headers.cookie, STATE_COOKIE);
    if (!code || !state || !expected || state !== expected) {
      throw new GoogleAuthError('OAuth state did not match');
    }
    response.clearCookie(STATE_COOKIE, { path: '/api/auth' });

    const identity = await exchangeCode(this.google, code);
    const user = await this.users.upsertFromGoogle(identity);
    const { token } = await this.sessions.issue(user.id);

    response.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
      path: '/',
    });
    response.redirect(this.webOrigin);
  }

  @Post('auth/logout')
  @UseGuards(SessionGuard)
  async logout(@Req() request: RequestWithUser, @Res() response: Response): Promise<void> {
    const token = readCookie(request.headers.cookie, SESSION_COOKIE);
    if (token) await this.sessions.revoke(token);
    response.clearCookie(SESSION_COOKIE, { path: '/' });
    response.status(204).send();
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@User() user: CurrentUser): CurrentUser {
    return user;
  }
}
```

- [x] **Step 5: Wire the module, register it, regenerate the contract**

Create `src/auth/auth.module.ts` binding `GOOGLE_CONFIG` (null when either key is absent), `OWNER_EMAILS`, `ALLOWED_ORIGINS` and `WEB_ORIGIN` from `ConfigService`, providing `SessionService`, `UserService`, `SessionGuard`, `CsrfGuard`, and exporting `SessionService` and `SessionGuard`. Add `AuthModule` to `app.module.ts` imports and register `CsrfGuard` as an `APP_GUARD`.

Run: `pnpm openapi:generate`
Expected: `openapi.json` gains the four routes.

- [x] **Step 6: Verify sign-in end to end, by hand, with real output**

```bash
pnpm infra:up && pnpm dev
# in another shell:
curl -i http://localhost:3040/api/me                       # expect 401 SESSION_EXPIRED
```

Then open `http://localhost:3040/api/auth/google` in a browser, sign in with `dostonqosimiy19@gmail.com`, and confirm: the browser lands on the web origin, a `jas_session` cookie is set `HttpOnly`, and `GET /api/me` in that browser returns `{"id":"…","email":"dostonqosimiy19@gmail.com","role":"owner"}` — `owner` because the address is in `OWNER_EMAILS`. **Paste the real output into `docs/PROGRESS.md`.**

- [x] **Step 7: Commit**

```bash
git add src/auth/ src/app.module.ts openapi.json
git commit -m "feat(auth): Google sign-in, sessions, CSRF and /me (D-015, D-036, D-037)"
```

---

### Task 8: The brief picks a format, not a style (D-065)

This is the one task that changes P1's tested core. Do it test-first and run the whole suite after.

**Files:**
- Modify: `src/ai/public/brief.schema.ts`, `src/ai/formats/formats.ts`, `src/ai/formats/format.schema.ts`, `src/ai/prompt/assemble.ts`
- Modify: `src/ai/formats/formats.spec.ts`, `src/ai/prompt/assemble.spec.ts`
- Modify: every `fixtures/*/brief.json` and `trial/*/brief.json`

**Interfaces:**
- Produces: `briefSchema` has `formatId: z.enum(FORMAT_IDS)` and no `style`; `CreativeFormat` gains `labelUz: string` and `descriptionUz: string` and loses `styles`

- [x] **Step 1: Write the failing tests**

```ts
// add to src/ai/formats/formats.spec.ts
it('every format carries Uzbek text, because the seller now reads this list', () => {
  for (const format of CREATIVE_FORMATS) {
    expect(format.labelUz.length).toBeGreaterThan(0);
    expect(format.descriptionUz.length).toBeGreaterThan(0);
    // D-014: Uzbek Latin only. Cyrillic here would ship an unreadable picker.
    expect(format.labelUz).not.toMatch(/[Ѐ-ӿ]/);
  }
});

it('no format claims a style any more', () => {
  for (const format of CREATIVE_FORMATS) {
    expect(format).not.toHaveProperty('styles');
  }
});
```

```ts
// add to src/ai/public/contract.spec.ts
it('a brief names its format directly', () => {
  const parsed = briefSchema.parse({ ...validBrief, formatId: 'high-energy' });
  expect(parsed.formatId).toBe('high-energy');
});

it('rejects an unknown format instead of falling back silently', () => {
  expect(() => briefSchema.parse({ ...validBrief, formatId: 'cinematic-vibes' })).toThrow();
});

it('no longer accepts style', () => {
  const parsed = briefSchema.parse({ ...validBrief, formatId: 'ugc-authentic', style: 'ugc' });
  expect(parsed).not.toHaveProperty('style');
});
```

- [x] **Step 2: Run and watch them fail**

Run: `pnpm vitest run src/ai/`
Expected: FAIL on the new assertions.

- [x] **Step 3: Implement**

In `format.schema.ts`: drop `styles`, add `labelUz` and `descriptionUz` (both `z.string().min(1)`).
In `formats.ts`: remove every `styles:` line and the style→format lookup; add Uzbek text per format —
`product-film` → `labelUz: 'Mahsulot filmi'`, `high-energy` → `'Tezkor reklama'`, `lifestyle-story` → `'Hayotiy lavha'`, `ugc-authentic` → `'Tabiiy suratga olish'` — each with one plain Uzbek sentence of description.
In `brief.schema.ts`: replace `style: z.enum(AD_STYLES)` with `formatId: z.enum(FORMAT_IDS)`; delete `AD_STYLES`.
In `assemble.ts`: resolve the format from `brief.formatId` directly instead of mapping from style.

- [x] **Step 4: Update every brief fixture**

```bash
# fixtures and trial both carry "style"; map it to the format it used to resolve to
for f in fixtures/*/brief.json trial/*/brief.json; do
  sed -i 's/"style": *"clean-studio"/"formatId": "product-film"/;
          s/"style": *"premium-cinematic"/"formatId": "product-film"/;
          s/"style": *"lifestyle"/"formatId": "lifestyle-story"/;
          s/"style": *"ugc"/"formatId": "ugc-authentic"/;
          s/"style": *"energetic-social"/"formatId": "high-energy"/' "$f"
done
grep -h 'formatId' fixtures/*/brief.json trial/*/brief.json | sort | uniq -c
```

- [x] **Step 5: Run the whole suite**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. The §49 safety fixtures must still pass — they replay recorded responses, and the recordings do not contain `style`.

- [x] **Step 6: Regenerate the contract and commit**

```bash
pnpm openapi:generate
git add src/ai/ fixtures/ openapi.json
git commit -m "feat(ai): the seller picks a creative format; style is gone (D-062, D-065)"
```

---

### Task 9: Projects

**Files:**
- Create: `src/projects/db/schema.ts`, `src/projects/public/projects.port.ts`, `src/projects/projects.service.ts`, `src/projects/projects.controller.ts`, `src/projects/projects.module.ts`
- Create: `src/projects/projects.service.spec.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `CurrentUser`, `SessionGuard`, `briefSchema`
- Produces:
  - `ProjectsService.create(userId, input): Promise<ProjectSummary>`
  - `ProjectsService.listFor(userId): Promise<ProjectSummary[]>`
  - `ProjectsService.getOwned(userId, projectId): Promise<ProjectSummary>` — throws `ProjectNotFoundError` when missing **or** owned by someone else
  - `ProjectsService.softDelete(userId, projectId): Promise<void>`
  - `interface ProjectSummary { id: string; name: string; formatId: string; createdAt: Date }`
  - `class ProjectNotFoundError extends DomainError` — `code = 'PROJECT_NOT_FOUND'`, `status = 404`

- [x] **Step 1: Write the schema**

```ts
// src/projects/db/schema.ts
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull(),
    goal: text('goal').notNull(),
    /** D-062: the seller's own choice now, not derived from a style. */
    formatId: text('format_id').notNull(),
    platform: text('platform').notNull(),
    aspectRatio: text('aspect_ratio').notNull(),
    /** D-064: Flow makes 10-second clips. */
    durationSeconds: integer('duration_seconds').notNull().default(10),
    audience: text('audience'),
    offer: jsonb('offer'),
    confirmedClaims: jsonb('confirmed_claims').notNull().default([]),
    galleryInspirationId: text('gallery_inspiration_id'),
    briefVersion: integer('brief_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** D-021: photos live until the project is deleted. Soft delete keeps the audit trail. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [index('projects_user_idx').on(table.userId, table.createdAt)],
);

export type ProjectRow = typeof projects.$inferSelect;
```

- [x] **Step 2: Generate the migration and read the SQL**

Run: `pnpm db:generate`
Expected: a migration creating `projects` with the FK to `users`. Read it before continuing.

- [x] **Step 3: Write the failing ownership tests**

```ts
// src/projects/projects.service.spec.ts
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../common/testing/database';
import { ProjectNotFoundError, ProjectsService } from './projects.service';

let db: TestDatabase;
let service: ProjectsService;
let alice: string;
let bob: string;

const brief = {
  name: 'Krossovka',
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

beforeAll(async () => { db = await createTestDatabase(); }, 30_000);
afterAll(async () => { await db.drop(); });

beforeEach(async () => {
  await db.truncateAll();
  service = new ProjectsService(db.pool);
  const made = await db.pool.query<{ id: string }>(
    `INSERT INTO users (google_sub, email) VALUES ('a','a@x.uz'),('b','b@x.uz') RETURNING id`,
  );
  alice = made.rows[0]!.id;
  bob = made.rows[1]!.id;
});

it('creates a project owned by its creator', async () => {
  const project = await service.create(alice, brief);
  expect(project.formatId).toBe('product-film');
  await expect(service.getOwned(alice, project.id)).resolves.toMatchObject({ id: project.id });
});

it("hides Bob's project from Alice as not found, not as forbidden", async () => {
  const bobs = await service.create(bob, brief);
  // 404 rather than 403: a 403 would confirm the id exists, which leaks Bob's data.
  await expect(service.getOwned(alice, bobs.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
});

it('never lists another user’s projects', async () => {
  await service.create(bob, brief);
  await expect(service.listFor(alice)).resolves.toEqual([]);
});

it('refuses to delete a project Alice does not own', async () => {
  const bobs = await service.create(bob, brief);
  await expect(service.softDelete(alice, bobs.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
  await expect(service.getOwned(bob, bobs.id)).resolves.toBeTruthy();
});

it('hides a soft-deleted project from its own owner', async () => {
  const project = await service.create(alice, brief);
  await service.softDelete(alice, project.id);
  await expect(service.getOwned(alice, project.id)).rejects.toBeInstanceOf(ProjectNotFoundError);
});
```

- [x] **Step 4: Run and watch it fail**

Run: `pnpm vitest run src/projects/projects.service.spec.ts`
Expected: FAIL — module not found.

- [x] **Step 5: Implement the service**

Every query filters on `user_id = $userId AND deleted_at IS NULL` **in the SQL**, never in application code after the fetch. `getOwned` returning nothing throws `ProjectNotFoundError`.

- [x] **Step 6: Write the controller**

`POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`, `DELETE /projects/:id` — all under `@UseGuards(SessionGuard)`, all taking `@User() user: CurrentUser` and passing `user.id` as the first argument. Validate bodies with `briefSchema` through `nestjs-zod`.

- [x] **Step 7: Run everything and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm openapi:generate
git add src/projects/ drizzle/ src/app.module.ts openapi.json
git commit -m "feat(projects): projects with server-side ownership on every query"
```

---

### Task 10: The image pipeline

**Files:**
- Create: `src/assets/image.pipeline.ts`, `src/assets/image.pipeline.spec.ts`

**Interfaces:**
- Produces:
  - `processUpload(bytes: Buffer): Promise<ProcessedImage>`
  - `interface ProcessedImage { reference: Buffer; modelInput: Buffer; width: number; height: number }`
  - `class UploadRejected extends DomainError` — codes `UPLOAD_TYPE`, `UPLOAD_TOO_LARGE`, `UPLOAD_DAMAGED`
  - `const MAX_UPLOAD_BYTES = 10 * 1024 * 1024`, `REFERENCE_EDGE = 2048`, `MODEL_INPUT_EDGE = 1024`

- [x] **Step 1: Write the failing tests**

```ts
// src/assets/image.pipeline.spec.ts
import sharp from 'sharp';
import { expect, it } from 'vitest';
import { MODEL_INPUT_EDGE, processUpload, REFERENCE_EDGE, UploadRejected } from './image.pipeline';

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#c0ffee' } })
    .jpeg()
    .toBuffer();
}

it('produces both copies within their edge limits', async () => {
  const processed = await processUpload(await jpeg(4000, 3000));
  const reference = await sharp(processed.reference).metadata();
  const model = await sharp(processed.modelInput).metadata();
  expect(Math.max(reference.width!, reference.height!)).toBe(REFERENCE_EDGE);
  expect(Math.max(model.width!, model.height!)).toBe(MODEL_INPUT_EDGE);
});

it('never enlarges an image that is already small', async () => {
  const processed = await processUpload(await jpeg(400, 300));
  const reference = await sharp(processed.reference).metadata();
  expect(reference.width).toBe(400);
});

it('strips EXIF, so GPS never reaches storage', async () => {
  const withExif = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#fff' } })
    .withExif({ IFD0: { Copyright: 'seller', Software: 'camera' } })
    .jpeg()
    .toBuffer();
  const processed = await processUpload(withExif);
  expect((await sharp(processed.reference).metadata()).exif).toBeUndefined();
});

it('rejects a PDF renamed as a photo, by decoding rather than trusting the name', async () => {
  await expect(processUpload(Buffer.from('%PDF-1.7 not an image'))).rejects.toBeInstanceOf(
    UploadRejected,
  );
});

it('rejects an image over the pixel limit before allocating it', async () => {
  const huge = await sharp({ create: { width: 9000, height: 9000, channels: 3, background: '#000' } })
    .jpeg()
    .toBuffer();
  await expect(processUpload(huge)).rejects.toThrow(/UPLOAD_TOO_LARGE|pixel/i);
});
```

- [x] **Step 2: Run and watch it fail**

Run: `pnpm vitest run src/assets/image.pipeline.spec.ts`
Expected: FAIL — module not found.

- [x] **Step 3: Implement**

```ts
// src/assets/image.pipeline.ts
import sharp from 'sharp';
import { DomainError } from '../common/errors/app.error';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 40_000_000;
export const REFERENCE_EDGE = 2048;
export const MODEL_INPUT_EDGE = 1024;

const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class UploadRejected extends DomainError {
  readonly status = 400;
  constructor(
    readonly code: 'UPLOAD_TYPE' | 'UPLOAD_TOO_LARGE' | 'UPLOAD_DAMAGED',
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
  }
}

export interface ProcessedImage {
  reference: Buffer;
  modelInput: Buffer;
  width: number;
  height: number;
}

/**
 * R-6: exactly two copies survive, and the original is never written to disk. EXIF and
 * GPS leave with it, because sharp emits no metadata unless asked.
 *
 * The format is decided by decoding, never by filename or client content-type — both are
 * attacker-controlled (spec §7.1).
 */
export async function processUpload(bytes: Buffer): Promise<ProcessedImage> {
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new UploadRejected('UPLOAD_TOO_LARGE', 'Upload is over 10 MB');
  }

  let metadata;
  try {
    metadata = await sharp(bytes, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch (cause) {
    throw new UploadRejected('UPLOAD_DAMAGED', 'Image could not be decoded', { cause });
  }

  if (!metadata.format || !ALLOWED_FORMATS.has(metadata.format)) {
    throw new UploadRejected('UPLOAD_TYPE', 'Only JPG, PNG and WebP are accepted');
  }
  if (!metadata.width || !metadata.height) {
    throw new UploadRejected('UPLOAD_DAMAGED', 'Image has no dimensions');
  }
  if (metadata.width * metadata.height > MAX_PIXELS) {
    throw new UploadRejected('UPLOAD_TOO_LARGE', 'Image exceeds the pixel limit');
  }

  const render = (edge: number): Promise<Buffer> =>
    sharp(bytes, { limitInputPixels: MAX_PIXELS })
      .rotate() // apply the EXIF orientation before stripping it, or portraits land sideways
      .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();

  const [reference, modelInput] = await Promise.all([
    render(REFERENCE_EDGE),
    render(MODEL_INPUT_EDGE),
  ]);

  return { reference, modelInput, width: metadata.width, height: metadata.height };
}
```

- [x] **Step 4: Run and watch it pass**

Run: `pnpm vitest run src/assets/image.pipeline.spec.ts`
Expected: PASS, 5 tests.

- [x] **Step 5: Commit**

```bash
git add src/assets/
git commit -m "feat(assets): decode-first image pipeline producing two stripped copies (R-6)"
```

---

### Task 11: Storage, upload and authorized download

**Requires the `@types/multer` approval from the gate section above.**

**Files:**
- Create: `src/assets/db/schema.ts`, `src/assets/storage.ts`, `src/assets/public/assets.port.ts`, `src/assets/assets.service.ts`, `src/assets/assets.controller.ts`, `src/assets/assets.module.ts`
- Create: `src/assets/assets.service.spec.ts`, `src/assets/storage.spec.ts`
- Modify: `src/app.module.ts`

**Interfaces:**
- Consumes: `ProjectsService.getOwned` (through `projects/public`), `processUpload`
- Produces:
  - `AssetsService.upload(userId, projectId, bytes): Promise<StoredAsset>`
  - `AssetsService.readReference(userId, assetId): Promise<{ bytes: Buffer; contentType: 'image/jpeg' }>`
  - `AssetsService.delete(userId, assetId): Promise<void>`
  - `interface StoredAsset { id: string; projectId: string; width: number; height: number; bytes: number }`
  - `class AssetNotFoundError extends DomainError` — `code = 'ASSET_NOT_FOUND'`, `status = 404`

- [x] **Step 1: Install the dev dependency (only after approval)**

```bash
pnpm add -D @types/multer
```

- [x] **Step 2: Write the schema and generate the migration**

`assets` table per spec §4: `id`, `project_id` (FK cascade), `user_id` (FK cascade), `kind` (`reference` | `model_input`), `path`, `width`, `height`, `bytes`, `sha256`, `is_primary`, `created_at`. Index on `project_id`.

Run: `pnpm db:generate` and read the SQL.

- [x] **Step 3: Write the failing storage test**

```ts
// src/assets/storage.spec.ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { FileStorage } from './storage';

it('writes under a random path that never contains the user or project id', async () => {
  const root = mkdtempSync(join(tmpdir(), 'jas-'));
  const storage = new FileStorage(root);
  const path = await storage.write(Buffer.from('hello'));

  expect(path).not.toContain('..');
  expect(readFileSync(join(root, path)).toString()).toBe('hello');
});

it('refuses to read outside the storage root', async () => {
  const storage = new FileStorage(mkdtempSync(join(tmpdir(), 'jas-')));
  await expect(storage.read('../../etc/passwd')).rejects.toThrow(/outside/i);
});
```

- [x] **Step 4: Implement storage**

`write` generates `randomBytes(16).toString('hex')` split into two directory levels; `read` resolves the path and throws unless the resolved absolute path still starts with the resolved root — the traversal guard the test demands.

- [x] **Step 5: Write the failing service tests**

```ts
// src/assets/assets.service.spec.ts — the shape that matters
it('rejects an upload to a project the user does not own', async () => {
  const bobs = await projects.create(bob, brief);
  await expect(assets.upload(alice, bobs.id, await jpeg(800, 600))).rejects.toBeInstanceOf(
    ProjectNotFoundError,
  );
});

it('stores exactly two rows per upload and no original', async () => {
  const project = await projects.create(alice, brief);
  await assets.upload(alice, project.id, await jpeg(3000, 2000));
  const { rows } = await db.pool.query<{ kind: string }>('SELECT kind FROM assets ORDER BY kind');
  expect(rows.map((r) => r.kind)).toEqual(['model_input', 'reference']);
});

it("refuses to serve Bob's photo to Alice", async () => {
  const bobs = await projects.create(bob, brief);
  const asset = await assets.upload(bob, bobs.id, await jpeg(800, 600));
  await expect(assets.readReference(alice, asset.id)).rejects.toBeInstanceOf(AssetNotFoundError);
});

it('deleting a project deletes its asset rows', async () => {
  const project = await projects.create(alice, brief);
  await assets.upload(alice, project.id, await jpeg(800, 600));
  await db.pool.query('DELETE FROM projects WHERE id = $1', [project.id]);
  const { rows } = await db.pool.query<{ count: string }>('SELECT count(*) FROM assets');
  expect(rows[0]?.count).toBe('0');
});
```

- [x] **Step 6: Implement the service and controller**

`upload` calls `projects.getOwned(userId, projectId)` **first** — that single call is the ownership check, and it throws before any bytes are processed. `readReference` joins `assets` to `projects` filtering on `user_id`, so the ownership check is in SQL.

Controller: `POST /projects/:id/assets` with `FileInterceptor('photo')` and a 10 MB multer limit; `GET /assets/:id/reference` returning `image/jpeg` with `Cache-Control: private, no-store`; `DELETE /assets/:id`. All under `SessionGuard`.

- [x] **Step 7: Run everything and commit**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm openapi:generate
git add src/assets/ drizzle/ src/app.module.ts openapi.json package.json pnpm-lock.yaml
git commit -m "feat(assets): private uploads with ownership enforced in SQL (R-6, spec §7)"
```

---

### Task 12: The P2 exit gate — one isolation suite that proves it

PLAN.md's exit check is: *user A can't read, overwrite, generate from, or delete user B's data.* Tasks 9 and 11 test that piecewise. This task proves it once, at the HTTP layer, because that is where a real attacker stands.

**Files:**
- Create: `src/isolation.e2e.spec.ts`

- [x] **Step 1: Write the suite**

Boot the real Nest app against the test database with `Test.createTestingModule`, create two users and a session cookie each by calling `SessionService.issue` directly (no Google round-trip), then assert with supertest-style requests through the app:

| Alice does | Expected |
|---|---|
| `GET /api/projects/{bobs}` | 404 `PROJECT_NOT_FOUND` |
| `PATCH /api/projects/{bobs}` | 404 |
| `DELETE /api/projects/{bobs}` | 404, and Bob's project still resolves for Bob |
| `POST /api/projects/{bobs}/assets` | 404, and no asset row is created |
| `GET /api/assets/{bobs-asset}/reference` | 404 |
| `DELETE /api/assets/{bobs-asset}` | 404, and the file is still on disk |
| `GET /api/projects` | Bob's project absent |
| any of the above with no cookie | 401 `SESSION_EXPIRED` |
| `POST /api/projects` with a cookie but no `X-Requested-With` | 403 |

Every refusal must be **404, never 403** — a 403 confirms the id exists.

- [x] **Step 2: Run it**

Run: `pnpm vitest run src/isolation.e2e.spec.ts`
Expected: PASS, 9 cases.

- [x] **Step 3: Run the full gate and record it**

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check
```

Paste the real counts into `docs/PROGRESS.md`, update **Resume here**, and mark P2 complete in `docs/PLAN.md` only if every command above is green.

- [x] **Step 4: Commit**

```bash
git add src/isolation.e2e.spec.ts docs/
git commit -m "test: P2 exit gate — user A cannot touch user B's data at the HTTP layer"
```

---

## Self-review against the spec

| Spec requirement | Task |
|---|---|
| §3 `auth` module, four routes | 4, 5, 6, 7 |
| §3 `projects` module, five routes | 9 |
| §3 `assets` module, three routes | 10, 11 |
| §4 `users`, `sessions` | 3 |
| §4 `projects` with `format_id` | 9 |
| §4 `assets` | 11 |
| §7.1 signature check, not extension | 10 |
| §7.2 sharp decode with pixel limit | 10 |
| §7.3 two copies, metadata stripped | 10 |
| §7.4 random path, no public URL | 11 |
| §9 error codes | 4, 9, 10, 11 |
| §10 httpOnly cookie, CSRF pair | 7 |
| §11 real-Postgres integration tests | 1, and every task after |
| R-1/D-036 opaque session id | 5 |
| R-6 two copies only | 10 |
| R-7 port-only imports | enforced by lint in every task |
| D-037 owner from allowlist | 6 |
| D-062/D-065 seller picks format | 8 |
| PLAN.md exit check | 12 |

**Not in this plan, on purpose:** credits, orders, the ledger, generation jobs, the worker, rate limits and the spend cap. Those are P3 and P4. `site_settings` and `/owner/*` land in P3 with the credit flow they exist to serve.
