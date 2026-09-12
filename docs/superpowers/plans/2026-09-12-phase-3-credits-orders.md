# Phase 3 — Credits and Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller can see a balance, place an order for a credit pack, and cancel it while it is pending. The owner can confirm or reject that order, or grant credits by hand. Every movement of a credit is one row in a ledger that the account balance can be checked against, and confirming the same order twice credits it exactly once.

**Architecture:** Two new modules. `credits` owns the four money tables (`credit_packs`, `credit_orders`, `credit_accounts`, `credit_ledger`) and every statement that moves a credit. `owner` owns the owner-only HTTP surface and `owner_audit_log`, and reaches money only through the `credits` port (R-7). The balance is a row, not a `SUM()` — a reserve is one atomic `UPDATE … WHERE available >= 1` (R-3) — and every change to that row writes a ledger row in the same transaction.

**Tech Stack:** NestJS 11, Drizzle + Postgres, zod 4, vitest 3. **No new dependency, runtime or dev.**

**Spec:** `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` (§3 modules, §4 data model, §6 the money-critical path, §9 errors, §10 limits, §11 testing)
**Sources:** `docs/source/03-addendum-a-paid-credits.md` §A3–A5, §A8. **D-007 to D-010, D-020, D-037, D-038 (R-3, R-4).**

---

## What Doston decided when this plan was commissioned (2026-09-12)

Three questions were asked before a line was written. The answers shaped the phase:

1. **The reserve/debit/release primitives are built in P3, not P4** — with their concurrency tests against a real Postgres. P4 then only calls them and wires the job states. This is why Tasks 4 and 5 exist and why every primitive takes an optional `Executor` (Task 1): P4's `POST /generations` must reserve a credit *inside the same transaction* that inserts the generation row, and a method that can only use the pool cannot do that.
2. **`site_settings` and the payment instructions are in P3.** Doston first deferred this to P5, then reversed it while the plan was being written: *"add the payment part to phase 3."* So Task 6 builds the `settings` module and the seller can be told where to send money. **What this does not include:** automatic Payme or Click checkout. D-008 defers that because it needs a registered business and a merchant agreement, and nothing in this phase talks to a provider. "Payment" here means the owner-configured instructions of Addendum A §A4 step 2, and the manual confirmation that follows.
3. **The packs carry editable placeholder prices**, seeded inactive. See Task 7 for the exact rule, and D-072.

## Known gaps, accepted on purpose

- **No payment provider integration.** D-008: manual confirmation only, because automatic Payme or Click checkout needs a registered business and a merchant agreement. The owner reads the payment reference, checks the money arrived, and confirms. The confirm path is one service method so a verified merchant callback can call it later without a redesign.
- **No QR image.** Addendum A §A4 step 2 mentions "a Payme/Click payment link or QR code". P3 stores the link; rendering a QR from it is a web-repo concern and needs no API support.
- **`credit_ledger.generation_id` has no foreign key yet.** The `generations` table does not exist until P4. The column is a plain `uuid` in this phase and P4's first migration adds the constraint. Written down so P4 does not have to rediscover it.

---

## Global Constraints

- **R-7 module boundaries.** A module imports `common/`, its own files, its own `db/` schema, and any module's `public/` port. Nothing else. `pnpm lint` fails otherwise. In this phase that has teeth: the `owner` module may never write a `SELECT` against `credit_orders`.
- **Money moves only through the ledger.** Every statement that changes `credit_accounts` writes a `credit_ledger` row in the **same transaction**. There is no code path that touches one without the other. If a task seems to need one, stop and ask.
- **Clients never write the ledger and never set an order status.** The only status a client can cause is `pending` (by creating an order) and `cancelled` (their own, while pending). `paid` and `rejected` are owner-only.
- **One order credits exactly once.** Guaranteed by the database, not by a code check: `UNIQUE (order_id) WHERE type = 'purchase'`.
- **Balance is never computed from the ledger at read time** (R-3). The ledger is the audit trail and the invariant check; `credit_accounts` is the balance.
- **Every table change is a committed SQL migration** via `pnpm db:generate`. Never hand-edit generated SQL.
- **Error shape is `{ code, messageKey, details?, requestId }`** (spec §9). Throw a `DomainError` subclass for anything a caller can act on; an impossible state is an `InfraError`, because a debit with nothing reserved is our bug, not the seller's.
- **R-4: money logic is tested against a real Postgres.** `createTestDatabase()` already exists (`src/common/testing/database.ts`). Mock-only tests are not acceptable evidence in this phase — they cannot see any of the four races.
- **No invented prices ever reach a seller** (CLAUDE.md product rules, Addendum A §A3, A8). Task 7 is the mechanism.
- **Node 24.** Run `nvm use` before any command in this plan.
- **Verification is by real output.** A task is done when its command is run and its output pasted, not when it looks right.

---

## The ledger model

`credit_ledger.amount` is **always a positive magnitude**; the `type` decides what it did. This keeps a row readable on its own ("debit 1" is one credit spent, not "amount 0") and makes the invariant one query:

```
available  =  Σ purchase  +  Σ owner_grant  +  Σ release  −  Σ reserve
reserved   =  Σ reserve   −  Σ release      −  Σ debit
```

| type | account effect | written by |
|---|---|---|
| `purchase` | `available + n` | owner confirms an order (Task 8) |
| `owner_grant` | `available + n` | owner grants by hand, note required (Task 8) |
| `reserve` | `available − 1`, `reserved + 1` | P4, a generation starts (primitive in Task 4) |
| `debit` | `reserved − 1` | P4, a package is saved |
| `release` | `reserved − 1`, `available + 1` | P4, a job failed, refused or needs input (D-020) |

