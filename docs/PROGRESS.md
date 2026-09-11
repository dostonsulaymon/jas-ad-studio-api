# PROGRESS

Where the project stands, what is next, and what is blocked. Updated at the end of every step. Decisions live in `/DECISIONS.md`. The roadmap lives in `docs/PLAN.md`.

**Last updated:** 2026-09-11

## Resume here

*A new session starts here. Keep this block current at the end of every step (D-018).*

| | |
|---|---|
| Phase | **P1 planning.** P0 is complete: committed on `p0-foundations`, pushed, CI green, not yet merged to `main`. |
| Active plan | `docs/superpowers/plans/2026-09-11-phase-1-ai-core.md` — approved, Part 1 in progress. P0's plan is complete and closed. |
| Doing now | P1 plan approved. Building Part 1 (the video target config). Part 0's four questions are outstanding with Jakhongir, so the target's values ship provisional until he confirms them. |
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

## 2026-09-11 — P1 plan drafted

`docs/superpowers/plans/2026-09-11-phase-1-ai-core.md`. Written after reading source 01 §25, §26, §27, §28, §29, §49, §50, §51, source 02 in full, and D-012, D-013, D-017, D-019, D-029.

**Shape:** nine parts, no HTTP and no database. Target config → output schema → deterministic validators → the merged system prompt V2 → provider interface and OpenAI adapter → the CLI harness → the seven safety fixtures → the live comparison run → Jakhongir's go/no-go. Only Parts 8 and 9 spend money; everything before them runs against a fake provider.

**The central problem it resolves:** source 01 §25 asks for 180–350 word prompts, source 02 asks for 500–1,000, and Veo 3.1's 1,024-token ceiling (≈700 English words) cannot hold source 02's upper range at all. D-012 already settled the principle — no numbers in the system prompt, everything from the target config — and P1 settles the actual values by experiment: word count at ~300/500/650 and beats at 2/3/4, on the same products, judged in Flow.

**Three open questions are stated in the plan and block the parts that depend on them:**
- **Q-P1-1** how to enforce Veo's token ceiling when its tokenizer is not published. Recommendation: a conservative word and character ceiling named `maxWords`, never `maxTokens`, with `sourceTokenLimit` documenting where the figure came from.
- **Q-P1-2** whether to write Claude and Gemini adapters with no keys to test them. Recommendation: interface plus the OpenAI adapter only, with the seam proven by a fake adapter; record honestly that it was a one-provider comparison if no other keys arrive.
- **Q-P1-3** the live spend cap. Recommendation: the CLI refuses to start without `--max-spend-usd`, default $5 for a fixture sweep.

New dependencies proposed under the standing gate: `openai`, `sharp`, and possibly a tokenizer depending on Q-P1-1.

Nothing is built yet. No code, no live AI call, no spend.

## 2026-09-11 — P1 plan reviewed and revised

A review agent checked the draft against source 01 §25–§52, source 02, the design spec and the locked decisions. It found real problems, two of them by running things rather than reasoning about them.

**Caught by experiment:**
- A module laid out as `src/ai/schema/` **fails lint**. That directory does not match the `schema` boundaries element (which is `src/*/db/**`), so it falls through to `module`, and `port → module` is disallowed — and CI runs lint before tests. The output contract now lives in `src/ai/public/`, which is also where D-031 says the single source of truth belongs. No directory is named `schema/`; the word already means something else in the lint config.
- **zod v4's `toJSONSchema` emits keywords OpenAI's strict Structured Outputs rejects** (`maxItems`, `maxLength`), and strict mode also forbids `.optional()` and requires `additionalProperties: false` throughout. The plan now has a tested downgrade step, and states the consequence plainly: bounds are then enforced only by our own zod parse, so a violation becomes a repair call rather than a provider-side rejection.

**Locked decisions I was overturning without saying so:**
- Q-P1-1's word-ceiling recommendation contradicts D-012, spec §5 and BRIEF C-4, all of which say a **token** ceiling is enforced by validators. It is a standing-gate change and is now raised as one rather than presented as a design preference.
- D-043 already handled the D-029 provider question correctly.

**Requirements the draft missed:**
- Source 01 §26's trusted-metadata rule was absent entirely. The model must not author its own provenance; a server-stamped envelope now carries prompt version, model, target, config version, request id and usage, and everything downstream reads from it. A validator checks the model's echoed target against the requested one — a model renegotiating its own duration is a §51 hard failure.
- The target config had no `version` field despite being called versioned.
- §50's "do not send voiceover or overlays" was unvalidated, which is the one place D-017 could silently break.
- `OPENAI_MODEL` and `store: false` (source 01 §27) were missing.
- The repair path left four behaviours undefined, one of them a money bug: the spend check was post-call, and the OpenAI SDK's default `maxRetries: 2` means one "call" is silently up to three billed requests.
- Fixture recording could leak the `Authorization` header through a serialized SDK error, and fixture photos would carry EXIF into git.
- §49's "clothing/talent adapts to category" was dropped, and "gallery inspiration cannot override reference identity" was asserted with no fixture that could exercise it.

**Ordering fixed:** the first live call moved from Part 8 to a new **Part 5b** — one capped $0.10 smoke call right after the adapter, which de-risks Parts 2, 5, 6 and 7 at once and measures the real per-call cost the spend cap is computed from. Part 8 split into 8a (offline sweep, no quality conclusions) and 8b (a 9-video Flow pilot that actually picks the config) — word count and validator pass cannot tell you which prompt makes a better video.

**New Part 0:** four things from Jakhongir before any code. Which Flow mode and its real durations, aspect ratios and reference rules (D-013 says his test runs confirm these); whether Flow's paste box truncates a 700-word prompt, which nobody has tested and the whole length premise rests on; his Flow generation quota, since Part 8b and Part 9 need roughly 20–40 videos on **his** Google credits; and the ~10 pilot products, which are not on his owed list.

Nothing built. No code, no live call, no spend.

## 2026-09-11 — P1 open questions answered; plan approved

**Q-P1-1 corrected.** The revised plan proposed dropping the token ceiling for a word ceiling, framed as superseding D-012. Doston pushed back — follow the decisions we made — and he was right. The draft had treated "we cannot call Veo's tokenizer" as "we cannot enforce a token ceiling", which does not follow. D-012 asks the config to carry *maximum prompt tokens **and** words* and for validators to enforce them; it never required Google's own tokenizer.

So D-012 is implemented as written: `maxPromptTokens: 1024` stays, `maxWords` stays, the validator enforces **both**, and the tokens-per-word ratio linking them is measured at p95 across the real corpus in Part 8a instead of guessed. The estimator and its error bound are documented in the config file so the figure is never mistaken for Veo's own count, and Part 0 gets the empirical truth from Flow itself. **No decision superseded, no new entry written.**

**Q-P1-4 answered:** `brief.json` is designed properly now, as a zod schema in the `ai` module's public port, written with P2–P4 and Session B's generated client in mind — not improvised for fixtures and re-decided in P4.

**Q-P1-5 settled inside the plan:** the repair call resends the product images. A cheaper repair that rewrites the prompt without seeing the product is a product-lock risk, and the repair is capped at one either way.

The plan is approved. Part 1 starts. Part 0's four questions are outstanding with Jakhongir, so the target config's values ship marked provisional.

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
