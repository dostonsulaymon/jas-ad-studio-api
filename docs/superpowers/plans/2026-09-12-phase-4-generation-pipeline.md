# Phase 4 — Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A seller with a credit presses generate once and gets one ad package. Pressing it twice charges once. A failure gives the credit back. A success stays bought even if the browser dies, and a worker that wakes up late cannot hand out both the package and a refund.

**Architecture:** One new module, `generation`, owning `generations`, `packages` and `needs_input_cache`. It is the first consumer of P3's `CREDIT_LEDGER` port and of P1's `generateAdPackage`, and the first thing in the repo to run work in the `worker` process. The money-critical path is spec §6, unchanged: reserve in one transaction, call the provider **outside** any transaction, settle in a second transaction that only commits if the worker still holds the lease.

**Tech Stack:** NestJS 11, Drizzle + Postgres, BullMQ 6 (**already a dependency**), zod 4, vitest 3. **No new dependency, runtime or dev.**

**Spec:** `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` §3, §4, **§6 (the money-critical path)**, §9, §10, §11
**Sources:** source 01 **§29 (needs-input), §32 (transactional allowance), §33 (rate limits)**, §47; Addendum A **§A5, §A8**
**Decisions:** D-020, D-030, D-045, D-052, D-058, D-064, **D-073 to D-077**

---

## What Doston decided before this plan was written (2026-09-12)

1. **Real AI calls in dev, a fake provider in the suite.** The worker uses the real `OPENAI_API_KEY` with `DAILY_AI_SPEND_LIMIT_USD` defaulted low. **Every automated test uses a fake provider** — spec §11 forbids live AI calls in CI, and a recorded response cannot be made to time out on demand anyway. Only the hand-walk (Task 13 Step 5) spends real money, on one or two products.
2. **needs_input is free, but capped and cached.** Source 01 §29's cache, keyed on user + asset hashes + brief hash, so identical inputs return the cached questions with **no new AI call**, plus a configurable cap per project per day. A seller who genuinely iterates is fine; one who loops burns their own cap rather than Doston's money.
3. **The real BullMQ worker runs in-process in the tests, against the real dev Redis.** Leases, the sweeper and a stale worker's dropped result are exercised for real. This is the only way to test "a late success cannot race a refund", which is P4's hardest exit check — the R-4 argument applied to the queue.

## The debt P3 left, which Task 1 pays

**`credit_ledger.generation_id` has no foreign key.** `generations` did not exist in P3. Task 1's migration adds the constraint. If it is skipped, the ledger can reference generations that never existed and the audit trail quietly stops meaning anything.

---

## Global Constraints

- **R-7 module boundaries.** `generation` may import `common/`, its own files, its own `db/` schema, and any module's `public/` port. `pnpm lint` fails otherwise. It reads credits **only** through `CREDIT_LEDGER`, and assets **only** through the assets port.
- **The provider call never happens inside a transaction.** A model call takes seconds; a transaction holding a row lock for seconds is how a pool runs dry. Spec §6 step 4 is explicit and it is the single most important rule in this phase.
- **Money moves only through P3's primitives.** `reserveOne`, `debit`, `release` — this phase adds no new SQL against `credit_accounts` or `credit_ledger`. If a task seems to need some, stop and ask.
- **Every settle is guarded by the lease token.** `WHERE id = $g AND lease_token = $mine`. A stale worker updates 0 rows and its result is dropped: no double delivery, no double refund.
- **A success is never refunded because the client missed the response** (source 01 §32). The only thing that releases a credit is a `needs_input`, `refused` or `failed` outcome.
- **Duplicate clicks create neither a duplicate charge nor a second job** (§32). `UNIQUE (user_id, idempotency_key)` and a BullMQ `jobId` equal to the generation id.
- **No paid call on a zero balance** (Addendum A §A5), including one that might return `needs_input`. P3's `reserveOne` already refuses with 402; this phase must not find a way around it.
- **Every table change is a committed SQL migration** via `pnpm db:generate`. Never hand-edit generated SQL. Seed data goes in a `--custom` migration, as in P3.
- **Error shape is `{ code, messageKey, details?, requestId }`.** Codes come from spec §9: `AI_TIMEOUT`, `AI_REFUSED`, `AI_MALFORMED`, `AI_TRUNCATED`, `RATE_LIMITED`, `SPEND_CAP_REACHED`, `NO_CREDITS`.
- **Logs never contain images, full prompts or full briefs.** The redaction list in `src/common/logger/logger.module.ts` gets extended, never bypassed. A generation's *result* is the seller's product copy — it belongs in the database, not in a log line.
- **R-4: money and job logic is tested against a real Postgres and a real Redis.** Mock-only tests are not acceptable evidence here.
- **Node 24.** `nvm use` before any command.
- **Verification is by real output**, pasted.

---

## The state machine

