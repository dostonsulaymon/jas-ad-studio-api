# PROGRESS

Where the project stands, what is next, and what is blocked. Updated at the end of every step. Decisions live in `/DECISIONS.md`. The roadmap lives in `docs/PLAN.md`.

**Last updated:** 2026-09-12

## Resume here

*A new session starts here. Keep this block current at the end of every step (D-018).*

| | |
|---|---|
| Phase | **P0, P1 and P1b all closed.** Everything is merged to `main`, pushed, CI green. |
| Active plan | None. **P2's plan is not written** — write it before any P2 code (project rule 2). |
| Doing now | Nothing. Session ended 2026-09-12 with P1b verified in Flow. |
| Next | Write the P2 plan (accounts and uploads) in `docs/superpowers/plans/`, Doston reviews, then build. |
| Last verified state | 2026-09-12: 253 tests, lint, typecheck, build and `openapi:check` all clean on `main`. Three Flow videos judged: 2 of 3 pass (D-060) |

### Two things the next session should pick up

1. **Which format produced `car1`?** Only Doston knows. If it was `high-energy`, fast cutting cost no fidelity and D-057 is validated. If it was `product-film`, the energetic format is still untested in Flow. Ask before assuming.
2. **`lifestyle-story` invents interiors** (D-060). The format's premise — a person using the product — invites exactly what the product lock forbids, for any product whose inside is not visible in the reference. Fixable in `src/ai/formats/formats.ts`, no prompt change needed.

## Current position

| | |
|---|---|
| Phase | P0, P1, P1b complete. P2 not started |
| Code | api repo on `main`: NestJS api + worker, the AI core, four creative formats, the CLI harness and the test tooling. No HTTP product endpoints, no database tables, no accounts, no credits, no uploads |
| Repos | `github.com/dostonsulaymon/jas-ad-studio-api` and `…/jas-ad-studio-web` (untouched, D-026) |
| Decisions | D-001 to D-060 |
| Tests | 253 |
| Live AI spend, whole project | about $6 |

## 2026-09-12 — P1b: creative formats, and the Flow test that found their limit

**The problem.** Ten videos across five product categories all came out in one shape. Measured: 8 of 9 prompts carried the identical 17 sections in identical order (D-056).

**Two causes, one of them mine.** D-048 had made the seventeen sections mandatory *in fixed order* to force depth after the prompts came out too short. It worked and it flattened everything; the trade was never stated at the time. And high-energy camera work was gated on a style none of the ten used.

**The deeper cause was a source conflict nobody had recorded.** Source 01 §25 states *"one dominant camera move per beat"* and *"do not stack whip pans, crash zooms"* as unconditional rules; source 02's HIGH-ENERGY COMMERCIAL MODE allows exactly those. Prohibitions beat permissions, so the calm reading always won. Logged as **C-6** and resolved by **D-057**: §25 was protecting two different things in one sentence — product legibility, which is now unconditional in every format, and pacing, which belongs to the format. A whip pan does not endanger a product; revealing an invented sole does.

**Built (D-058).** A creative format is a versioned config entry carrying its own section list *and order*, beat count, shot-length range, camera and transition vocabulary, and an energy level. `AD_DIRECTOR_SYSTEM_PROMPT_V2` no longer names a single section — a test enforces that. Four formats ship, mapped from the `style` the seller already picks, so no brief changes. Every format opens with the same two fidelity sections, and an unmapped style falls back to restrained rather than silently gaining permission to whip-pan a product.

Verified on one car photo: `product-film` wrote 17 sections in 3 beats, `high-energy` 14 in 4, `lifestyle-story` 15, `ugc-authentic` 12 — 1,533 to 2,321 words. Genuinely different shapes, not one skeleton with different adjectives.

**Tooling (D-059).** Doston asked whether generation could be automated. Veo 3.1 *is* available through the Gemini API, but it bills per second — $32–$60 for ten clips against a Flow subscription already paid for. Scripting Flow's browser would cost nothing extra but risks his Google account. Neither built. Instead: `pnpm p1:pack` lays out a folder per product with the photo and the prompt as bare text, and `pnpm p1:check` turns every video dropped into those folders into one comparison sheet — reference photo beside six timestamped frames. The expensive part was never the clicking; it was comparing frames by hand.