`reserve`, `debit` and `release` are built and race-tested here (Doston's decision) but **nothing calls them in P3** except their tests. That is deliberate: P4 inherits a primitive that is already proven, not a primitive plus a job engine to debug at once.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/common/db/transaction.ts` | `withTransaction(pool, fn)` and the `Executor` type every money method accepts |
| `src/common/config/env.schema.ts` *(modify)* | Add `ORDERS_PER_DAY_LIMIT` |
| `src/common/testing/ledger.ts` | `assertLedgerMatchesAccounts(pool)` — the invariant, as a test helper |
| `src/credits/db/schema.ts` | `credit_packs`, `credit_orders`, `credit_accounts`, `credit_ledger` |
| `src/credits/public/credits.port.ts` | `CreditBalance`, `CreditPack`, `CreditOrderSummary`, the `CREDIT_LEDGER` and `CREDIT_ADMIN` tokens |
| `src/credits/public/credits.errors.ts` | `NoCreditsError`, `OrderNotFoundError`, `OrderNotPendingError`, `PackNotAvailableError`, `LedgerInvariantError` |
| `src/credits/credits.dto.ts` | `createZodDto` classes, so the contract keeps its shapes (D-031, T-09) |
| `src/credits/accounts.service.ts` | `getBalance`, `ensureAccount`, and the five ledger primitives |
| `src/credits/packs.service.ts` | Public pack list, owner edit, the activation rule |
| `src/credits/orders.service.ts` | Create, list, cancel; confirm and reject; the per-day cap |
| `src/credits/credits.controller.ts` | `GET /credits/balance`, `GET /packs`, `POST /orders`, `GET /orders`, `POST /orders/:id/cancel` |
| `src/credits/credits.module.ts` | Wiring; `@Global()` so `owner` can reach the ports |
| `src/settings/db/schema.ts` | `site_settings` |
| `src/settings/public/settings.port.ts` | `PaymentInstructions`, `SupportContacts`, the `SETTINGS_READER` and `SETTINGS_ADMIN` tokens |
| `src/settings/settings.service.ts` | Read a key, write a key, per-key validation |
| `src/settings/settings.controller.ts` | `GET /settings/public` — works signed out |
| `src/settings/settings.module.ts` | Wiring; `@Global()` |
| `src/owner/db/schema.ts` | `owner_audit_log` |
| `src/owner/public/audit.port.ts` | `AUDIT_WRITER` token, `AuditWriter` interface (takes an `Executor`) |
| `src/owner/owner.guard.ts` | Role `owner` only; anything else is a 404, never a 403 |
| `src/owner/audit.service.ts` | Append-only writer, joins the caller's transaction |
| `src/owner/owner.controller.ts` | `/owner/orders`, `/owner/orders/:id/confirm`, `/owner/orders/:id/reject`, `/owner/grants`, `/owner/packs/:id`, `/owner/users` |
| `src/owner/owner.dto.ts` | `createZodDto` classes for the owner routes |
| `src/owner/owner.module.ts` | Wiring |
| `src/app.module.ts` *(modify)* | Register `CreditsModule`, `OwnerModule` |
| `src/money.e2e.spec.ts` | **The P3 exit gate.** The four races and the invariant, over real HTTP |

---

## Standing-gate approvals needed before starting

1. **This phase changes the database schema** — five new tables across two migrations (Tasks 2 and 9). That is on the standing gate. Doston approved this plan, and therefore these tables, on 2026-09-12. Any table or column *not* listed in Tasks 2 and 9 needs a fresh ask.
2. **This phase touches money.** Also on the standing gate, and the reason for the "Money moves only through the ledger" constraint above. Approved with the plan.
3. **No dependency is added.** If a task appears to need one, stop and ask.
4. **Four new error codes** beyond spec §9's list: `ORDER_NOT_PENDING`, `PACK_NOT_AVAILABLE`, `GRANT_NOTE_REQUIRED`, `PAYMENT_NOT_CONFIGURED`. `NO_CREDITS`, `ORDER_PENDING` and `RATE_LIMITED` are already in the spec. Recorded in D-073.

---

### Task 1: The transaction helper, and the `Executor` every money method takes

Nothing in the codebase runs more than one statement atomically yet — every service holds a `Pool` and calls `pool.query`. Money needs transactions, and P4 needs to *join* one from another module. Both come from one small file.

**Files:**
- Create: `src/common/db/transaction.ts`
- Create: `src/common/db/transaction.spec.ts`
- Modify: `src/common/config/env.schema.ts`

**Interfaces:**
- Produces:
  - `type Executor = Pool | PoolClient` — anything that can run a query. Every money method's last parameter is `tx: Executor = this.pool`.
  - `withTransaction<T>(pool: Pool, fn: (tx: PoolClient) => Promise<T>): Promise<T>` — `BEGIN`, run, `COMMIT`; on any throw `ROLLBACK` and rethrow; `client.release()` in a `finally`.
  - `isUniqueViolation(error: unknown): boolean` — Postgres `23505`. Task 8's idempotency depends on it.

- [x] **Step 1: Write the helper**

```ts
// src/common/db/transaction.ts
import type { Pool, PoolClient } from 'pg';

/**
 * Anything that can run a statement. Money methods take one of these rather than reaching
 * for their own pool, so a caller in another module can enlist them in a transaction it
 * already owns — which is exactly what P4's POST /generations must do: reserve a credit
 * and insert the generation row, or neither.
 */
export type Executor = Pick<Pool, 'query'>;

/** Postgres unique-violation. The only way to tell "already credited" from a real failure. */
const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === UNIQUE_VIOLATION;
}

export async function withTransaction<T>(pool: Pool, fn: (tx: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    // A failed ROLLBACK must not mask the error that caused it.
    try {
      await client.query('ROLLBACK');
    } catch {
      /* the original error is the one worth reporting */
    }
    throw error;
  } finally {
    client.release();
  }
}
```

`Executor` is `Pick<Pool, 'query'>` rather than `Pool | PoolClient` on purpose: the union's `query` overloads do not collapse into one callable signature, and every call site then needs a cast.

- [x] **Step 2: Add the order cap to the environment**

In `src/common/config/env.schema.ts`, beside the existing limits:

```ts
/** Spec §10: orders get a per-day cap. Abuse here is owner time, not money. */
ORDERS_PER_DAY_LIMIT: z.coerce.number().int().positive().default(5),
```

- [x] **Step 3: Test it against a real Postgres**

`src/common/db/transaction.spec.ts`, using `createTestDatabase()`:

1. a committed function's writes are visible afterwards
2. a throwing function leaves no rows, and the error propagates unchanged
3. the pool has no leaked clients afterwards — assert `pool.idleCount === 1 && pool.totalCount === 1` after both cases (this is what catches a missing `release()`)
4. `isUniqueViolation` is true for a real duplicate-key error and false for a syntax error

Use a scratch table created inside the test (`CREATE TABLE tx_probe (id int primary key)`), not a domain table — this file must not depend on the credit schema existing.

Run: `pnpm vitest run src/common/db/transaction.spec.ts`
Expected: 4 passed. Paste the output.

- [x] **Step 4: `pnpm lint && pnpm typecheck`**

Expected: both silent. `common/` may import only `common/`, and this file imports only `pg` — no boundary change.

---

### Task 2: The four credit tables

**Files:**
- Create: `src/credits/db/schema.ts`
- Generates: `drizzle/migrations/0003_*.sql`

**Interfaces:**
- Produces: `creditPacks`, `creditOrders`, `creditAccounts`, `creditLedger`, and their `$inferSelect` row types.

- [x] **Step 1: Write the schema**

```ts
// src/credits/db/schema.ts
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { users } from '../../auth/db/schema';

/** D-009: three packs, 1 / 5 / 15 credits. Jakhongir sets the prices (D-072). */
export const creditPacks = pgTable(
  'credit_packs',
  {
    /** A slug, not a uuid: it is seeded, referenced by orders, and read by a human owner. */
    id: text('id').primaryKey(),
    credits: integer('credits').notNull(),
    /** Som. Nullable because a pack with no price is not for sale (D-009). */
    priceUzs: bigint('price_uzs', { mode: 'number' }),
    /**
     * D-072: a pack is offered for sale only when an owner has activated it, and
     * activation requires the owner to state the price in the same request. So a
     * placeholder price can never be shown to a seller.
     */
    isActive: boolean('is_active').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('credit_packs_credits_check', sql`${table.credits} > 0`),
    check('credit_packs_price_check', sql`${table.priceUzs} IS NULL OR ${table.priceUzs} > 0`),
    // An active pack without a price would be an unsellable pack offered for sale.
    check('credit_packs_active_needs_price', sql`NOT ${table.isActive} OR ${table.priceUzs} IS NOT NULL`),
  ],
);

/** Addendum A §A4. Replaces the spec's `additional_allowance_requests`. */
export const creditOrders = pgTable(
  'credit_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    /** restrict, not cascade: deleting a pack must never erase the record of a sale. */
    packId: text('pack_id').notNull().references(() => creditPacks.id, { onDelete: 'restrict' }),
    /** Snapshotted from the pack at creation, so a later price edit cannot rewrite a placed order. */
    credits: integer('credits').notNull(),
    amountUzs: bigint('amount_uzs', { mode: 'number' }).notNull(),
    status: text('status').notNull().default('pending'),
    paymentMethod: text('payment_method').notNull(),
    payerReference: text('payer_reference'),
    rejectionReason: text('rejection_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (table) => [
    index('credit_orders_user_idx').on(table.userId, table.createdAt),
    // The owner's queue: pending orders, oldest first. Partial, because it is the only
    // listing the owner panel makes and pending is a small slice of the table.
    index('credit_orders_pending_idx').on(table.createdAt).where(sql`${table.status} = 'pending'`),
    check('credit_orders_status_check', sql`${table.status} IN ('pending','paid','rejected','cancelled')`),
    check(
      'credit_orders_method_check',
      sql`${table.paymentMethod} IN ('card_transfer','payme','click','other')`,
    ),
    check('credit_orders_credits_check', sql`${table.credits} > 0 AND ${table.amountUzs} > 0`),
    // Bounded, per Addendum A. Free text from a client always gets a ceiling.
    check('credit_orders_reference_len', sql`${table.payerReference} IS NULL OR length(${table.payerReference}) <= 120`),
    // A paid order must say who confirmed it and when; an unpaid one must not claim to be.
    check(
      'credit_orders_paid_needs_confirmer',
      sql`(${table.status} = 'paid') = (${table.confirmedAt} IS NOT NULL)`,
    ),
    check(
      'credit_orders_rejected_needs_reason',
      sql`${table.status} <> 'rejected' OR ${table.rejectionReason} IS NOT NULL`,
    ),
  ],
);

/** R-3: the balance is a row with a CHECK, not a SUM over the ledger. */
export const creditAccounts = pgTable(
  'credit_accounts',
  {
    userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
    available: integer('available').notNull().default(0),
    reserved: integer('reserved').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The last line of defence. If any statement ever tries to overspend, the database
    // refuses the transaction rather than letting a negative balance exist.
    check('credit_accounts_non_negative', sql`${table.available} >= 0 AND ${table.reserved} >= 0`),
  ],
);

export const creditLedger = pgTable(
  'credit_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    /** Always positive. The type decides the direction — see "The ledger model" above. */
    amount: integer('amount').notNull(),
    orderId: uuid('order_id').references(() => creditOrders.id, { onDelete: 'restrict' }),
    /**
     * No foreign key yet: `generations` does not exist until P4, whose first migration
     * adds the constraint. Deliberate, and recorded in the plan's Known gaps.
     */
    generationId: uuid('generation_id'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('credit_ledger_user_idx').on(table.userId, table.createdAt),
    check(
      'credit_ledger_type_check',
      sql`${table.type} IN ('purchase','owner_grant','reserve','debit','release')`,
    ),
    check('credit_ledger_amount_check', sql`${table.amount} > 0`),
    // Addendum A §A3: a grant without a reason is not auditable.
    check(
      'credit_ledger_grant_needs_note',
      sql`${table.type} <> 'owner_grant' OR (${table.note} IS NOT NULL AND length(btrim(${table.note})) > 0)`,
    ),
    check('credit_ledger_purchase_needs_order', sql`${table.type} <> 'purchase' OR ${table.orderId} IS NOT NULL`),
    // THE money guarantee (Addendum A §A4): one order credits exactly once, enforced by
    // the database, so a double confirm cannot depend on application code being careful.
    uniqueIndex('credit_ledger_one_purchase_per_order')
      .on(table.orderId)
      .where(sql`${table.type} = 'purchase'`),
  ],
);

export type CreditPackRow = typeof creditPacks.$inferSelect;
export type CreditOrderRow = typeof creditOrders.$inferSelect;
export type CreditAccountRow = typeof creditAccounts.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
```

- [x] **Step 2: Generate the migration and read the SQL before continuing**

Run: `pnpm db:generate`
Expected: `drizzle/migrations/0003_*.sql` creating four tables. **Read it.** Confirm by eye that it contains: the partial unique index on `(order_id) WHERE type = 'purchase'`, the `credit_accounts` non-negative CHECK, and `ON DELETE restrict` on `credit_orders.pack_id` and `credit_ledger.order_id`. If any is missing, fix the schema — never the generated SQL.

- [x] **Step 3: Prove the constraints, not the ORM**

`src/credits/db/schema.spec.ts` against `createTestDatabase()`. Each of these asserts the *database* refuses the write:

1. `credit_accounts.available = -1` → violates `credit_accounts_non_negative`
2. two `purchase` rows with the same `order_id` → violates `credit_ledger_one_purchase_per_order`
3. two `reserve` rows with the same `order_id` → **allowed** (the index is partial; this is the test that proves it is not a blanket unique)
4. `owner_grant` with `note = NULL` and with `note = '   '` → both violate `credit_ledger_grant_needs_note`
5. `credit_ledger.amount = 0` → violates `credit_ledger_amount_check`
6. `credit_packs` with `is_active = true, price_uzs = NULL` → violates `credit_packs_active_needs_price`
7. `credit_orders` with `status = 'paid', confirmed_at = NULL` → violates `credit_orders_paid_needs_confirmer`
8. `credit_orders` with `status = 'rejected', rejection_reason = NULL` → violates `credit_orders_rejected_needs_reason`

Run: `pnpm vitest run src/credits/db/schema.spec.ts`
Expected: 8 passed. Paste it.

- [x] **Step 4: `pnpm lint && pnpm typecheck && pnpm test`**

The whole suite, because a new migration runs in every other integration test's throwaway database too.

---

### Task 3: The credits port and its errors

The contract the rest of the app — and P4 — is allowed to see. Types and DI tokens only (R-7).

**Files:**
- Create: `src/credits/public/credits.port.ts`, `src/credits/public/credits.errors.ts`

**Interfaces:**

```ts
// src/credits/public/credits.port.ts  (shape, not the whole file)
export const creditBalanceSchema = z.object({
  available: z.number().int().nonnegative(),
  reserved: z.number().int().nonnegative(),
});
export type CreditBalance = z.infer<typeof creditBalanceSchema>;

export const creditPackSchema = z.object({
  id: z.string(),
  credits: z.number().int().positive(),
  priceUzs: z.number().int().positive(),   // never null here: unpriced packs are not returned
  sortOrder: z.number().int(),
});

export const creditOrderSummarySchema = z.object({
  id: z.uuid(),
  packId: z.string(),
  credits: z.number().int().positive(),
  amountUzs: z.number().int().positive(),
  status: z.enum(['pending', 'paid', 'rejected', 'cancelled']),
  paymentMethod: z.enum(['card_transfer', 'payme', 'click', 'other']),
  payerReference: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  createdAt: z.iso.datetime(),        // D-069/T-09: the wire type, not the db type
  confirmedAt: z.iso.datetime().nullable(),
});

/** What P4 needs, and nothing more. Every method takes an Executor so P4 can enlist it. */
export const CREDIT_LEDGER = Symbol('CREDIT_LEDGER');
export interface CreditLedgerPort {
  getBalance(userId: string, tx?: Executor): Promise<CreditBalance>;
  /** Atomic. Throws NoCreditsError when available < 1. */
  reserveOne(userId: string, generationId: string | null, tx?: Executor): Promise<CreditBalance>;
  debit(userId: string, generationId: string | null, tx?: Executor): Promise<CreditBalance>;
  release(userId: string, generationId: string | null, tx?: Executor): Promise<CreditBalance>;
}

/** What the owner module needs. Separate token: the seller path must not reach these. */
export const CREDIT_ADMIN = Symbol('CREDIT_ADMIN');
export interface CreditAdminPort {
  listOrders(status: OrderStatus | null, limit: number, tx?: Executor): Promise<CreditOrderSummary[]>;
  confirmOrder(orderId: string, ownerId: string, tx?: Executor): Promise<ConfirmResult>;
  rejectOrder(orderId: string, ownerId: string, reason: string, tx?: Executor): Promise<CreditOrderSummary>;
  grant(userId: string, credits: number, note: string, tx?: Executor): Promise<CreditBalance>;
  setPack(packId: string, input: PackEdit, tx?: Executor): Promise<CreditPackRowPublic>;
}

/** `alreadyPaid` is how the caller knows a second confirm changed nothing. */
export interface ConfirmResult {
  order: CreditOrderSummary;
  credited: number;
  alreadyPaid: boolean;
}
```

Errors, in `credits.errors.ts` (precedent: `src/auth/public/auth.errors.ts`):

| class | code | status | when |
|---|---|---|---|
| `NoCreditsError` | `NO_CREDITS` | **402** | `reserveOne` found `available < 1` (spec §6) |
| `OrderNotFoundError` | `ORDER_NOT_FOUND` | 404 | missing, or not this user's — same answer for both, as in P2 |
| `OrderNotPendingError` | `ORDER_NOT_PENDING` | 409 | cancel or reject on an order that has moved on |
| `PackNotAvailableError` | `PACK_NOT_AVAILABLE` | 409 | pack missing, inactive, or unpriced |
| `GrantNoteRequiredError` | `GRANT_NOTE_REQUIRED` | 400 | an owner grant with a blank note |
| `OrderRateLimitedError` | `RATE_LIMITED` | 429 | over `ORDERS_PER_DAY_LIMIT` |
| `LedgerInvariantError` | `LEDGER_INVARIANT` | **500, `InfraError`** | a debit or release with nothing reserved |

The last one matters. A seller can cause a 402; only a bug can cause a debit against an empty reservation, so it must page us, not apologise to the seller.

- [x] **Step 1: Write both files.** No implementation, no `pg` import except the `Executor` type from `common/`.
- [x] **Step 2: `pnpm lint`** — expected silent. A port importing `common/` is allowed; a port importing a service is not.

---

### Task 4: Accounts, balance, and the five ledger primitives

The heart of the phase. Every method here changes `credit_accounts` and writes `credit_ledger` in one statement pair, inside one transaction, or does neither.

**Files:**
- Create: `src/credits/accounts.service.ts`, `src/credits/accounts.service.spec.ts`

**Interfaces:**
- Produces: `AccountsService implements CreditLedgerPort` with `getBalance`, `ensureAccount`, `reserveOne`, `debit`, `release`, `credit` (the shared `purchase`/`owner_grant` path, called by Task 8).

- [x] **Step 1: Lazy account creation, and why it is not a trigger**

A `credit_accounts` row is created on first use, not at sign-in:

```sql
INSERT INTO credit_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING
```

R-7 is the reason. `auth` owns `users` and must not write a credits table; `credits` must not write `users`. A trigger would hide a money write in the schema where no test looks for it. So `credits` creates its own row when it first needs one, and `getBalance` answers `{ available: 0, reserved: 0 }` for a user who has no row yet — which is also exactly what D-010 requires: **a new account starts at zero, with no grant anywhere.**

- [x] **Step 2: The primitives**

```ts
// the shape of each; all five follow it
async reserveOne(userId: string, generationId: string | null, tx: Executor = this.pool) {
  const { rows } = await tx.query<BalanceRow>(
    `UPDATE credit_accounts
        SET available = available - 1, reserved = reserved + 1, updated_at = now()
      WHERE user_id = $1 AND available >= 1
      RETURNING available, reserved`,
    [userId],
  );
  // No row means no credit. Not an error in the database's eyes — a business answer.
  if (rows.length === 0) throw new NoCreditsError();

  await tx.query(
    `INSERT INTO credit_ledger (user_id, type, amount, generation_id) VALUES ($1,'reserve',1,$2)`,
    [userId, generationId],
  );
  return { available: rows[0].available, reserved: rows[0].reserved };
}
```

The guard is `WHERE available >= 1` **in the UPDATE**, not a `SELECT` followed by an `UPDATE`. That single statement is what makes two concurrent reserves safe without a lock the application has to remember to take (R-3). Task 5 proves it.

| method | UPDATE | guard fails ⇒ | ledger row |
|---|---|---|---|
| `reserveOne` | `available−1, reserved+1` | `NoCreditsError` (402) | `reserve`, 1 |
| `debit` | `reserved−1` | `LedgerInvariantError` (500) | `debit`, 1 |
| `release` | `reserved−1, available+1` | `LedgerInvariantError` (500) | `release`, 1 |
| `credit` | `available+n` via the upsert | — | `purchase` or `owner_grant`, n |

**Each of the five must run inside a transaction.** When a caller passes `tx`, it is already in one and the method must not open another. When no `tx` is passed, the method wraps itself with `withTransaction`. Implement that as one private helper so the rule lives in a single place:

```ts
private run<T>(tx: Executor | undefined, fn: (ex: Executor) => Promise<T>): Promise<T> {
  return tx ? fn(tx) : withTransaction(this.pool, fn);
}
```

- [x] **Step 3: Tests, against a real Postgres (R-4)**

`accounts.service.spec.ts` — a seeded user per test, `truncateAll()` between:

1. `getBalance` of a user with no row → `{ available: 0, reserved: 0 }`, **and no row is created by a read**
2. `credit(+5, 'owner_grant', note)` → `{ 5, 0 }`, one ledger row, `amount = 5`
3. `owner_grant` with `note: '  '` → `GrantNoteRequiredError`, and **no ledger row and no balance change** (check both: this is the rollback test)
4. `reserveOne` on 1 credit → `{ 0, 1 }`, ledger `reserve`
5. `reserveOne` on 0 credits → `NoCreditsError`, balance untouched, **no ledger row** (a refused reserve must leave no trace)
6. `debit` after a reserve → `{ 0, 0 }`, ledger `debit`
7. `release` after a reserve → `{ 1, 0 }`, ledger `release` (D-020: this is the whole of "auto-refund")
8. `debit` with nothing reserved → `LedgerInvariantError`, and it is an `InfraError` (assert `error.status === 500`)
9. after 2–7, `assertLedgerMatchesAccounts()` holds

Run: `pnpm vitest run src/credits/accounts.service.spec.ts` — expected 9 passed, pasted.

- [x] **Step 4: The invariant helper**

`src/common/testing/ledger.ts`:

```sql
SELECT a.user_id, a.available, a.reserved, s.led_available, s.led_reserved
  FROM credit_accounts a
  JOIN (
    SELECT user_id,
           COALESCE(SUM(CASE type WHEN 'purchase' THEN amount WHEN 'owner_grant' THEN amount
                                  WHEN 'release'  THEN amount WHEN 'reserve'     THEN -amount
                                  ELSE 0 END), 0) AS led_available,
           COALESCE(SUM(CASE type WHEN 'reserve'  THEN amount WHEN 'release'     THEN -amount
                                  WHEN 'debit'    THEN -amount
                                  ELSE 0 END), 0) AS led_reserved
      FROM credit_ledger GROUP BY user_id
  ) s ON s.user_id = a.user_id
 WHERE a.available <> s.led_available OR a.reserved <> s.led_reserved
```

`assertLedgerMatchesAccounts(pool)` throws with the offending rows if this returns anything. It lives in `common/testing/` so the exit gate (Task 13) can use it too. **It must return zero rows at the end of every money test in this phase.**

---

### Task 5: The races, against a real Postgres

Doston's decision put this in P3 on purpose. These four tests are the reason R-4 exists, and none of them can be written with a mock.

**Files:**
- Create: `src/credits/accounts.race.spec.ts`

- [x] **Step 1: One credit, two concurrent reserves**

Seed `available = 1`. Fire both without awaiting in between:

```ts
const results = await Promise.allSettled([
  service.reserveOne(userId, 'gen-a'),
  service.reserveOne(userId, 'gen-b'),
]);
```

Assert: exactly one `fulfilled`, exactly one `rejected` with `NoCreditsError`; final balance `{ available: 0, reserved: 1 }`; **exactly one** `reserve` ledger row; the invariant holds. This is Addendum A §A8's "with one credit, two concurrent jobs cannot both succeed", at the level where it is actually decided.

- [x] **Step 2: Ten concurrent reserves against three credits**

Assert exactly 3 fulfilled, 7 `NoCreditsError`, `{ 0, 3 }`, three ledger rows. The single-pair case can pass by luck of scheduling; ten cannot.

- [x] **Step 3: A grant racing a reserve**

`available = 0`. Fire `credit(+1, 'owner_grant')` and `reserveOne` together. Either order is legitimate — the reserve wins and ends `{0,1}`, or it loses with a 402 and the balance ends `{1,0}`. Assert the *invariant* rather than one outcome: whatever happened, the ledger and the account agree, and the balance is never negative. A test that demanded one ordering here would be testing the scheduler.

- [x] **Step 4: Interleaved storm**

50 random operations (grant, reserve, debit, release) across 5 users, all fired concurrently, every rejection swallowed. Then assert once: `assertLedgerMatchesAccounts()` returns nothing, and no account is negative. This is the "balance always matches the ledger" exit check from `docs/PLAN.md`, and it is the test most likely to find something the other three miss.

Run: `pnpm vitest run src/credits/accounts.race.spec.ts`
Expected: 4 passed. Paste it. **If any of these is flaky, stop — do not retry it into passing.** A flaky money race is a real finding and gets a `DECISIONS.md` entry, not a rerun.

---

### Task 6: `site_settings` — telling a seller where to send money

Added to this phase on Doston's instruction. Without it an order is a dead end: the seller says "I want 5 credits" and the app has nowhere to point them. One table, two keys, one public endpoint.

**Files:**
- Create: `src/settings/db/schema.ts`, `src/settings/public/settings.port.ts`, `src/settings/settings.service.ts`, `src/settings/settings.controller.ts`, `src/settings/settings.module.ts`, `src/settings/settings.service.spec.ts`
- Modify: `src/app.module.ts`
- Generates: a migration (fold into Task 2's if Task 2 has not been committed yet; otherwise its own)

**Interfaces:**
- Produces: `SETTINGS_READER` (`getPaymentInstructions()`, `isPaymentConfigured()`), `SETTINGS_ADMIN` (`setKey(key, value, tx?)`).

- [x] **Step 1: The table**

```ts
// src/settings/db/schema.ts
export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
});
```

A key–value table, not a column per setting, because D-023 and D-008 both say these change without a deploy. The trade is that the *shape* of each value has to be validated in code — Step 2.

- [x] **Step 2: Two keys, each with a zod schema**

```ts
// src/settings/public/settings.port.ts
/** D-008, Addendum A §A4 step 2. Shown to a signed-in seller placing an order. */
export const paymentInstructionsSchema = z.object({
  cardNumber: z.string().trim().min(8).max(32).nullable().default(null),
  cardHolder: z.string().trim().min(2).max(120).nullable().default(null),
  /** https only: this URL is rendered for sellers, so http would be a downgrade we chose. */
  paymeUrl: z.string().url().startsWith('https://').max(500).nullable().default(null),
  clickUrl: z.string().url().startsWith('https://').max(500).nullable().default(null),
  /** Free-text Uzbek instructions, e.g. what to write in the transfer comment. */
  instructionsUz: z.string().trim().max(1000).nullable().default(null),
});

/** D-023: all three, editable without a deploy. */
export const supportContactsSchema = z.object({
  telegramUser: z.string().trim().max(64).nullable().default(null),
  telegramBot: z.string().trim().max(64).nullable().default(null),
  email: z.string().email().max(200).nullable().default(null),
});

export const SETTINGS_KEYS = {
  payment_instructions: paymentInstructionsSchema,
  support_contacts: supportContactsSchema,
} as const;
```

`SETTINGS_KEYS` is the whitelist. An owner `PATCH` to a key that is not in it is a 404, so the table can never grow a key nothing validates.

- [x] **Step 3: Seed both keys empty — never with an invented card number**

The migration seeds `payment_instructions` and `support_contacts` with every field `null`. Same rule as the pack prices (D-072): the structure ships, the content is the owner's. **Do not put Doston's or Jakhongir's real card number in a migration** — it is committed to git and this repo will have a remote.

For `support_contacts`, D-023 already records the real values (`@dostonsulaymon_wk`, `@apl_league_standings_bot`, `dostonqosimiy19@gmail.com`). Those are published support addresses, not secrets, so seeding *them* is fine and saves the owner a step. The card number is the one that stays empty.

- [x] **Step 4: `isPaymentConfigured()` and the order gate**

```ts
/** True when a seller could actually pay: at least one of card, Payme or Click is set. */
isPaymentConfigured(): boolean  // cardNumber || paymeUrl || clickUrl
```

`POST /orders` (Task 8) calls it and throws `PaymentNotConfiguredError` (`PAYMENT_NOT_CONFIGURED`, 409) when it is false. **Why refuse rather than accept:** an order the seller cannot act on produces a pending row the owner will never be able to confirm, and a seller who believes they have bought something. Better to refuse the button than to bank a dead order.

This makes `credits` depend on the `settings` port. Allowed by R-7 (a module may import any module's port); `SettingsModule` is `@Global()` so the DI token resolves without a cross-module file import, exactly as `ProjectsModule` does for `assets`.

- [x] **Step 5: `GET /api/settings/public`**

Public, no session — spec §3: "the gallery, the packs list and public settings work signed out." Returns both keys as validated objects. There is nothing secret here: a card number a seller is meant to pay into is published by definition. **Nothing else is ever added to this endpoint without asking** — it is the one route in the app that returns configuration to an anonymous caller.

- [x] **Step 6: Tests**

1. reading a key that was never written → schema defaults, all `null`, and no row is created
2. `setKey('payment_instructions', {cardNumber: '8600...'})` → stored, read back, `updatedBy` recorded
3. `setKey` with a bad shape (`paymeUrl: 'http://x'`) → rejected, nothing written
4. `setKey('nonsense_key', {})` → 404, nothing written
5. `isPaymentConfigured()` → false when all three are null, true with only `paymeUrl` set
6. `GET /settings/public` with no cookie → 200 (this is the signed-out assertion)

Run: `pnpm vitest run src/settings/settings.service.spec.ts` — expected 6 passed, pasted.

---

### Task 7: Packs — the seed, the public list, and the activation rule (D-072)

**Files:**
- Create: `src/credits/packs.service.ts`, `src/credits/packs.service.spec.ts`
- Modify: the Task 2 migration (or a new one) to seed three rows

**Interfaces:**
- Produces: `listSellable(): Promise<CreditPack[]>`, `setPack(packId, { priceUzs?, isActive?, sortOrder? }, tx?)`.

- [x] **Step 1: Seed three packs, priced, inactive**

D-009 fixes the packs at 1 / 5 / 15 credits. Doston asked for prices that are editable rather than null. The seed:

| id | credits | price_uzs | is_active |
|---|---|---|---|
| `pack_1` | 1 | 9000 | **false** |
| `pack_5` | 5 | 40000 | **false** |
| `pack_15` | 15 | 105000 | **false** |

**Those three numbers are placeholders chosen by Claude, not prices Jakhongir has agreed.** They exist so the flow is walkable and so the owner edits a number instead of inventing a record. They are held away from sellers by two independent rules:

- `is_active = false`, and `GET /packs` returns only `is_active = true AND price_uzs IS NOT NULL` — so today the list is empty, which is what Addendum A §A8 requires.
- **Activation must re-state the price.** `setPack` rejects `{ isActive: true }` unless the same request also carries a `priceUzs`. An owner cannot switch a pack on without typing what it costs, so a placeholder cannot go live by a single careless toggle.

Write the seed as `INSERT … ON CONFLICT (id) DO NOTHING` so re-running migrations never overwrites a price the owner has since set.

- [x] **Step 2: `listSellable`**

```sql
SELECT id, credits, price_uzs, sort_order FROM credit_packs
 WHERE is_active AND price_uzs IS NOT NULL ORDER BY sort_order, credits
```

The `price_uzs IS NOT NULL` is redundant against the `credit_packs_active_needs_price` CHECK. Keep it: the query should still be correct if someone later relaxes the constraint.

- [x] **Step 3: Tests**

1. the seeded packs exist, all three, all inactive → `listSellable()` returns `[]`
2. `setPack('pack_1', { isActive: true })` with no price → rejected; the pack stays inactive *(the D-072 guard)*
3. `setPack('pack_1', { priceUzs: 12000, isActive: true })` → appears in `listSellable()` with 12000
4. `setPack` on an unknown id → `PackNotAvailableError`
5. `setPack('pack_1', { priceUzs: 0 })` → rejected by the CHECK
6. re-running the seed does not overwrite an owner-set price

Run: `pnpm vitest run src/credits/packs.service.spec.ts` — expected 6 passed, pasted.

---

### Task 8: Orders — create, list, cancel

**Files:**
- Create: `src/credits/orders.service.ts`, `src/credits/orders.service.spec.ts`

**Interfaces:**
- Produces: `create(userId, input)`, `listFor(userId)`, `cancel(userId, orderId)`.

- [x] **Step 1: Create**

In one transaction:

1. `SELECT` the pack; not sellable ⇒ `PackNotAvailableError` (409)
2. `settingsReader.isPaymentConfigured()` false ⇒ `PaymentNotConfiguredError` (409) *(Task 6 Step 4)*
3. the per-day cap: `SELECT count(*) FROM credit_orders WHERE user_id = $1 AND created_at >= now() - interval '1 day'`; at or over `ORDERS_PER_DAY_LIMIT` ⇒ `OrderRateLimitedError` (429)
4. `INSERT` with `status = 'pending'`, **`credits` and `amount_uzs` copied from the pack row**

Step 4 is the one to get right. The order snapshots the price. If Jakhongir raises the price of `pack_5` tomorrow, an order placed today is still owed 5 credits at the price the seller was shown. Never join to `credit_packs` to answer "what does this order cost".

`paymentMethod` comes from the client and is validated against the four allowed values by zod *and* by the CHECK. `payerReference` is optional, trimmed, ≤ 120 chars — it is free text from a seller, so it is bounded in the schema and never interpolated into anything.

- [x] **Step 2: List and cancel**

`listFor(userId)` — this user's orders, newest first. **Never all orders.** Same pattern as P2's projects: the `user_id` is in the `WHERE`, not checked afterwards.

`cancel(userId, orderId)`:

```sql
UPDATE credit_orders SET status = 'cancelled'
 WHERE id = $1 AND user_id = $2 AND status = 'pending'
RETURNING ...
```

0 rows ⇒ look the order up by id and user: missing or someone else's ⇒ `OrderNotFoundError` (404); found but not pending ⇒ `OrderNotPendingError` (409). **A cancel writes no ledger row** — a pending order never credited anything, so there is nothing to reverse.

- [x] **Step 3: Tests**

1. create against a sellable pack → `pending`, credits and amount copied from the pack
2. create against an inactive pack → `PackNotAvailableError`
3. create with payment instructions unset → `PaymentNotConfiguredError`, **no row inserted**
4. the price changes after the order → the order still reports the old `amountUzs`
5. `ORDERS_PER_DAY_LIMIT + 1` creates → the last is `RATE_LIMITED`
6. `listFor` returns only this user's orders — seed Bob an order and assert Alice cannot see it
7. cancel own pending → `cancelled`, and **no ledger row exists**
8. cancel someone else's → `OrderNotFoundError` (404, never 403 — a 403 confirms the id exists)
9. cancel an already-`paid` order → `OrderNotPendingError`, and the order is still `paid`

Run: `pnpm vitest run src/credits/orders.service.spec.ts` — expected 9 passed, pasted.

---

### Task 9: Confirm and reject — the idempotency that A8 demands

**Files:**
- Modify: `src/credits/orders.service.ts`
- Create: `src/credits/orders.confirm.spec.ts`

**Interfaces:**
- Produces: `confirmOrder(orderId, ownerId, tx?): Promise<ConfirmResult>`, `rejectOrder(orderId, ownerId, reason, tx?)`.

- [x] **Step 1: Confirm, in one transaction**

```
SELECT ... FROM credit_orders WHERE id = $1 FOR UPDATE
  not found            → OrderNotFoundError (404)
  status = 'paid'      → return { alreadyPaid: true, credited: 0 }   ← no second ledger row
  status ≠ 'pending'   → OrderNotPendingError (409)   (rejected or cancelled)

UPDATE credit_orders SET status='paid', confirmed_at=now(), confirmed_by=$owner
 WHERE id=$1 AND status='pending'
INSERT INTO credit_accounts (user_id, available) VALUES ($u, $credits)
     ON CONFLICT (user_id) DO UPDATE SET available = credit_accounts.available + $credits,
                                         updated_at = now()
INSERT INTO credit_ledger (user_id, type, amount, order_id) VALUES ($u, 'purchase', $credits, $1)
```

**Two independent guards, on purpose.** `FOR UPDATE` serialises two confirms of the same order, so the second one sees `paid` and returns `alreadyPaid`. If that ever fails — a different code path, a replica, a future merchant callback — the partial unique index raises `23505` on the ledger insert and the whole transaction rolls back. So:

```ts
catch (error) {
  // The unique index on (order_id) WHERE type='purchase' fired: another transaction
  // credited this order first. Its work stands; ours rolled back entirely. That is the
  // correct outcome, not an error to report.
  if (isUniqueViolation(error)) return this.readAsAlreadyPaid(orderId, tx);
  throw error;
}
```

Addendum A §A8 says "confirming it twice changes nothing". This is the only construction where that is true even under a race, and it is why `isUniqueViolation` was built in Task 1.

- [x] **Step 2: Reject**

`pending → rejected` with a required reason (the CHECK enforces it too), `confirmed_by` recording who rejected it. **No ledger row**: a rejected order never credited. The reason is shown to the seller (Addendum A §A4 rule 7), so it is bounded and trimmed like any text that reaches a person.

- [x] **Step 3: Grants**

`grant(userId, credits, note, tx?)` → `AccountsService.credit(userId, credits, 'owner_grant', note)`. The note is required by the CHECK **and** validated before the statement so the seller-facing error is `GRANT_NOTE_REQUIRED` rather than a raw constraint violation. This is D-020's goodwill path and D-010's pilot-credit path — the same method serves both.

- [x] **Step 4: Tests — the ones A8 names**

1. confirm a pending order → `paid`, `available` rises by exactly the pack's credits, one `purchase` ledger row, `confirmed_by` set
2. **confirm the same order twice, sequentially** → second returns `alreadyPaid: true`, `credited: 0`; balance unchanged; still exactly one ledger row
3. **confirm the same order twice, concurrently** (`Promise.allSettled`) → exactly one credit applied, exactly one ledger row, no unhandled rejection
4. confirm a cancelled order → `OrderNotPendingError`, no credit
5. reject a pending order → `rejected`, reason stored, balance unchanged, **no ledger row**
6. reject an already-paid order → `OrderNotPendingError`, and the credit stays
7. grant with a note → `available` rises, ledger `owner_grant` with the note
8. grant with a blank note → `GrantNoteRequiredError`, nothing written
9. `assertLedgerMatchesAccounts()` after all of the above

Run: `pnpm vitest run src/credits/orders.confirm.spec.ts` — expected 9 passed, pasted.

---

### Task 10: `owner_audit_log`, the owner guard, and the audit port

**Files:**
- Create: `src/owner/db/schema.ts`, `src/owner/public/audit.port.ts`, `src/owner/owner.guard.ts`, `src/owner/audit.service.ts`, `src/owner/owner.module.ts`, `src/owner/owner.guard.spec.ts`
- Generates: a migration for `owner_audit_log`

- [x] **Step 1: The table**

```ts
export const ownerAuditLog = pgTable('owner_audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),          // 'order.confirm', 'order.reject', 'credits.grant', …
  targetType: text('target_type').notNull(), // 'credit_order' | 'user' | 'credit_pack' | 'site_setting'
  targetId: text('target_id').notNull(),
  details: jsonb('details').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('owner_audit_log_created_idx').on(table.createdAt)]);
```

`onDelete: 'restrict'` on `owner_id`: an audit trail that can be erased by deleting a user is not an audit trail. There is no update or delete path in the code — append only (D-037).

- [x] **Step 2: The guard, and why it answers 404**

```ts
// role !== 'owner' → NotFoundException-equivalent DomainError, status 404
```

Not 403. A 403 on `/api/owner/orders` tells a signed-in seller that the route exists and that someone can use it. P2 settled this for project ids and the same reasoning applies to a whole route tree: the refusal must not be an inventory. `OwnerGuard` runs after `SessionGuard`, reads `CurrentUser` from the auth port, and is the only thing standing between a seller and the money endpoints — so its test is not optional.

- [x] **Step 3: The audit port — the design that avoids a module cycle**

`owner` must write its audit row **in the same transaction** as the money move, or a crash between them leaves a credit with no record of who caused it. The naive version has `credits` write the audit row, which breaks R-7 (a module writing another module's table), and injecting the writer into `credits` makes the two modules mutually dependent.

The construction that avoids both: **the `owner` module owns the transaction and passes it down.**

```ts
// src/owner/owner.controller.ts
await withTransaction(this.pool, async (tx) => {
  const result = await this.creditAdmin.confirmOrder(orderId, owner.id, tx);
  await this.audit.record(owner.id, 'order.confirm', 'credit_order', orderId, {
    credited: result.credited, alreadyPaid: result.alreadyPaid,
  }, tx);
  return result;
});
```

One transaction, no cycle, no callback indirection — and it is the first real use of the `Executor` parameter from Task 1, which is the same mechanism P4 will use. `credits` never learns that an audit log exists.

- [x] **Step 4: Tests**

1. a seller hitting any `/owner/*` route → 404, and the response body's code is not `FORBIDDEN`
2. an anonymous caller → 401 `SESSION_EXPIRED` (the session guard fires first)
3. an owner → through
4. `audit.record` inside a rolled-back transaction leaves **no** audit row (proves it really is enlisted)

---

### Task 11: The owner endpoints

**Files:**
- Create: `src/owner/owner.controller.ts`, `src/owner/owner.dto.ts`
- Modify: `src/owner/owner.module.ts`, `src/app.module.ts`

| route | body | audit action |
|---|---|---|
| `GET /api/owner/orders?status=pending` | — | *(a read; not audited)* |
| `POST /api/owner/orders/:id/confirm` | — | `order.confirm` |
| `POST /api/owner/orders/:id/reject` | `{ reason }` | `order.reject` |
| `POST /api/owner/grants` | `{ userId, credits, note }` | `credits.grant` |
| `PATCH /api/owner/packs/:id` | `{ priceUzs?, isActive?, sortOrder? }` | `pack.update` |
| `PATCH /api/owner/settings/:key` | the key's schema | `setting.update` |
| `GET /api/owner/users?limit=&cursor=` | — | *(a read; not audited)* |

- [x] **Step 1: Every write in one `withTransaction`, with its audit row** (Task 10 Step 3).
- [x] **Step 2: Reads are not audited.** D-037 says "every owner action"; a `GET` is not an action and logging every list would bury the six rows that matter. Written down so it reads as a decision rather than an omission.
- [x] **Step 3: `GET /owner/users` returns id, email, role, created_at and the balance — never a session token, never a project or a photo.** It is a support view, not an export.
- [x] **Step 4: DTOs.** Each body gets a `createZodDto` class in `owner.dto.ts` so the contract carries the shapes (T-09, D-031). **Per-module DTO files, never a shared root-level one** — a root file sits at the entrypoint layer and R-7's lint rejects a module importing it. That was learned the hard way in T-09; do not rediscover it.
- [x] **Step 5: Tests** — one per route: the happy path, the seller's 404, and for confirm the double-call.

---

### Task 12: The seller endpoints and the contract

**Files:**
- Create: `src/credits/credits.controller.ts`, `src/credits/credits.dto.ts`, `src/settings/settings.controller.ts`
- Modify: `src/credits/credits.module.ts`

| route | session | notes |
|---|---|---|
| `GET /api/packs` | **no** | spec §3: the pack list works signed out |
| `GET /api/settings/public` | **no** | Task 6 Step 5 |
| `GET /api/credits/balance` | yes | `{ available, reserved }` |
| `POST /api/orders` | yes + CSRF | `{ packId, paymentMethod, payerReference? }` |
| `GET /api/orders` | yes | this user's only |
| `POST /api/orders/:id/cancel` | yes + CSRF | own pending only |

- [x] **Step 1: Wire the routes.** Every state-changing route carries `CsrfGuard` as well as `SessionGuard` — the existing guards, unchanged.
- [x] **Step 2: `createZodDto` for every body and response** (T-09). `GET /credits/balance` must not return a bare number; the object is what the generated client needs.
- [x] **Step 3: Regenerate the contract.** `pnpm openapi:generate && pnpm openapi:check`. Confirm the new routes appear **with** request bodies and response schemas, and that `components.schemas` has grown. A route added without a shape re-opens T-09.
- [x] **Step 4: `git diff openapi.json`** and read it. It is the file the web repo generates its client from (D-031), so an unexpected diff here is an unexpected change to `jas-ad-studio-web`'s world.

---

### Task 13: The P3 exit gate — one suite that proves the money rules

P2's exit criterion was `src/isolation.e2e.spec.ts`, and running it over real HTTP is what found four defects that 370 unit tests had missed. P3 gets the same treatment: **one suite, the real app on a real socket, real cookies**, asserting the things `docs/PLAN.md` and Addendum A §A8 actually name.

**Files:**
- Create: `src/money.e2e.spec.ts`

- [x] **Step 1: The exit checks from `docs/PLAN.md`**

1. **double confirm credits once** — over HTTP, twice, and the balance rises once
2. **a user cannot confirm their own order** — Alice `POST`s to `/api/owner/orders/:her-own-id/confirm` → 404, and her balance is unchanged
3. **balance always matches the ledger** — after the whole suite, `assertLedgerMatchesAccounts()` returns nothing

- [x] **Step 2: Addendum A §A8, the parts that are P3's**

4. **a new account starts at 0** — sign Alice in, `GET /api/credits/balance` → `{0,0}`, and `credit_ledger` has no row for her. *(The strongest form of "no starter grant exists anywhere".)*
5. **no price is displayed until the owner configures packs** — `GET /api/packs` on a fresh database → `[]`
6. **a user cannot fake their own ledger entry** — there is no route that accepts one; assert `POST /api/credits/balance`, `POST /api/ledger` and `PATCH /api/orders/:id` are all 404/405. A test that the door is missing, not merely locked.
7. **a user cannot edit their own order's status** — Alice `PATCH`es her pending order → no such route; and cancelling is the only transition she has

- [x] **Step 3: Isolation, the P2 discipline applied to money**

8. Alice cannot see Bob's orders in `GET /api/orders`
9. Alice cannot cancel Bob's order → 404
10. Alice cannot read Bob's balance — there is no route that takes a user id
11. every `/api/owner/*` route as a seller → 404; as an anonymous caller → 401

- [x] **Step 4: The zero-balance rule that P4 will inherit**

12. `reserveOne` on a zero balance → 402 `NO_CREDITS`, no ledger row (Addendum A §A5: "do not make paid model calls for users with a zero balance" — P3 proves the gate; P4 wires it to the AI call)

Run: `pnpm vitest run src/money.e2e.spec.ts`
Expected: 12 passed. Paste it in full.

- [x] **Step 5: Walk it by hand against the running server, as P2 did**

Unit tests could not see any of P2's four defects. Start the server, and with real cookies: sign in, `GET /packs` (empty), activate `pack_1` with a price as the owner, `GET /packs` (one pack), set payment instructions, place an order, see it pending, confirm it as the owner, watch the balance rise, confirm again, watch it not rise. Paste the real responses into `docs/PROGRESS.md`. **Anything this finds that the suite did not becomes a `DECISIONS.md` entry, like D-066 to D-069.**

---

### Task 14: Close the phase

- [x] **Step 1: The full gate.** `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check`. Paste all five outputs. No claim of a pass without its output.
- [x] **Step 2: `DECISIONS.md`** — D-072 (placeholder pack prices and the activation rule), D-073 (the new error codes), D-074 (the ledger sign convention and the invariant), D-075 (`site_settings` moved into P3), plus an entry for anything the hand-walk found.
- [x] **Step 3: `docs/PROGRESS.md`** — the Resume block, the real output from Task 13 Step 5, and what P4 inherits: the `Executor` parameter, the proven primitives, and the `generation_id` foreign key it must add.
- [x] **Step 4: `docs/PLAN.md`** — move `⬅ next` from P3 to P4.
- [x] **Step 5: Commit on `p3-credits-orders`, then stop for Doston's review.** Do not merge to `main` and do not start P4 (D-070).

---

## Self-review against the spec and the sources

| requirement | where it is met |
|---|---|
| A8: new accounts start with 0 credits, no starter grant anywhere | Task 4 Step 1 (lazy account, zeros), Task 13 check 4 |
| A8: confirming an order twice changes nothing | Task 9 Steps 1, 4.2, 4.3; Task 13 check 1 |
| A8: a user cannot confirm, edit or fake their own order or ledger entry | Task 10 Step 2, Task 13 checks 2, 6, 7 |
| A8: no price displayed until the owner configures packs | Task 7 Step 1 (D-072), Task 13 check 5 |
| A8: with one credit, two concurrent jobs cannot both succeed | Task 5 Steps 1–2 (the primitive); the job-level form is P4's exit check |
| A3: credits come only from `purchase` and `owner_grant` | Task 2's `credit_ledger_type_check`; no other code path calls `credit` |
| A3: an owner grant needs a note | Task 2's `credit_ledger_grant_needs_note` + Task 9 Step 3 |
| A4: payment instructions shown to the seller | **Task 6** (added on Doston's instruction) |
| A4: only the owner can confirm or reject | Task 10 Step 2 (`OwnerGuard`) |
| A4: clients never set order status or write ledger rows | Task 12's route list — no route exists; Task 13 check 6 |
| A4: `UNIQUE (usage_ledger.credit_order_id)` guarantees one credit per order | Task 2's partial unique index, on `credit_ledger` (R-3's name, which wins) |
| D-009: three packs, prices set by the owner | Task 7 |
| D-020: failed and refused jobs release the credit | Task 4's `release` primitive; P4 calls it |
| D-037: owner endpoints in P3, every action audited | Tasks 10–11 |
| R-3: balance is a row with a CHECK; reserve is one atomic UPDATE | Task 2, Task 4 Step 2 |
| R-4: money logic tested against a real Postgres | Tasks 2, 4, 5, 7, 8, 9 all use `createTestDatabase()` |
| R-7: modules talk only through ports | Task 3, Task 10 Step 3; `pnpm lint` is the check |
| spec §6: `confirmCreditOrder` in one transaction | Task 9 Step 1 |
| spec §10: orders get a per-day cap | Task 1 Step 2, Task 8 Step 1.3 |

**Naming conflict, resolved:** Addendum A §A4 calls the table `usage_ledger` and its column `credit_order_id`. R-3 (approved as D-038) calls them `credit_ledger` and `order_id`. `DECISIONS.md` outranks the sources (CLAUDE.md precedence), so **`credit_ledger` wins** — recorded here so it is not re-litigated when someone reads §A4.

**Out of scope, and staying out:** generation jobs, leases, the sweeper, the AI spend cap, the needs-input cache (all P4); the owner panel's screens (P5); automatic Payme or Click checkout (D-008); promo codes and credit expiry (D-010, A3 — "credits do not expire in the MVP").

---

## What changed while building it

Two deviations from the plan as written, both recorded as decisions:

1. **`PATCH /owner/settings/:key` became two routes** — `settings/payment-instructions` and `settings/support-contacts`. `createZodDto` cannot wrap a `z.union` (it needs statically known members), so a single `:key` route could not carry a documented body, which is the T-09 defect all over again. Two named bodies also type better in a generated client.
2. **`packEditSchema.priceUzs` is not nullable.** The plan allowed `null`, but the `COALESCE` update cannot tell "clear the price" from "field absent", so the schema was offering a promise the service did not keep. An owner raises or lowers a price, or deactivates the pack.

And one defect the hand-walk found that no test could: **an idempotent POST was answering 201** (D-076).

R-7 rejected two imports during the build, both correctly, and both were fixed by depending on a port rather than by touching the lint config:

- `credits/testing/harness.ts` importing `SettingsService` — the `.spec.ts` exemption does not cover a test *helper*. The harness now takes the settings implementation as a `SettingsReader & SettingsAdmin` parameter, and each spec (which is exempt) supplies the real service.
- `owner/owner.controller.ts` importing `settings/settings.dto.ts`. The two DTOs are now declared in `owner.dto.ts` from the settings port's own schemas, so no shape is defined twice.