```
                    POST /projects/:id/generations  (Idempotency-Key)
                                   │
            ┌──────────────────────┴───────────────────────┐
            │ TX 1: reserve                                │
            │  · same (user, key) exists → return that job │  no new charge
            │  · reserveOne()          → 402 if no credit  │
            │  · INSERT generations(queued)                │
            └──────────────────────┬───────────────────────┘
                          COMMIT, then enqueue (jobId = generation id)
                                   │
                                queued
                                   │ worker claims: status=running,
                                   │ lease_token=new, lease_until=now()+5m, attempts+1
                                running ──────────────────────┐
                                   │                          │ lease expires
                    provider call (OUTSIDE any TX)            │ sweeper
                    validate, repair at most once             │
                                   │                          ├─ attempts < 3 → queued
            ┌──────────────────────┴───────────────┐          └─ attempts ≥ 3 → failed + release
            │ TX 2: settle, only if lease_token matches       │
            │  ready       → INSERT packages · debit()        │
            │  needs_input → release() · cache the questions  │
            │  refused     → release()                        │
            │  failed      → release()                        │
            └──────────────────────┬───────────────┘
                     ready │ needs_input │ refused │ failed
                                   │
                    GET /generations/:id  (client polls; survives a reload)
```

**`attempts` is incremented at claim time, not at failure time.** A worker that dies mid-call never gets to write anything, so a counter bumped on the way out would stay at zero forever and the job would be retried without limit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/generation/db/schema.ts` | `generations`, `packages`, `needs_input_cache` |
| `drizzle/migrations/0007_*.sql` | those three tables **plus the `credit_ledger.generation_id` FK** |
| `src/generation/public/generation.port.ts` | `GenerationStatus`, `GenerationView`, `AdPackageView`, DI tokens |
| `src/generation/public/generation.errors.ts` | `GenerationNotFoundError`, `JobInFlightError`, `SpendCapReachedError`, `NeedsInputCapError` |
| `src/generation/generation.dto.ts` | `createZodDto` classes (D-031, T-09) |
| `src/generation/generations.repo.ts` | Every statement against `generations` / `packages`: claim, settle, sweep |
| `src/generation/generation.service.ts` | TX 1 (reserve + insert + enqueue), polling reads, rate limits |
| `src/generation/settle.service.ts` | TX 2, lease-guarded, calling P3's `debit` / `release` |
| `src/generation/needs-input.cache.ts` | Source 01 §29: hash the inputs, return cached questions, count attempts |
| `src/generation/spend.guard.ts` | Daily cap from the recorded `est_cost_usd` (spec §10) |
| `src/generation/generation.queue.ts` | BullMQ queue and job names; `jobId` = generation id |
| `src/generation/generation.worker.ts` | The processor: claim → build input → call → settle |
| `src/generation/generation.controller.ts` | `POST /projects/:id/generations`, `GET /generations/:id` |
| `src/generation/generation.module.ts` | Wiring; registered in `app.module.ts` **and** `worker.module.ts` |
| `src/generation/testing/fake-provider.ts` | An `AiProvider` that returns, refuses, times out or malforms on command |
| `src/assets/public/assets.port.ts` *(modify)* | **Add `MODEL_INPUT_READER`** — owned model-input bytes for a project |
| `src/common/config/env.schema.ts` *(modify)* | `DAILY_AI_SPEND_LIMIT_USD`, `GENERATIONS_PER_DAY_LIMIT`, `NEEDS_INPUT_PER_PROJECT_PER_DAY`, `JOB_LEASE_MINUTES`, `WORKER_CONCURRENCY` |
| `src/worker.module.ts` *(modify)* | Register `GenerationModule` so the worker process actually runs jobs |
| `src/generation.e2e.spec.ts` | **The P4 exit gate.** The four races, over real HTTP with a real worker |

---

## Standing gate — approvals carried by this plan

1. **Three new tables and one new foreign key** (Task 1). Schema change. Approved with this plan; anything not listed there needs a fresh ask.
2. **This phase spends money at the provider.** Every automated test uses the fake provider; only the Task 13 hand-walk calls OpenAI, with `DAILY_AI_SPEND_LIMIT_USD` low. Approved with this plan.
3. **It touches credits** — but only through P3's primitives, and it adds no new money SQL.
4. **`src/assets/public/assets.port.ts` gains a token.** A public contract change, and `jas-ad-studio-web` is a client of this API — but it is a server-side port, not an HTTP route, so no web contract moves.
5. **No dependency is added.** `bullmq@^6.3.4` is already in `package.json`.

---

### Task 1: The job tables, and the foreign key P3 owed

**Files:** Create `src/generation/db/schema.ts`; generates `drizzle/migrations/0007_*.sql`

- [x] **Step 1: `generations`**

```ts
export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** §32: the client's retry key. A duplicate click must find this row, not make another. */
  idempotencyKey: text('idempotency_key').notNull(),
  status: text('status').notNull().default('queued'),
  /** Bumped at CLAIM time: a worker that dies mid-call never writes, so a counter
   *  incremented on failure would stay at zero and retry for ever. */
  attempts: integer('attempts').notNull().default(0),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  targetId: text('target_id').notNull(),
  promptVersion: text('prompt_version'),
  provider: text('provider'),
  model: text('model'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  /** numeric, not float: this is summed for the daily spend cap (spec §10). */
  estCostUsd: numeric('est_cost_usd', { precision: 10, scale: 6 }),
  errorCode: text('error_code'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
}, (table) => [
  // §32: duplicate clicks and network retries reuse the same job.
  uniqueIndex('generations_user_key').on(table.userId, table.idempotencyKey),
  // Spec §10: at most one queued or running job per user. A partial unique index, so the
  // limit is the database's rule and not a count() a race can slip between.
  uniqueIndex('generations_one_active_per_user').on(table.userId)
    .where(sql`${table.status} IN ('queued','running')`),
  index('generations_sweep_idx').on(table.leaseUntil).where(sql`${table.status} = 'running'`),
  index('generations_spend_idx').on(table.createdAt),
  check('generations_status_check',
    sql`${table.status} IN ('queued','running','ready','needs_input','refused','failed')`),
  // A terminal job holds no lease; a running one must.
  check('generations_lease_pairing', sql`(${table.leaseToken} IS NULL) = (${table.leaseUntil} IS NULL)`),
  check('generations_finished_pairing',
    sql`(${table.status} IN ('ready','needs_input','refused','failed')) = (${table.finishedAt} IS NOT NULL)`),
]);
```

`generations_one_active_per_user` is the one to think about. Spec §10 wants "1 running per user"; a partial unique index makes that the database's rule, so two simultaneous `POST`s cannot both pass a `count()` check and both insert. The second gets a unique violation, which TX 1 turns into `JOB_IN_FLIGHT` (409).

- [x] **Step 2: `packages` and `needs_input_cache`**

```ts
export const packages = pgTable('packages', {
  /** One package per generation, and the pk says so. Written only with the debit. */
  generationId: uuid('generation_id').primaryKey()
    .references(() => generations.id, { onDelete: 'cascade' }),
  result: jsonb('result').notNull(),
  promptEn: text('prompt_en').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Source 01 §29: identical inputs return the same questions without a new paid call. */
export const needsInputCache = pgTable('needs_input_cache', {
  /** sha256 of user id + sorted asset sha256s + brief hash. Not guessable, not a join key. */
  inputHash: text('input_hash').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  questionsUz: jsonb('questions_uz').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [index('needs_input_project_idx').on(table.projectId, table.createdAt)]);
```

- [x] **Step 3: Pay P3's debt — the `credit_ledger.generation_id` foreign key**

In `src/credits/db/schema.ts`, `generationId` becomes `.references(() => generations.id, { onDelete: 'set null' })`.

**`set null`, not `restrict` or `cascade`.** A ledger row is a money record and must outlive the job it describes; but if a project is deleted and its generations cascade away, the ledger row must survive with its `generation_id` blanked rather than block the delete or vanish with it.

**This makes `credits/db/schema.ts` import `generation/db/schema.ts`.** Allowed: the boundary config has a distinct `schema` element type precisely so foreign keys can cross module lines (`{ from: 'schema', allow: ['common', 'schema'] }`). Confirm with `pnpm lint`, and if it complains, **stop and ask** rather than editing the rule.

- [x] **Step 4: `pnpm db:generate`, then read the SQL.** Confirm by eye: both partial unique indexes, the `ALTER TABLE credit_ledger ADD CONSTRAINT … generation_id`, and the two pairing CHECKs.

- [x] **Step 5: Constraint tests** (`src/generation/db/schema.spec.ts`), each naming the constraint that refuses it, as P3's do:

1. two `queued` rows for one user → `generations_one_active_per_user`
2. a `queued` **and** a `running` row for one user → same index (the partial predicate covers both)
3. a `queued` row for user A and one for user B → **allowed**
4. two rows with the same `(user_id, idempotency_key)` → `generations_user_key`
5. the same idempotency key for two *different* users → **allowed**
6. a `ready` row for a user who already has a `queued` one → **allowed** (the index must not count terminal jobs, or a seller could never generate twice)
7. `status = 'running'` with `lease_token` set and `lease_until` null → `generations_lease_pairing`
8. `status = 'ready'` with `finished_at` null → `generations_finished_pairing`
9. two `packages` rows for one generation → primary key
10. a ledger row whose `generation_id` points at nothing → foreign key `23503`
11. deleting a generation blanks the ledger row's `generation_id` and **leaves the row** → the `set null` rule

Run: `pnpm vitest run src/generation/db/schema.spec.ts` — expected 11 passed, pasted.

- [x] **Step 6: `pnpm lint && pnpm typecheck && pnpm test`** — the whole suite, because a new migration runs in every other integration test's throwaway database.

---

### Task 2: Environment, and the fake provider the whole phase tests against

**Files:** Modify `src/common/config/env.schema.ts`; create `src/generation/testing/fake-provider.ts`

- [x] **Step 1: The five settings**

```ts
/** Spec §10. Summed from generations.est_cost_usd, so the cap counts what was really spent. */
DAILY_AI_SPEND_LIMIT_USD: z.coerce.number().positive().default(2),
/** §33: account-level limits. A seller cannot burn a day of the owner's budget alone. */
GENERATIONS_PER_DAY_LIMIT: z.coerce.number().int().positive().default(20),
/** §29: "cap repeated free analysis attempts to prevent abuse". */
NEEDS_INPUT_PER_PROJECT_PER_DAY: z.coerce.number().int().positive().default(5),
/** How long a worker owns a job. Longer than the slowest plausible call plus a repair. */
JOB_LEASE_MINUTES: z.coerce.number().int().positive().default(5),
WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
```

`DAILY_AI_SPEND_LIMIT_USD` defaults to **2**, deliberately low (Doston's decision 1). It is the number that stands between a bug and a bill.

- [x] **Step 2: The fake provider**

It implements `AiProvider` from `src/ai/public/provider.port.ts` — `name`, `estimateCostUsd`, `generate` — and is told what to do:

```ts
type FakeBehaviour =
  | { kind: 'ready' }                    // a valid package, from a committed fixture
  | { kind: 'needs_input'; questions: string[] }
  | { kind: 'refused'; messageUz: string }
  | { kind: 'malformed' }                // fails the validators, forcing the one repair
  | { kind: 'repair-then-ready' }        // first attempt malformed, repair valid
  | { kind: 'error'; code: ProviderErrorCode }   // AI_TIMEOUT, AI_UNAVAILABLE, …
  | { kind: 'hang'; ms: number };        // returns after the lease expires — Task 8's race
```

`hang` is the one that matters. "A late success cannot race a refund" cannot be tested any other way: the call must still be in flight when the sweeper decides the job is dead.

The `ready` fixture is a **real** `gpt-5.5` result copied from a P1 run, so the validators are exercised against output the model actually produced rather than something shaped to pass.

- [x] **Step 3: `pnpm lint && pnpm typecheck`** — expected silent. The fake lives under `generation/testing/`, so it may import the `ai` port but **not** the `ai` module's internals (R-7). If it needs more than the port exposes, stop and ask.

---

### Task 3: The generation port, its errors, and the assets port extension

**Files:** Create `src/generation/public/generation.port.ts`, `generation.errors.ts`; modify `src/assets/public/assets.port.ts`

- [x] **Step 1: The port**

```ts
export const GENERATION_STATUSES =
  ['queued','running','ready','needs_input','refused','failed'] as const;

export const generationViewSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  status: z.enum(GENERATION_STATUSES),
  /** Uzbek questions when needs_input, else empty. Never the raw provider error. */
  questionsUz: z.array(z.string()),
  messageUz: z.string().nullable(),
  /** A spec §9 code the web app translates. Never a provider message (§9). */
  errorCode: z.string().nullable(),
  createdAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable(),
});

/** Only present on a ready generation. This is the thing the seller paid for. */
export const adPackageViewSchema = z.object({
  generationId: z.uuid(),
  promptEn: z.string(),
  result: z.unknown(),
  createdAt: z.iso.datetime(),
});
```

- [x] **Step 2: The errors**

| class | code | status | when |
|---|---|---|---|
| `GenerationNotFoundError` | `GENERATION_NOT_FOUND` | 404 | missing, or another user's |
| `JobInFlightError` | `JOB_IN_FLIGHT` | 409 | the one-active-job index refused a second |
| `GenerationRateLimitedError` | `RATE_LIMITED` | 429 | over `GENERATIONS_PER_DAY_LIMIT` |
| `SpendCapReachedError` | `SPEND_CAP_REACHED` | 503 | the day's recorded spend is at the cap |
| `NeedsInputCapError` | `NEEDS_INPUT_CAP` | 429 | over `NEEDS_INPUT_PER_PROJECT_PER_DAY` |

`SPEND_CAP_REACHED` is **503, not 402.** It is our limit, not the seller's fault, and it is temporary. A 402 would tell them to buy credits, which would not help and would be a lie.

- [x] **Step 3: The assets port gains a reader**

The worker needs the **model-input** bytes, and `assets` owns both the rows and the files. R-7 forbids `generation` from reading either, so the contract grows one token:

```ts
export const MODEL_INPUT_READER = Symbol('MODEL_INPUT_READER');

export interface ModelInputReader {
  /**
   * The model-input copies for a project the user owns, primary first, 1–4 of them.
   * Resolves only on ownership — the same 404-not-403 rule as everywhere else.
   */
  readModelInputs(userId: string, projectId: string): Promise<ReferenceImage[]>;
}
```

It returns `ReferenceImage` from the **ai** port (`bytes`, `mimeType`), so the worker hands them to `generateAdPackage` untouched and no third shape is invented for the same thing. `AssetsService` implements it; `AssetsModule` is already `@Global()`.

- [x] **Step 4: `pnpm lint`** — a port importing another port is allowed; a port importing a service is not.

---

### Task 4: TX 1 — reserve, insert, enqueue

The transaction that takes the money. Everything about it is designed so that pressing the button twice costs once.

**Files:** Create `src/generation/generations.repo.ts`, `generation.queue.ts`, `generation.service.ts` + `generation.service.spec.ts`

- [x] **Step 1: The order of operations, and why**

```
POST /projects/:id/generations   header: Idempotency-Key
  1. SessionGuard, CsrfGuard                         (existing, global)
  2. projectOwnership.getOwned(userId, projectId)    → 404 if not theirs
  3. assets exist for the project                    → 400 if none
  4. generations today < GENERATIONS_PER_DAY_LIMIT   → 429
  5. today's Σ est_cost_usd < DAILY_AI_SPEND_LIMIT   → 503
  6. needs-input cache hit?                          → return the cached questions, NO CALL, NO CHARGE
  7. TX:
       SELECT … WHERE user_id, idempotency_key       → exists? return it, unchanged
       creditLedger.reserveOne(userId, null, tx)     → 402 NO_CREDITS
       INSERT generations(queued)                    → unique violation ⇒ 409 JOB_IN_FLIGHT
     COMMIT
  8. queue.add(name, { generationId }, { jobId: generationId })
  9. 202 { generationId, status: 'queued' }
```

**Step 6 sits before the reserve, not after.** Addendum A §A5: a cached `needs_input` must cost nothing at all — not a credit, not a call. Putting it after the reserve would mean reserving and immediately releasing, which litters the ledger with pairs that describe nothing.

**Step 8 is after COMMIT, never inside.** Enqueue inside the transaction and a rollback leaves a job in Redis pointing at a generation row that does not exist — the worker then fails for ever on a ghost.

**`reserveOne` is called with the generation id as `null`.** The row does not exist yet, and the ledger's `generation_id` is nullable for exactly this reason. TX 1 backfills it after the INSERT, in the same transaction.

- [x] **Step 2: Idempotency, exactly**

The `Idempotency-Key` header is required; without it, 400 with `IDEMPOTENCY_KEY_REQUIRED`. It is bounded (≤ 200 chars) and never interpolated anywhere.

The lookup comes **first inside the transaction**. If the row exists, return it and **do not reserve** — that is the whole of §32's "duplicate clicks must not create duplicate charges". A returning caller gets the same `generationId`, and if the job has already finished they get its result from `GET /generations/:id`, not a second package.

- [x] **Step 3: The queue**

```ts
// jobId = generationId, so BullMQ itself de-duplicates a re-enqueue.
await queue.add('generate', { generationId }, {
  jobId: generationId,
  attempts: 1,               // OUR sweeper owns retries, not BullMQ's
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 500 },
});
```

**`attempts: 1` on purpose.** BullMQ retrying a job it thinks failed, while our sweeper also requeues it, is two retry mechanisms disagreeing about one credit. Postgres is the source of truth (D-030), so the lease and the sweeper decide; BullMQ only delivers.

- [x] **Step 4: Tests** (real Postgres, real Redis, fake provider, worker **not** running so jobs stay `queued`)

1. a first call reserves one credit and returns `queued`; balance `{available−1, reserved+1}`
2. **the same key twice returns the same `generationId`, and the balance moves once** (§32, §A8)
3. a different key while the first is still queued → **409 `JOB_IN_FLIGHT`**, and no second reserve
4. zero balance → 402 `NO_CREDITS`, **no generation row** and no ledger row
5. another user's project → 404, no reserve
6. a project with no assets → 400, no reserve
7. over `GENERATIONS_PER_DAY_LIMIT` → 429, no reserve
8. today's spend at the cap → 503 `SPEND_CAP_REACHED`, no reserve — **and no provider call**
9. a missing `Idempotency-Key` → 400
10. the ledger's `reserve` row carries the new `generation_id`
11. after every case, `assertLedgerMatchesAccounts()` holds

Run: `pnpm vitest run src/generation/generation.service.spec.ts` — expected 11 passed, pasted.

---

### Task 5: The worker — claim, call, hand off

**Files:** Create `src/generation/generation.worker.ts`; modify `src/worker.module.ts`

- [x] **Step 1: Claim by lease**

```sql
UPDATE generations
   SET status = 'running', lease_token = gen_random_uuid(),
       lease_until = now() + ($2 || ' minutes')::interval, attempts = attempts + 1
 WHERE id = $1
   AND (status = 'queued' OR (status = 'running' AND lease_until < now()))
