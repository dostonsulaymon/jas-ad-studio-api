# JAS Ad Studio — design spec

**Status:** APPROVED by Doston on 2026-09-11 (R-1 to R-8 → D-036 to D-038) · **Date:** 2026-09-11
**Built from:** `DECISIONS.md` D-001 to D-035, and the owner's documents in `docs/source/` (01 build prompt v2, 02 prompt quality standard, 03 Addendum A). D-028 supersedes §A7 of document 03.

This spec says **how** the product is built. The phase plans in `docs/superpowers/plans/` turn it into tasks. Where it disagrees with `DECISIONS.md`, `DECISIONS.md` wins, and the spec gets fixed.

---

## 0. Design choices (approved 2026-09-11)

The questions round didn't cover these. I made each call for a reason, and each one is easy to change now and costly later.

| # | Choice | Why | Alternative |
|---|---|---|---|
| **R-1** ✅ D-036 | Sessions are **opaque session IDs in an httpOnly cookie, stored in Postgres**. No JWT. | Can be revoked instantly (log out everywhere, ban). One origin (D-032) makes cookies trivial. | Signed JWT cookie: stateless, but can't be revoked before it expires |
| **R-2** ✅ D-037 | A **small owner panel** at `/admin` in the web repo, for owner Google accounts only. It covers orders, grants, settings, and read-only users and generations. Every action calls owner-only `/api/owner/*` endpoints. | Jakhongir confirms every payment (D-008), from his phone. It uses the same services and transactions as the app, so there is no raw table editing. | An owner CLI (not usable from a phone), or a generic DB admin tool (bypasses the credit rules) |
| **R-3** ✅ D-038 | The credit balance lives in a `credit_accounts` row (`available`, `reserved`), with `CHECK >= 0`. **Every change also writes a `credit_ledger` row in the same transaction.** | Reserving a credit is one atomic `UPDATE … WHERE available >= 1`, so concurrent jobs can't overspend. The ledger is the audit trail. | A balance computed from the ledger on every read, with advisory locks |
| **R-4** ✅ D-038 | Money and job logic is tested against a **real Postgres** (integration tests), not only unit tests. | Race conditions (two jobs, one credit; double confirm; a late success) only show up against a real database. This departs from kitobnarx's unit-only rule. | Unit tests with mocks: they miss exactly these bugs |
| **R-5** ✅ D-038 | Gallery metadata lives in a **JSON file in the api repo**. Clips live on a media volume, served at `/api/gallery/media/*` with long-lived cache headers, so Cloudflare caches them. | Owner-curated with no CMS (source 01 §14). Clips never touch the database. | A `gallery_examples` table plus the owner CLI |
| **R-6** ✅ D-038 | We keep only **two copies of each photo**: a 2048 px reference copy (downloadable, for Flow) and a 1024 px model-input copy. **The original upload is discarded** after processing. | Addendum A: 2048 px is plenty for Flow and keeps storage small. EXIF and GPS data are gone with the original. | Also keep the original (up to 10 MB each) |
| **R-7** ✅ D-038 | API modules talk **only through each module's public port file**, and lint enforces it (the kitobnarx pattern). | Keeps modules separate, and lets Session A refactor safely. | Free imports between modules |
| **R-8** ✅ D-038 | Web-only UI decisions are recorded in the web repo's own `DECISIONS.md` as **W-001…** by Session B. Shared decisions go only in the api `DECISIONS.md`, written by Session A. | Two sessions must never edit the same file (D-025). | One shared file, edited through Doston |

---

## 1. Goal and success

- **Seller:** photo and brief in → one ad package out → copy → Google Flow → a usable video. Paid with credits (D-007, D-009, D-010).
- **P1 go/no-go:** at least 6 of ~10 real products give a usable Flow video (D-019).
- **Launch:** about mid-October 2026 (D-024). The quality gates are never cut to hit the date.

## 2. System architecture

