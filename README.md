# JAS Ad Studio — API

The backend for **JAS Ad Studio**. A seller uploads a product photo and a short brief, and gets back a professional English video prompt for Google Flow plus an Uzbek shot plan. This repo handles the AI call, prompt credits and orders, product photo uploads, and the example gallery's content.

**Status: P0 built, under review. No product features yet — the app boots, reports health, and every check runs green.**

## Repositories

| Repo | What it is |
|---|---|
| `jas-ad-studio-api` (this one) | NestJS API and worker. **All planning docs live here.** |
| `jas-ad-studio-web` | Next.js frontend: the one-page studio, the gallery and the wizard. |

## Docs map

| File | Purpose |
|---|---|
| `CLAUDE.md` | How work proceeds, the stack, and the rules that must never be broken |
| `DECISIONS.md` | Every locked decision and why |
| `docs/BRIEF.md` | The product on one page, with the conflicts to resolve |
| `docs/PLAN.md` | The phase roadmap |
| `docs/PROGRESS.md` | Where we are now |
| `docs/OPEN-QUESTIONS.md` | Questions for Doston and Jakhongir |
| `docs/source/` | The owner's product documents |
| `docs/superpowers/specs/` | The approved design spec |
| `docs/superpowers/plans/` | Detailed per-phase plans, each approved before code |

## Getting started

Needs Node 24 (`.nvmrc`), pnpm and Docker.

```bash
nvm use                 # Node 24 — the shell default is older
pnpm install
cp .env.example .env    # then fill in what you need
pnpm infra:up           # dev Postgres on 5437, dev Redis on 6384
pnpm dev                # api on http://127.0.0.1:3040
```

Check it:

```bash
curl http://127.0.0.1:3040/health/live     # {"status":"ok"}
curl http://127.0.0.1:3040/health/ready    # 200 ready, 503 with the failing dependency named
```

`pnpm dev:worker` runs the worker process. It shares the api's wiring and gets its queue
consumers in P4.

## Checks

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check
```

`pnpm install` installs a pre-commit hook (`.githooks/pre-commit`) that runs lint and
typecheck. GitHub Actions runs the whole set on every push (D-034).

## The API contract

`openapi.json` is generated from the running application, never hand-edited. Change a
route or a schema, then:

```bash
pnpm openapi:generate   # rewrite it
pnpm openapi:check      # what CI runs; fails if it is stale
```

The web repo generates its typed client from this file (D-031). It is compiled by
`nest build` rather than run through tsx: esbuild emits no decorator metadata, and
without it Nest's DI fails silently.

## The deployed stack

```bash
export POSTGRES_PASSWORD=...          # no default, on purpose
docker compose --profile app up -d --build
```

Postgres 5436, Redis 6383, api 3041. `api` and `worker` are one image with two
entrypoints. `web` and `cloudflared` join in P5 and P8 (D-033).

## Ports

Every other port on the build machine is taken by another project.

| | dev | deployed |
|---|---|---|
| Postgres | 5437 | 5436 |
| Redis | 6384 | 6383 |
| api | 3040 | 3041 |