RETURNING lease_token, attempts, project_id, user_id, target_id
```

0 rows means someone else owns it, or it is already finished. **The worker returns quietly — it does not throw.** A job that is legitimately gone is not an error, and treating it as one fills the logs with alarm about correct behaviour.

- [x] **Step 2: Build the input, outside any transaction**

`modelInputReader.readModelInputs(userId, projectId)` for the bytes, the project's brief for the `Brief`, the target from `src/ai/targets/targets.ts`, then `generateAdPackage(input, { provider, spend })`.

**No transaction is open here.** This is the step that takes seconds.

- [x] **Step 3: Hand the outcome to `settle.service.ts`** with the lease token. The worker itself writes nothing to `generations`, `packages`, or the ledger — one place decides how an outcome becomes a row (Task 6).

- [x] **Step 4: Register in `worker.module.ts`.** The `worker` entrypoint must actually run the processor; `api` must not. This is the one thing no unit test notices — an unregistered worker looks exactly like a slow one. Verify by starting `pnpm dev:worker` and watching a job move from `queued` to `ready`.

- [x] **Step 5: Tests**

1. a `queued` job is claimed: `running`, a lease token, `attempts = 1`
2. claiming twice concurrently → exactly one claim, one `attempts = 1`
3. a `running` job with a **live** lease is not claimable
4. a `running` job with an **expired** lease **is** claimable, `attempts = 2`
5. a `ready` job is not claimable, and the worker does not throw
6. the provider is called with the model-input bytes, **not** the reference copy

---

### Task 6: TX 2 — settle, guarded by the lease

Where a credit is finally spent or given back. The guard is the whole design.

**Files:** Create `src/generation/settle.service.ts` + `settle.service.spec.ts`

- [x] **Step 1: Every settle is conditional**

```sql
UPDATE generations SET status = $2, finished_at = now(), lease_token = NULL,
       lease_until = NULL, provider = $3, model = $4, input_tokens = $5,
       output_tokens = $6, est_cost_usd = $7, error_code = $8
 WHERE id = $1 AND lease_token = $9           -- ← the entire safety property