```text
Seller's browser
   │ HTTPS
   ▼
Cloudflare Tunnel ── one domain (D-032)
   ├── /api/*  ──► api (NestJS, "api" entrypoint)
   │                 ├── Postgres      source of truth: users, sessions, credits, jobs, packages
   │                 ├── photo volume  private, never publicly addressable
   │                 └── enqueue ──► Redis / BullMQ ──► worker (NestJS, "worker" entrypoint)
   │                                                      ├── AI provider (OpenAI | Claude | Gemini)
   │                                                      └── Postgres (outcome + debit/release)
   └── /*      ──► web (Next.js 16), server-renders the one-page studio
```

- **Everything runs in Docker Compose** (D-033): `api`, `worker`, `web`, `postgres`, `redis`, `cloudflared`. A dev compose runs only Postgres and Redis, and the apps run in watch mode.
- **`api` and `worker` share one image** with different entrypoints (kitobnarx pattern).
- **Postgres is the source of truth.** Redis only schedules work. Losing Redis can delay a job, but can never double-charge (D-030).

## 3. API modules

Each module owns its tables and exposes one public port file (R-7).

| Module | Owns | Public HTTP (all under `/api`) |
|---|---|---|
| `config` | zod-validated env; fails closed if a required setting is missing | — |
| `health` | liveness and readiness (Postgres, Redis) | `GET /health/live`, `GET /health/ready` |
| `auth` | Google OAuth (authorization code, server-side), users, sessions (R-1) | `GET /auth/google`, `GET /auth/google/callback`, `POST /auth/logout`, `GET /me` |
| `settings` | `site_settings`: support contacts (D-023), payment instructions (D-008) | `GET /settings/public` |
| `credits` | packs, orders, accounts, ledger, `confirmCreditOrder`, owner grants | `GET /credits/balance`, `GET /packs`, `POST /orders`, `GET /orders` |
| `projects` | projects, briefs, deletion (D-021) | `POST /projects`, `GET /projects`, `GET /projects/:id`, `PATCH /projects/:id`, `DELETE /projects/:id` |
| `assets` | upload pipeline, the two photo copies (R-6), authorized download | `POST /projects/:id/assets` (multipart), `GET /assets/:id/reference`, `DELETE /assets/:id` |
| `ai` | provider interface and adapters, system prompt V2, output schema, video targets (D-012), validators | — (used by `generation`) |
| `generation` | generation jobs, the credit flow (§6), polling, needs-input cache | `POST /projects/:id/generations` (needs an `Idempotency-Key` header), `GET /generations/:id` |
| `gallery` | example metadata and creative presets (R-5), media serving | `GET /gallery`, `GET /gallery/media/*` |
| `feedback` | "Did you get a usable video?" answers, and product events | `POST /generations/:id/feedback`, `POST /events` |
| `owner` | owner-only actions for the admin panel (D-037): confirm or reject orders, grant credits, edit settings, read users, generations and spend; writes the audit log | `/owner/*` (role `owner` only) |

The gallery, the packs list and public settings work signed out. Everything else needs a session, and the owner of every row is checked on the server.

## 4. Data model (Postgres, Drizzle, SQL migrations committed)

