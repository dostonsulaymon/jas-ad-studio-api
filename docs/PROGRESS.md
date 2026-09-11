# PROGRESS

Where the project stands, what is next, and what is blocked. Updated at the end of every step. Decisions live in `/DECISIONS.md`. The roadmap lives in `docs/PLAN.md`.

**Last updated:** 2026-09-11

## Resume here

*A new session starts here. Keep this block current at the end of every step (D-018).*

| | |
|---|---|
| Phase | **P0 complete.** Committed on branch `p0-foundations`, pushed, CI green. Not yet merged to `main`. |
| Active plan | `docs/superpowers/plans/2026-09-11-phase-0-foundations.md` — every task checked |
| Doing now | Writing the P1 plan (AI core + go/no-go). |
| Next | P1 plan → Doston reviews it (a subagent reviews it first, at his request) → build one part at a time, testing each → the go/no-go. Session B's kickoff prompt is written before the P1 go (D-026). |
| Last verified state | 2026-09-11, re-run end to end at Doston's request: all five review tests passed. Report: https://claude.ai/code/artifact/9e78f1ed-42dc-41b0-b150-d03bc5292788 |

## Current position

| | |
|---|---|
| Phase | P0 built, under review |
| Code | api repo: NestJS api + worker, config, logging, Postgres, Redis, health, error shape, Docker, generated `openapi.json`. No product features. |
| Repos | Private on GitHub: `github.com/dostonsulaymon/jas-ad-studio-api` and `…/jas-ad-studio-web`. Branch `main`, pushed over SSH |
| Decisions | D-001 to D-042 |
| Open | None |

## 2026-09-11 — project set up for planning

**Done:**
- Read build prompt v1, build prompt v2 and the prompt quality standard in full.
- Wrote Addendum A with the owner decisions: paid credits, free gallery, Supabase Free constraints.
- Ran a cost analysis (tabbed artifact with a calculator): https://claude.ai/code/artifact/56eddb3d-8d0e-47e8-93e6-beef1a4509a1
- Created both folders, copied the sources into `docs/source/`, and wrote this doc set.

**Found:**
- Veo 3.1 has a **1,024-token text limit**, so 1,000-word prompts won't fit (C-4).
- Sources 01 and 02 disagree on prompt length, beat count and camera intensity (C-1 to C-3).
- The build prompt had no payment flow. Addendum A adds manual order confirmation.

## 2026-09-11 — every open question answered, design spec written

All 16 product questions and 8 tech questions were answered one at a time in chat, giving D-008 to D-035. The main outcomes:
- manual payment confirmation, with packs of 1, 5 and 15 credits and no free prompts
- Google sign-in
- prompt length set per video target, with Veo 3.1 first
- AI core first, with a 6-out-of-10 go/no-go
- no Supabase: our own Postgres in Docker, plus BullMQ
- a generated API client
- a Cloudflare Tunnel on one domain
- Tailwind v4

`.env` (which holds `OPEN_AI_API_KEY`) is now git-ignored. It was checked with `git check-ignore -v .env`.

The design spec is at `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md`. Doston approved it the same day:
- R-1: database sessions (D-036)
- R-2: changed to a small owner admin panel in the web repo (D-037)
- R-3 to R-8: as written (D-038)

## 2026-09-11 — P0 built (api repo), not committed

Built from `docs/superpowers/plans/2026-09-11-phase-0-foundations.md`. Doston approved P0 up front and asked for it finished in one sitting, reviewed before any commit. **Nothing is committed; the whole of P0 sits in the working tree.**

**Scope corrected first.** `docs/PLAN.md` said P0 covered both repos and included a web shell; D-026 forbids UI before the P1 go/no-go. Doston confirmed api-only (D-039), and the PLAN row was fixed.

**What was built:**
- Repo scaffold: pnpm, Node 24 (`.nvmrc`), strict TypeScript, ESLint with `eslint-plugin-boundaries` enforcing the module-port rule (R-7) from the first module, prettier, vitest.
- `config`: a zod env schema that fails closed, with tests for every failure mode.
- `logger`: pino with redaction covering cookies, tokens, `DATABASE_URL`, the API key, and the prompt/brief/image fields spec §10 names — listed now so no generation code can land before the redaction exists.
- Postgres pool and ioredis client, both with `error` handlers so a dependency blip cannot kill the process, and an advisory-locked migration runner.
- `health`: `/health/live` does no I/O; `/health/ready` checks both dependencies with a per-check timeout.
- The spec §9 error shape `{ code, messageKey, details?, requestId }`, with a filter that never lets an internal message or a 5xx detail reach a caller.
- Two entrypoints on one image: `main.api` and `main.worker`.
- `Dockerfile`, `docker-compose.yml` (deployed) and `docker-compose.dev.yml` (datastores only, separate project and volumes).
- `openapi.json`, generated from the running app (D-031), with a `openapi:check` that fails on drift.
- `.githooks/pre-commit` (no new dependency) and a GitHub Actions workflow.