RETURNING user_id, status
```

0 rows ⇒ **a stale worker.** Its result is dropped: the transaction rolls back, no package is written, no credit is debited and none is released. Source 01 §32: "a late success cannot race a refund and create both a successful free generation and restored credit." Two things must both be true for that to hold — the settle is guarded, and the sweeper clears the lease when it requeues (Task 7). Either one alone is not enough.

- [x] **Step 2: The four outcomes, each one transaction**

| outcome | writes | money |
|---|---|---|
| `ready` | `INSERT packages` | `debit()` |
| `needs_input` | cache the questions | `release()` |
| `refused` | `messageUz` on the row | `release()` |
| `failed` | `error_code` | `release()` |

`ready` writes the package **and** the debit in the same transaction. A package without a debit is a free generation; a debit without a package is theft. Neither can exist.

- [x] **Step 3: `est_cost_usd` is recorded on every outcome**, including failures. A failed call still cost money at the provider, and the daily cap (Task 4 step 5) is a sum over this column — leaving it null on failure would let a run of failures spend past the cap invisibly.

- [x] **Step 4: Tests**

1. `ready` → `packages` row, `debit`, balance `{available, reserved−1}`
2. `needs_input` → no package, `release`, balance restored, questions cached
3. `refused` → `release`, `messageUz` stored, **no** raw provider text anywhere
4. `failed` → `release`, `error_code` a spec §9 code
5. **a settle with the wrong lease token writes nothing at all** — no package, no ledger row, no status change (assert all four)
6. `ready` settled twice with the same token → the second writes nothing (the package pk refuses it), **and no second debit**
7. `est_cost_usd` is set on a failure as well as a success
8. `assertLedgerMatchesAccounts()` after every case

Run: `pnpm vitest run src/generation/settle.service.spec.ts` — expected 8 passed, pasted.

---

### Task 7: The sweeper

**Files:** Modify `src/generation/generations.repo.ts`; create `src/generation/sweeper.spec.ts`

- [x] **Step 1: One statement, and it must clear the lease**

```sql
UPDATE generations
   SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
       finished_at = CASE WHEN attempts >= 3 THEN now() ELSE NULL END,
       error_code  = CASE WHEN attempts >= 3 THEN 'AI_TIMEOUT' ELSE NULL END,
       lease_token = NULL, lease_until = NULL        -- ← invalidates the old worker
 WHERE status = 'running' AND lease_until < now()