| Table | Key columns | Rules |
|---|---|---|
| `users` | id, google_sub (unique), email, name, locale, role (`seller`, `owner`), created_at | `owner` only comes from the `OWNER_EMAILS` allowlist at sign-in (D-037) |
| `sessions` | id (random 256-bit), user_id, expires_at, created_at | deleted on logout |
| `site_settings` | key (pk), value (jsonb), updated_at | edited only through owner endpoints (D-037) |
| `credit_packs` | id, credits (1, 5, 15), price_uzs (nullable), is_active, sort_order | not sold while `price_uzs` is null (D-009) |
| `credit_orders` | id, user_id, pack_id, credits, amount_uzs, status (`pending`, `paid`, `rejected`, `cancelled`), payment_method, payer_reference, rejection_reason, confirmed_at, confirmed_by | clients can create and cancel their own `pending` orders only |
| `credit_accounts` | user_id (pk), available, reserved | `CHECK (available >= 0 AND reserved >= 0)` (R-3) |
| `credit_ledger` | id, user_id, type (`purchase`, `owner_grant`, `reserve`, `debit`, `release`), amount, order_id, generation_id, note, created_at | `UNIQUE (order_id) WHERE type = 'purchase'`; `note` is required for `owner_grant` |
| `projects` | id, user_id, name, description, goal, style, platform, aspect_ratio, offer (jsonb, optional), audience, inspiration_id, brief_version, created_at, deleted_at | — |
| `assets` | id, project_id, user_id, kind (`reference`, `model_input`), path, width, height, bytes, sha256, is_primary | files live on the private volume |
| `generations` | id, project_id, user_id, idempotency_key, status (`queued`, `running`, `ready`, `needs_input`, `refused`, `failed`), attempts, lease_token, lease_until, target_id, prompt_version, provider, model, input_tokens, output_tokens, est_cost_usd, error_code, created_at, finished_at | `UNIQUE (user_id, idempotency_key)`; at most one `queued` or `running` job per user |
| `packages` | generation_id (pk), result (jsonb, validated §5), prompt_en, created_at | written only together with the `debit` |
| `feedback` | id, generation_id, user_id, usable (`ha`, `qisman`, `yoq`), comment, created_at | — |
| `events` | id, user_id (nullable), name, props (jsonb, no prompts or images), created_at | our own table; no third-party analytics |
| `owner_audit_log` | id, owner_id, action, target_type, target_id, details (jsonb), created_at | written by every owner action, append-only (D-037) |

## 5. The AI package

- **Shape:** the output follows source 01 §26, **without `editingAssets`** (D-017).
- **Enforcement:** a strict schema through the provider's structured output where supported, and always validated again with zod on our side.

```text
status: ready | needs_input | refused
questionsUz: string[≤2]      messageUz: string | null
product: { category, observedDetails[], confirmedClaims[], unknownDetails[], referenceConflicts[], fidelityConstraints[] }
concept: { titleUz, rationaleUz, style, hookUz, ctaUz } | null
target:  { targetId, durationSeconds, aspectRatio } | null
shots:   [{ startSeconds, endSeconds, descriptionUz, cameraUz }]
promptEn: string | null
assumptionsUz: string[]      reviewNotesUz: string[]
```

**System prompt V2:** a versioned server file (`AD_DIRECTOR_SYSTEM_PROMPT_V2`). It merges source 01 §25 with source 02, and has no fixed numbers. The target's values are injected at instruction level (D-012). User text, filenames, image text and gallery presets are passed as **data**, never as instructions. Changing it is a standing-gate change.

**Video targets:** a versioned config file in the repo, reviewed like code (D-012, D-013). The first entry:

```text
id: flow-veo-3.1       sourceUrl, checkedAt: 2026-09-11
maxPromptTokens: 1024  maxWords: set so the prompt stays under maxPromptTokens (≈700; exact value set in P1)
recommendedWords: set in P1 (compare 300/500/700)
beats: { default: set in P1, max: 4 }
durations: [8] (confirm in Flow)   aspectRatios: [9:16, 16:9]   referenceImages: true
highEnergyCameraAllowed: only when the seller picks an energetic style
```

**Deterministic validators**, run after the schema check, before anything is saved:
- **Target:** the target exists; the duration and aspect ratio are supported.
- **Length:** `promptEn` is within `maxWords` and a character ceiling.
- **Timeline:** the first shot starts at 0; shots are contiguous with no overlap; the last shot ends at the duration; the beat count is at most the max.
- **Content:** no placeholders (`[PRODUCT]`, `{…}`, `TBD`); the Uzbek fields are Latin script; `promptEn` is English.
- **Ready state:** a `ready` result has a concept, shots and a prompt.

If validation fails, there is **at most one repair call** (the validator errors are sent back), then `failed`.

## 6. Generation and credit flow (the money-critical path)