**Verified with real output, not assumed:**
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (33 passing), `pnpm build`, `pnpm openapi:check` — all clean.
- Dev: `/health/live` 200 and `/health/ready` `{"status":"ready",...}` 200 on 3040.
- Redis stopped → `/health/ready` **503** `{"postgres":"up","redis":"down"}` while `/health/live` stayed **200**; restarted → 200 again with no app restart. Postgres stopped → the same, naming postgres.
- Unknown route → `404 {"code":"NOT_FOUND","messageKey":"errors.not_found","requestId":"…"}`, and an `x-request-id` header on every response.
- Both processes exited on SIGTERM with no stack trace; the worker's keep-alive kept it alive until then.
- Container stack (`--profile app`): postgres, redis, api and worker all healthy; the api's own healthcheck passed; it runs as uid 1000 `node`; image 291 MB. Torn down afterwards.
- The pre-commit hook refused a staged file with a type error, and `git log` confirmed HEAD did not move.

**Found while building:**
- **tsx cannot boot Nest.** The OpenAPI generator first ran under tsx and exited code 1 with no output at all. esbuild emits no decorator metadata, so `NestFactory.create()` cannot resolve constructor types and dies silently. The generator now lives in `src/` and is compiled by `nest build`. Worth remembering: any future script that boots the app must be compiled, not tsx'd.
- **`nestjs-zod` v5 dropped `patchNestjsSwagger`**, replaced by `cleanupOpenApiDoc`.
- **Newest majors resolved on install** — TypeScript 7, ESLint 10, vitest 5, boundaries 7 — and were pinned back to kitobnarx's versions (D-040).
- **Drizzle with no schema files** produces no journal, and `migrate()` throws on the missing folder. The runner logs `No migrations to apply` instead. No table was invented to work around it; the branch stops being taken in P2.
- `.gitignore` had a voice transcript pasted into it from an earlier session. Restored.
- The `/health/ready` route was documenting only 200 in the contract though it can return 503. Fixed before Session B could generate a client from it.

**Mistake, reported:** while testing SIGTERM handling, a `pgrep` pattern matched a kitobnarx container's process and it was sent SIGTERM. `restart: unless-stopped` brought it back within seconds and it verified healthy; no data was touched. Process lookups in this repo now match on `/proc/<pid>/cwd`, not on a command-line string.

**Not verified:** the GitHub Actions workflow has never run — `gh auth login` is still blocked (below). It is not claimed to pass.

### Review run, same day

Doston asked for the five review tests to be run and the results written up. Every one passed; the whole run is on one page: **https://claude.ai/code/artifact/9e78f1ed-42dc-41b0-b150-d03bc5292788**

| # | Test | Result |
|---|---|---|
| 1 | `lint` · `typecheck` · `test` · `build` · `openapi:check` | clean, 33 tests passing, contract up to date |
| 2 | Health probes and the error shape on a running api | `/health/live` 200, `/health/ready` 200, unknown route `404 {"code":"NOT_FOUND","messageKey":"errors.not_found","requestId":"…"}`, `x-request-id` on every response |
| 3 | Redis and Postgres each stopped and restarted | `/health/ready` 503 naming the downed one; `/health/live` stayed 200 throughout; both recovered with no app restart |
| 4 | Pre-commit hook against a staged type error | commit refused, `git log` confirmed HEAD did not move |
| 5 | Container stack | refused to start without `POSTGRES_PASSWORD`; with it, all four containers healthy, api healthcheck passing, running as uid 1000, 291 MB |

Afterwards the deployed stack was torn down with its volumes, the dev api process was stopped, and kitobnarx was confirmed untouched. The dev datastores (5437 / 6384) were left up so Doston can run the same checks himself.

### CI verified — the last P0 gap closed

`gh auth login` succeeded (scopes: `gist`, `read:org`, `repo`, `workflow`), so the old setup token's missing `read:org` is no longer a blocker. The nine P0 commits were pushed to branch `p0-foundations` and **the workflow ran for the first time and passed every step**: install, lint, typecheck, test, build, `openapi:check` — 1m17s against real Postgres and Redis services.

One annotation, not a failure: GitHub is deprecating Node 20 for actions, and `actions/checkout@v4`, `actions/setup-node@v4` and `pnpm/action-setup@v4` are being forced onto Node 24. They still work. Bumping to the v5 actions is a small chore for P7 hardening, or sooner if it starts warning louder.

**With this, P0 has nothing left unverified.** The branch is not merged to `main` — that is Doston's call.

Doston's remaining housekeeping: revoke the old setup token, which no longer has a use.

## Next

1. Doston reviews the P0 working tree and commits it.
2. Write the P1 plan (AI core + the go/no-go), get it approved, then build.
3. Write Session B's kickoff prompt before the P1 go (D-026).

## Owed by Jakhongir (not blocking P0 or P1)

- Pack prices (D-009)
- Final name, and a domain on Cloudflare DNS (D-016, D-032)
- Privacy policy and terms (D-022)
- Gallery clips with their metadata (D-011)
- Pilot sellers (Q-14)
- His OK on deferring voiceover (D-017)
- Production AI billing (D-004)

## Blocked

- ~~**`gh` CLI login**~~ — **resolved 2026-09-11.** `gh auth login` over the browser flow granted `read:org` and `workflow`. CI has run and passed. Doston still needs to revoke the old setup token, which has no remaining use.
- **AI keys:** `.env` holds `OPENAI_API_KEY`, Doston's key for development (D-029). **The variable was renamed from `OPEN_AI_API_KEY` in P0 (D-041)**, with the value carried over; it is the name the OpenAI SDK reads by default. It is optional in the env schema, so CI and a fresh checkout boot without it. The P1 comparison also needs a Claude (Anthropic) key and a Gemini key; without them, P1 compares OpenAI models only. `.env` is git-ignored. Production billing moves to Jakhongir before launch (D-004).