**Tested in Flow (D-060): 2 of 3 pass.** `ugc-authentic` and one unconfirmed format held the car perfectly. **`lifestyle-story` failed** — a person opens the driver's door and a complete interior appears that the reference never established. The prompt forbade it three separate times. That makes it a conflict inside the format rather than a prompt weakness: its premise is a person using the product, and for a car that means opening a door. It will recur for any product whose inside is not visible in one exterior photo.

**253 tests. About $6 of live AI spend across the whole project.**

## 2026-09-12 — first real product through the whole chain, and P1 closed

**A real seller's product, end to end.** Beige knit sneakers from shoptextile.uz: photo → our prompt → Google Flow → a watchable advertisement. Doston generated two videos from two models' prompts and I compared extracted frames against the reference photo.

| Prompt from | Verdict | Why |
|---|---|---|
| **`gpt-5.5`** | **usable** | silhouette, colour, sole and heel tab held; no invented branding; survived being worn and walked in. Knit read coarser than the reference, but recognisably the same shoe |
| `gpt-5.6-terra` | **not usable** | added a ribbed webbing strap across the midfoot that the real shoe does not have, and turned the fine knit into a chunky crochet |

The failure is the useful kind — specific and diagnosable. No logo was invented, which is the worst outcome and it did not happen. But an added strap is an invented component, which source 01 §25 forbids and D-019 counts as a fail. Doston: *"I guess it was too smart for such cases."* The larger model elaborated past its reference, which confirms D-052 — bigger is not automatically better for a fidelity task.

**One lesson neither prompt could have prevented:** both videos are 10 seconds, but the brief said 8, so the shot plan was timed to 8 and Flow had two unscripted seconds to fill. The duration the seller picks in Flow must be the duration they enter in the wizard. That is a P5 UI requirement, not a prompt problem (D-054).

**P1 is closed (D-055)** on Doston's decision — "phase one is close it now, no more codes" — rather than by D-019's ten-product measurement. One product was tested, not ten. The record says so plainly: the approach is proven on real input, but the wider gate was not run. `pnpm p1:handoff` remains available whenever Jakhongir wants it.

**Total live AI spend for the whole phase: about $2.**

## 2026-09-11 — P1 Parts 8b and 9 prepared and handed off

Both parts need a person with Google Flow open. Everything that could be built for them is built.

`pnpm p1:handoff <model> <cap> <product dirs...>` writes **`out/flow-pilot.md`**: the same products at 300 / 500 / 700 words, each prompt in a copy-paste block with its Uzbek shot plan and a blank verdict line. It opens with how to run it, what "usable" means (D-019's wording), and the reminder that the app writes prompts while Flow makes the video and nothing touches Google credits automatically. A 3-product pack costs about $0.03 and is generated: 8 videos to judge.

**What is still owed by a human, and by whom:**

| Who | What | Blocks |
|---|---|---|
| Jakhongir | Which Flow mode, and its real durations, aspect ratios and reference rules (D-013) | The target config stays `provisional` |
| Jakhongir | Whether Flow's paste box truncates a long prompt | Nothing now — prompts run 220–350 words, far under any plausible limit |
| Jakhongir or Doston | Run the 8b pilot and pick the prompt length | The `recommendedWords` setting |
| Jakhongir | ~10 real products, mixed categories | The D-019 go/no-go, and therefore the whole phase |

The truncation question turned out to matter less than the plan feared: the model produces 220–350 word prompts whatever it is asked for, so the 1,024-token ceiling is nowhere near binding.

## P1 status — what is done and what is not

**Built, tested and verified:** target config · the output contract, the brief schema and the trusted envelope · the deterministic validators · the merged system prompt V2 · the provider interface and OpenAI adapter · the repair path with its spend cap · the CLI harness · the seven §49 safety fixtures replayed offline · the offline sweep.

**229 tests. Total live spend across every run in the phase: $0.28.**

**Not done, and not doable in code:** the Flow pilot (8b) and the go/no-go (9). P1's exit criterion is "at least 6 of 10 real products give a usable Flow video" — that is a judgement about videos, made by a person, on products we do not have.

**The one finding that could change the product:** `gpt-4.1-mini` saturates at 250–330 word prompts no matter what length it is asked for. Source 02 specifies 500–1,000 words of production-brief depth. Either a larger model is needed — raising cost per package, which D-029's criterion weighs — or source 02's depth expectation is revised against what actually makes good video. Part 8b is where that gets decided, and it needs eyes on real Flow output, not more word counts.

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