```text
API  POST /projects/:id/generations  (Idempotency-Key)
  1. auth · owns project · owns assets · rate limits · daily AI spend cap not reached
  2. TX: if (user_id, idempotency_key) exists → return that job (no new charge)
         UPDATE credit_accounts SET available-1, reserved+1 WHERE user_id=$u AND available>=1   (0 rows → 402 no credits)
         INSERT generations(status=queued) · INSERT ledger(reserve, -1)
     COMMIT → enqueue BullMQ job (jobId = generation id, so it is deduplicated) → 202 { generationId }

WORKER
  3. claim: UPDATE generations SET status=running, lease_token=$new, lease_until=now()+5m, attempts+1
            WHERE id=$g AND (status=queued OR (status=running AND lease_until<now()))
  4. call the provider OUTSIDE any transaction → validate → repair at most once
  5. TX (only if lease_token still matches):
       ready       → INSERT packages · status=ready · reserved-1 · ledger(debit)
       needs_input → status=needs_input · reserved-1, available+1 · ledger(release)
       refused / failed → same release
     A stale worker (token mismatch) updates 0 rows, so its result is dropped: no double delivery, no double refund.
  6. sweeper: running jobs past their lease go back to queued. After 3 attempts → failed + release.

CLIENT  polls GET /generations/:id until ready / needs_input / refused / failed. It survives a disconnect or reload.
```

- **Needs-input cache** (source 01 §29): keyed by user, asset hashes and brief hash. The same inputs return the cached questions without a new AI call. There's a cap per project per day, and no AI call at all with a zero balance (Addendum A §A5).
- **Order confirmation** (R-2):
  - `confirmCreditOrder(orderId)` runs in one transaction: the order moves `pending → paid`, `available + credits` is applied, and a `ledger(purchase)` row is written.
  - The unique `order_id` makes a second confirm a no-op.
- **Owner grants** use the same transaction pattern, with type `owner_grant` and a required note.

## 7. Photo pipeline (`assets`)

1. The upload is at most 10 MB and one of JPG, PNG or WebP. It is checked by **file signature**, not by extension.
2. It is decoded with sharp, with a pixel limit (e.g. ≤ 40 MP). A decode failure is rejected.
3. The upload produces a **reference copy** (≤ 2048 px long edge, JPEG q90) and a **model-input copy** (≤ 1024 px). Both are stripped of metadata.
4. Only those two are stored (R-6), on the private volume, under a random path. A photo is served only through `GET /assets/:id/reference` after an ownership check. There is never a public URL.
5. The AI receives the model-input copy as inline bytes. There are 1 to 4 photos, all of the same product and variant (source 01 §8).

## 8. Web (Session B, starts after the P1 go, D-026)

- **Framework and routing:** Next.js 16 App Router and Tailwind v4 (D-035). One page, `/`, with sections: hero, studio (the 3-step wizard and inline result), gallery, how it works, FAQ, footer. Project history is a drawer, not a page.
- **Rendering:** the landing page and gallery are server-rendered; the wizard is client-side.
- **API client:** generated from `openapi.json` (D-031). Requests go to same-origin `/api`. In dev, requests are rewritten to the NestJS port.
- **i18n:** every string lives in translation files, with only `uz-Latn` at launch (D-014). The library choice is a dependency, made in the web plan.
- **Brand:** one settings file in each repo (D-016). The design tokens come from source 01 §5.
- **UI rules:** the must-never rules in `jas-ad-studio-web/CLAUDE.md`, for example: copy puts only the prompt on the clipboard; no prices until they're configured; the gallery works signed out.
- **Owner panel:** `/admin`, visible only to role `owner`, phone-friendly. Pending orders, grants, settings, and read-only users, generations and spend (D-037). It calls only `/api/owner/*`.

## 9. Errors

The API error shape is `{ code, messageKey, details? }`. The web app maps `messageKey` to an Uzbek message plus a recovery action. Raw provider errors never reach sellers.

Every state in source 01 §47 gets a code, for example:
- `UPLOAD_TYPE`, `UPLOAD_TOO_LARGE`, `UPLOAD_DAMAGED`
- `SESSION_EXPIRED`
- `NO_CREDITS`, `ORDER_PENDING`
- `AI_TIMEOUT`, `AI_REFUSED`, `AI_MALFORMED`, `AI_TRUNCATED`
- `REFERENCE_CONFLICT`
- `RATE_LIMITED`, `SPEND_CAP_REACHED`
- `CONFIG_MISSING`

