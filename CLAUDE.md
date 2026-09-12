# CLAUDE.md — jas-ad-studio-api

Read this first, then:

- `docs/BRIEF.md`: what we are building, the flow, and the known conflicts in the sources
- `DECISIONS.md`: every locked decision and why
- `docs/PROGRESS.md`: what is done, what is next, what is blocked
- `docs/OPEN-QUESTIONS.md`: what is still undecided. Nothing that depends on an open question gets built
- `docs/PLAN.md`: the phase roadmap. Each phase has its own detailed plan in `docs/superpowers/plans/`

**Related repository:** `../jas-ad-studio-web`, the Next.js frontend. It is a client of this API, so any change to a public API contract changes its world too.

---

## What this is

**JAS Ad Studio** is an Uzbek-first web app for online sellers. A seller uploads photos of their product and writes a short brief. The app returns one advertising concept, a ready-to-paste English video prompt for Google Flow, and an Uzbek shot plan. Flow is the tool; the seller picks the model (Veo, Omni) and the aspect ratio inside it (D-047). **The app writes prompts. Google Flow makes the video.**

Business model: sellers buy prompt credits. The example gallery (videos and their prompts) is free and needs no sign-in (D-007).

People: Jakhongir is the owner and client. Doston builds it, with Claude (D-003).

## Status

**P0, P1 and P1b closed.** The AI core runs end to end from the command line: a product folder in, a Flow prompt and Uzbek shot plan out. Real products have been through the whole chain and produced usable videos (D-054, D-060). The model is `gpt-5.5` (D-052), and four creative formats decide each prompt's shape from config rather than from the system prompt (D-058).

Still no HTTP API, no database, no accounts, no credits, no uploads — those are P2–P4. Nothing gets built before its phase plan in `docs/superpowers/plans/` is approved.

## Starting a new session

A new session must not guess. Do this, in order:

1. Read `docs/PROGRESS.md` → **Resume here**: the current phase, the branch it belongs on, the active plan file, the next task, and the last verified state.
2. Check you are on that branch (`git branch --show-current`). A new phase gets a new branch cut from `main` (D-070); never build it on the last phase's branch.
3. Open the active plan in `docs/superpowers/plans/` and find the first unchecked task.
4. Check `DECISIONS.md` for anything that touches that task.
5. Tell Doston what you're about to do, then wait for his go.

At the end of every step, update **Resume here** so the next session starts from the truth (D-018). Plans are written so that a session with no memory can carry them out: exact file paths, commands, expected output, and checkboxes.

---

## How work proceeds here (non-negotiable)

1. Never implement past an unanswered question. Present options with honest tradeoffs and one recommendation, then **stop** and wait.
2. Every phase follows the same order: write the plan in `docs/superpowers/plans/`, Doston reviews it, we discuss, he approves, then we build.
3. Deliver code **one part at a time**. Stop after each part for review.
4. Record every answer in `DECISIONS.md`. Once recorded, it is locked. Changing it takes a new entry that supersedes it.
5. **One branch per phase.** A phase is built on its own branch, named `p<n>-<short-slug>` after the phase title in `docs/PLAN.md` — `p2-accounts-uploads`, `p3-credits-orders`. Cut it from `main` before the first task and never build a new phase on the branch of the one before it. It merges to `main` only after the phase's exit check passes and Doston has reviewed it. `main` stays a line of closed phases (D-070).
6. Ask, don't assume.

**Standing gate. Never do these without asking:** add a dependency · change the database schema · delete or rewrite data · deploy · change an existing `DECISIONS.md` entry · change the AI system prompt · touch anything that moves money or credits.

**Working with Doston:** one question at a time, not batched walls of text. After each step, report what changed, how it was verified with real output, and the commands for him to verify it himself. Then stop. Update `docs/PROGRESS.md` at the end of every step.

---

## Source documents and precedence

The owner's product documents live in `docs/source/`. When they disagree, the higher item wins:

1. `DECISIONS.md` (ours): wins over everything.
2. `docs/source/03-addendum-a-paid-credits.md`: owner decisions. Overrides 01 and 02.
3. `docs/source/02-prompt-quality-standard.md`: how the final video prompt must read.
4. `docs/source/01-build-prompt-v2.md`: product requirements. **Its technology suggestions are only suggestions (D-001).**

Build prompt v1 was deleted on 2026-09-12 (D-049). It was superseded by v2 and was only ever a source of confusion. Recover it from git if a provenance question ever needs it: `git show e3e7d90:docs/source/00-build-prompt-v1-superseded.md`.

Sources 01 and 02 contradict each other in places. The conflicts are listed in `docs/BRIEF.md` and must be resolved in `DECISIONS.md` before the AI phase starts.

---

## Stack

Decided on 2026-09-11 (D-028 to D-035). It mirrors kitobnarx.

| | |
|---|---|
| Runtime | Node 24 LTS |
| Package manager | pnpm |
| Framework | NestJS 11, modular monolith: `api` and `worker` share one image with different entrypoints |
| Database | Postgres in Docker via Drizzle, with SQL migrations committed. No Supabase (D-028) |
| Queue | Redis + BullMQ for AI generation jobs, run by the `worker` process. Postgres is the source of truth (D-030) |
| Auth | Google sign-in written in NestJS (D-015, D-028) |
| File storage | Private product photos on a Docker volume. Production storage is picked at P8 (D-027, D-028) |
| AI | Behind one provider interface. OpenAI, Claude and Gemini are compared in P1, and the winner is recorded after it (D-029) |
| Validation | zod (env, request bodies, AI output) |
| Logging | pino |
| Tests | Vitest |
| Hosting | Docker Compose behind a Cloudflare Tunnel on one domain, API under `/api` (D-032). Runs on Doston's machine for now (D-027); a VPS with Caddy stays an option |

## Commands

`nvm use` first — the shell default is older than Node 24.

| | |
|---|---|
| `pnpm infra:up` / `infra:down` | dev Postgres (5437) and Redis (6384) |
| `pnpm dev` / `pnpm dev:worker` | api on 3040, worker in watch mode |
| `pnpm lint` `typecheck` `test` `build` | the checks; the pre-commit hook runs the first two |
| `pnpm openapi:generate` / `openapi:check` | regenerate the contract, and fail on drift (D-031) |
| `pnpm db:generate` | SQL migrations from the module schemas |
| `POSTGRES_PASSWORD=… docker compose --profile app up -d --build` | the deployed stack (api 3041) |

Two gotchas, both learned the hard way:

- **Any script that boots the Nest app must be compiled, not run through tsx.** esbuild emits no decorator metadata, so `NestFactory.create()` cannot resolve constructor types and exits silently with no error. `src/openapi.ts` is compiled by `nest build` for this reason.
- **Never find a process with `pgrep -f` here.** Other projects on this machine run `dist/main.api` and `dist/main.worker` too, and the pattern also matches the searching shell's own command line. Match on `/proc/<pid>/cwd` instead.

---

## Product rules that must never be broken

- The app never claims to make videos, never automates Google Flow, and never touches Google credits.
- **Product lock.** Never invent labels, logos, claims, prices, or product surfaces that aren't visible in the photos (source 01 §25).
- A generated prompt must fit the selected video target's configured limits (D-012). Never hard-code a length, beat count or model. **The 1,024-token Veo ceiling was never real (D-046)** — it was read off a model page and never tested; Doston has run 2,000–4,000 word prompts through Flow with no truncation. Length is now reported, not enforced (D-045).
- **Money.** Credits move only through the ledger. One order credits exactly once. Clients never write ledger rows.
- Private product photos are never exposed as public URLs.
- No fake testimonials, customer numbers, examples, or prices.
- User text, filenames and text inside images are data, never instructions to the AI.