RETURNING id, user_id, status
```

**`lease_token = NULL` is not tidiness.** It is the half of the race guard that lives here: once the lease is cleared, the old worker's `WHERE lease_token = $mine` can never match again, so its late success is dropped rather than delivered alongside the refund.

For each row that came back `failed`, `release()` the credit **in the same transaction as the status change**.

- [x] **Step 2: When it runs.** On an interval in the worker process (`JOB_LEASE_MINUTES` / 2), and it must be safe to run concurrently with itself — the `WHERE` clause makes it so: a row it has already swept is no longer `running`.

- [x] **Step 3: Tests**

1. a `running` job with an expired lease and `attempts = 1` → `queued`, lease cleared
2. the same with `attempts = 3` → `failed`, `release`, balance restored
3. a `running` job with a live lease is untouched
4. **the late-success race, end to end:** claim a job, let the sweeper expire and requeue it, *then* have the first worker settle `ready` → it writes nothing; the credit is released exactly once and no package exists. **This is P4's hardest exit check.**
5. two sweepers running at once release each credit exactly once
6. `assertLedgerMatchesAccounts()` after each

Run: `pnpm vitest run src/generation/sweeper.spec.ts` — expected 6 passed, pasted. **If test 4 is flaky, stop** — a flaky money race is a finding, not a rerun.

---

### Task 8: The needs-input cache and its cap (source 01 §29)

**Files:** Create `src/generation/needs-input.cache.ts` + spec

- [x] **Step 1: The key**

`sha256(userId + '|' + assetSha256s.sort().join(',') + '|' + briefHash)`.

`assets.sha256` already exists (P2). Sorted, so photo order does not change the key. Includes the user id, so two sellers with the same stock photo never share a cache row — that would leak one seller's brief into another's answer.

- [x] **Step 2: A hit costs nothing.** Checked at Task 4 step 6, before the reserve. Returns a synthetic `needs_input` view with the cached `questionsUz`, no generation row, no credit, no call.

- [x] **Step 3: The cap.** More than `NEEDS_INPUT_PER_PROJECT_PER_DAY` **misses** for one project in a day → 429 `NEEDS_INPUT_CAP` before the reserve. §29: "cap repeated free analysis attempts to prevent abuse." Counted from `needs_input_cache` rows for the project today.

- [x] **Step 4: Tests**

1. a miss then the identical request → second is a cache hit, **provider called exactly once**, no credit moved on the second
2. a changed brief → a miss, so a new call
3. an added photo → a miss
4. the same photos in a different order → a **hit** (the sort)
5. another user with identical photos and brief → a **miss**, and they cannot read the first user's questions
6. over the daily cap → 429, no call
7. a cache hit does **not** count toward the cap (only misses do — otherwise answering the questions would lock the seller out)

---

### Task 9: Polling, and the contract

**Files:** Create `src/generation/generation.controller.ts`, `generation.dto.ts`, `generation.module.ts`; modify `src/app.module.ts`

| route | | |
|---|---|---|
| `POST /api/projects/:id/generations` | session + CSRF + `Idempotency-Key` | 202 `{ generationId, status }` |
| `GET /api/generations/:id` | session | the view; `package` present only when `ready` |

- [x] **Step 1: 202, not 201.** The work has been accepted, not completed, and nothing is created at the returned URL yet. (D-076 is the same lesson from the other direction.)
- [x] **Step 2: `GET` is the disconnect story.** It is why a success survives a dead browser: the result is in Postgres and the client re-reads it. Assert it with a fresh cookie-less-of-context request, not by trusting the first response.
- [x] **Step 3: Never leak a provider message.** `refused` gives `messageUz`; `failed` gives a spec §9 code. Raw provider text reaches a log, never a seller (spec §9).
- [x] **Step 4: `createZodDto` for both** (T-09), then `pnpm openapi:generate && pnpm openapi:check`, and **read the diff** — the web repo generates its client from it (D-031).
- [x] **Step 5: Register in `app.module.ts` for the routes and `worker.module.ts` for the processor.** Both, and they are different files for a reason.

---

### Task 10: The P4 exit gate

`docs/PLAN.md` names three checks. Source 01 §32 and Addendum A §A8 add a fourth. All four over real HTTP, with the **real worker running in-process** against the real Redis and the fake provider.

**Files:** Create `src/generation.e2e.spec.ts`

- [x] **Step 1: One credit, two concurrent jobs, one success**

Two simultaneous `POST`s with **different** idempotency keys on a one-credit account. Exactly one gets 202; the other gets 402 or 409. Exactly one package exists, the balance ends at zero, and the ledger balances.

- [x] **Step 2: A success survives a disconnect**

`POST`, abort the request client-side before the response, let the worker finish, then `GET /generations/:id`: `ready`, with the package, and the credit **still spent**. §32: do not refund a stored package because the client missed the first response.

- [x] **Step 3: A late success cannot race a refund**

The `hang` behaviour plus a short lease. The sweeper requeues the job and, on the third attempt, fails and releases. The original call then returns successfully. Assert: **no package, exactly one release, the credit back exactly once**, and no path where the seller has both the package and the credit.

- [x] **Step 4: Duplicate retries reuse the same job and result**

Five `POST`s with the **same** key, fired together. All return the same `generationId`, exactly one credit moves, exactly one package is written.

- [x] **Step 5: Coverage, as D-077 requires.** The contract-driven coverage test is extended to cover `/api/generations` and `/api/projects/{id}/generations`, so a P4 route that is never driven to a 2xx fails the build.

- [x] **Step 6: Walk it by hand, with a REAL provider call.** This is the only real spend in the phase and the step that found four defects in P2 and one in P3. Sign in, upload a real product photo, generate, poll to `ready`, read the Uzbek shot plan and the English prompt, confirm exactly one credit went and `est_cost_usd` is populated. Then generate with a zero balance and confirm no call was made. **Paste the real output into `docs/PROGRESS.md`, and anything this finds becomes a `DECISIONS.md` entry.**

---

### Task 11: Close the phase

- [x] **Step 1: The full gate** — `lint`, `typecheck`, `test`, `build`, `openapi:check`. Paste all five.
- [x] **Step 2: `DECISIONS.md`** — the new error codes and status choices (503 for the cap, 202 for accepted), the `attempts`-at-claim-time rule, BullMQ `attempts: 1`, plus anything the hand-walk found.
- [x] **Step 3: `docs/PROGRESS.md`** — Resume block, the real output from Task 10 Step 6, and what P5 inherits.
- [x] **Step 4: `docs/PLAN.md`** — `⬅ next` from P4 to P5.
- [x] **Step 5: Stop. Do not commit** (D-071) **and do not merge** (D-070). Report, and wait for Doston.

---

## Self-review against the spec and the sources

| requirement | where |
|---|---|
| §32: quota transactional and idempotent | Task 4 steps 1–2 |
| §32: duplicate clicks make no duplicate charge or second job | `generations_user_key` + `jobId`; Task 10 step 4 |
| §32: failed, refused, needs-input release the reservation | Task 6 step 2 |
| §32: a success survives a disconnect and stays consumed | Task 10 step 2 |
| §32: a late success cannot race a refund | Task 6 step 1 **and** Task 7 step 1 — both halves; Task 10 step 3 |
| §32: explicit job states | Task 1's `generations_status_check` |
| §29: cache reference analysis; cap repeated free attempts | Task 8 |
| §29 / §A5: no paid call on an exhausted balance | Task 4 step 7 (reserve before call), Task 4 test 8 |
| §33: account limits, daily spend, concurrent-job limit | Task 2 step 1, `generations_one_active_per_user` |
| §A8: one credit, two concurrent jobs, one success | Task 10 step 1 |
| spec §6: provider call outside the transaction | Task 5 step 2 — the phase's most important rule |
| spec §9: no raw provider error reaches a seller | Task 9 step 3 |
| D-020: auto-refund is just how credits work | Task 6 step 2; no refund feature is built |
| D-030: Postgres is the source of truth | BullMQ `attempts: 1`; the lease and sweeper decide |
| R-4: tested against real Postgres **and real Redis** | Tasks 4–8, 10 |
| R-7: modules talk through ports | Task 3; `pnpm lint` is the check |
| **P3's debt: `credit_ledger.generation_id` FK** | **Task 1 step 3** |

**Out of scope:** the studio UI and the owner panel screens (P5); the gallery (P6); voiceover and overlay text (D-017); more than one repair attempt (spec §5 — at most one, and P1 already enforces it).

**Open, and not to be guessed:** `high-energy` has still never been tested in Flow, and every clip so far ends in a 3-second static hold (D-063). Both are content questions about the *prompt*, not the pipeline, so P4 does not address them — but the first real generation in Task 10 Step 6 is a chance to look.

---

## What changed while building it

Five things the plan did not anticipate, each forced by something real:

1. **`generations` needed `questions_uz` and `message_uz`.** The plan's own `generationViewSchema` required them and the schema did not have them — caught before it ran, and `0007` was regenerated rather than patched with a follow-up migration.
2. **The ai module got a port and a Nest module** (D-081). P1's `generateAdPackage` was library code with no port, and R-7 correctly refused the worker's direct import. `AD_GENERATOR` now publishes it, and the worker no longer knows what a video target is.
3. **Two more ports grew:** `PROJECT_BRIEF_READER` (the worker needs the whole brief, not the summary) and `MODEL_INPUT_READER` (it needs the 1024 px copies, and `assets` owns the files). `AssetsModule` became `@Global()` to match how the other modules publish ports.
4. **`JOB_STATUSES`, not `GENERATION_STATUSES`** — `ai/public/result.schema.ts` already exports that name for the model's three outcomes, and the two lists are not the same thing.
5. **The queue had to become lazy and own its connection** (D-080), after it hung `openapi:generate` for ever.

And two defects found by testing rather than by reading:

- **A flaky duplicate-click test, 1 run in 4** (D-079): two unique indexes on one row make `23505` ambiguous. Fixed by answering from the data rather than the error, and by moving the INSERT before the reserve.
- **A real generation costs 4x the pricing assumption** (D-082). Found by the hand-walk, which is the only step that spends real money — and the only one that could have found it.