## 10. Security and abuse limits

- **Cookies and CSRF:**
  - The session cookie is `HttpOnly; Secure; SameSite=Lax`.
  - Every state-changing request needs a same-origin `Origin` header plus a custom `X-Requested-With` header.
- **Rate limits** (config values):
  - generations: 1 running per user, and a per-user daily cap
  - uploads: a per-hour cap
  - orders: a per-day cap
- **Spend:** a daily spend cap on AI calls (`DAILY_AI_SPEND_LIMIT_USD`), based on the recorded `est_cost_usd`. The worker refuses new calls once it is reached.
- **Secrets and logs:**
  - Secrets live only in env. `.env` is git-ignored; `.env.example` has no values.
  - Logs never contain images, full prompts, full briefs, cookies or keys.
- **Untrusted input:** text in images and briefs is data. There's a prompt-injection fixture (source 01 §49 #7). There's no fetching of remote URLs.

## 11. Testing

| Layer | How | Where |
|---|---|---|
| Pure logic (validators, timeline, pricing, mappers) | Vitest unit tests | api and web |
| Credits, orders, jobs, ownership | **Vitest against a real Postgres** from the dev compose, in a throwaway database per run (R-4) | api |
| The races in source 01 §32 | Integration tests: two jobs with one credit; the same idempotency key twice; double confirm; a late worker after the lease expires; a disconnect after success | api |
| AI contract | Recorded provider responses (fixtures) replayed through the validators. **No live AI calls in CI.** | api |
| Live AI quality | The P1 CLI only, run by hand and capped. Results go into the PROGRESS log | api |
| UI flows | Playwright at 390 px and desktop (P5 onward) | web |

## 12. P1 harness (AI core + go/no-go)

A command-line tool runs the real AI module end to end, with no HTTP, accounts or credits:

```bash
pnpm p1:generate --product fixtures/unbranded-bottle --provider openai --model <id> --target flow-veo-3.1
```

- **Input:** a product folder containing photos and a `brief.json`.
- **Output:** a markdown file with the prompt, the Uzbek shot plan, the validator results, token use and estimated cost.
- **Fixtures:** the 7 from source 01 §49, plus Jakhongir's ~10 real products.
- **Comparison:** the same inputs are run through each available provider (D-029). A results table records product, provider, model, prompt version, word count, validator pass, Flow usable yes/no, and what went wrong.
- **Go/no-go:** D-019 decides. The winning provider and model become a new decision.

## 13. Coordination between the two sessions (D-025, D-031, R-8)

- **Session A** owns the api repo, all shared docs, `docker-compose*.yml` and `openapi.json`.
- **Session B** owns the web repo. It reads the api repo but never edits it. It keeps `docs/PROGRESS.md` (web only) and `DECISIONS.md` (W-xxx) in the web repo.
- **Contract changes:** Session A regenerates `openapi.json` and notes the change in api `PROGRESS.md`. Session B regenerates its client, and its build shows what broke.
- **Questions from B:** they go to Doston, never become guesses. If an answer changes a shared decision, Session A records it.

## 14. Out of scope for the MVP

- video generation or editing, Flow automation, unofficial APIs
- automatic payment checkout and subscriptions (D-008)
- voiceover and overlay text (D-017)
- Telegram, phone or email sign-in (D-015)
- languages other than Uzbek Latin (D-014)
- a heavyweight admin dashboard (the small owner panel is in, D-037), a CMS, a public user gallery, teams, an AI chat
- multi-clip campaigns (source 01 §24)

## 15. Owed by the owner (not blocking P0 or P1)

- Pack prices (D-009)
- Final name, and a domain on Cloudflare DNS (D-016, D-032)
- Privacy policy and terms (D-022)
- Gallery clips with their metadata (D-011)
- Pilot sellers (Q-14)
- His OK on deferring voiceover (D-017)
- Claude and Gemini keys for the P1 comparison (D-029)
- Production AI billing (D-004)
