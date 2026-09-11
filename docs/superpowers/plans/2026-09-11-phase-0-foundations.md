# P0 — Foundations (api repo)

**Status:** BUILT and RE-VERIFIED on 2026-09-11, awaiting Doston's review. Nothing is committed.
**Verification report:** https://claude.ai/code/artifact/9e78f1ed-42dc-41b0-b150-d03bc5292788 — the five review tests, with the real output of each.
**Repo:** `jas-ad-studio-api` only
**Built from:** `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` §2, §3, §10, §11 · D-028 to D-035

---

## Scope

P0 gives the api repo a spine: it boots, it validates its own config, it talks to Postgres and Redis, it reports readiness honestly, and every check runs green. **No product tables, no auth, no AI, no endpoints beyond `/health`.**

**The web repo is out of scope.** `docs/PLAN.md`'s P0 row said "both repos" and listed a web shell; D-026 says no UI before the P1 go/no-go, and `DECISIONS.md` wins. Doston confirmed api-only on 2026-09-11. Part 9 fixes the stale PLAN row.

### Not in P0

Any table from spec §4 · auth · credits · the AI module · uploads · the owner panel · Cloudflare Tunnel (P8) · anything in the web repo.

---

## Dependencies added (standing gate)

Every one of these is new. Nothing outside this list gets installed.

| Package | Why | Precedent |
|---|---|---|
| `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `reflect-metadata`, `rxjs` | The framework (D-028) | kitobnarx |
| `@nestjs/config` | Hosts the zod-validated env (spec §3 `config`) | kitobnarx |
| `drizzle-orm`, `pg` | Postgres access (D-028) | kitobnarx |
| `ioredis` | Redis client, and BullMQ's connection (D-030) | kitobnarx |
| `bullmq` | Queue (D-030). Installed in P0, first used in P4 | kitobnarx |
| `zod` v4 | Env, request bodies, AI output (D-031) | kitobnarx |
| `pino`, `pino-http`, `nestjs-pino` | Logging with redaction (spec §10) | kitobnarx |
| `@nestjs/swagger` + `nestjs-zod` | **New pick.** Generates `openapi.json` from the real routes and their zod schemas (D-031) | — |
| dev: `@nestjs/cli`, `@nestjs/schematics`, `@nestjs/testing`, `typescript`, `@types/node`, `@types/pg`, `@swc/core`, `unplugin-swc`, `vitest` | Build and test (D-034) | kitobnarx |
| dev: `eslint`, `typescript-eslint`, `@eslint/js`, `eslint-plugin-boundaries`, `eslint-config-prettier`, `prettier` | Lint, and the module-boundary rule (R-7) | kitobnarx |
| dev: `drizzle-kit` | SQL migration generation (D-028) | kitobnarx |
| dev: `pino-pretty` | Readable dev logs | kitobnarx |

**Pre-commit hook tool (D-034): no dependency.** A committed `.githooks/pre-commit` plus `git config core.hooksPath .githooks`, wired by a `prepare` script. husky and lefthook were the alternatives; both add a package and a postinstall step to do what one tracked shell script does.

**Why `@nestjs/swagger` + `nestjs-zod` over a standalone `zod-to-openapi` registry:** the standalone registry is a second, hand-maintained list of routes that can silently drift from the controllers. `nestjs-zod` derives the document by booting the real Nest app without listening, so a route that exists is in the document and one that doesn't, isn't. With two sessions sharing a contract (D-025, D-031), drift is the exact failure to design out.

---

## Ports

Every port on this machine below is already taken by another project (kitobnarx runs 5434/5435, 6381/6382, 3010). These are free as of 2026-09-11:

| | dev (`docker-compose.dev.yml`) | deployed (`docker-compose.yml`) |
|---|---|---|
| Postgres | 5437 | 5436 |
| Redis | 6384 | 6383 |
| api | 3040 (`pnpm dev`, on the host) | 3041 |

---

## Parts

Each part stops for review. `[ ]` is unchecked until its verification prints the expected output.

### Part 1 — Repo scaffold

- [x] Fix `.gitignore`: a voice transcript was pasted into it. Restore it to secrets + build output + editor files.
- [x] `.nvmrc` = `24` (D-028 says Node 24 LTS; the shell defaults to 22.17.1, and 24.19.0 is installed under nvm).
- [x] `package.json`: `packageManager: pnpm@11.20.0`, `engines.node >=24`, the scripts below.
- [x] `tsconfig.json` / `tsconfig.build.json`: strict, plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.
- [x] `eslint.config.mjs`: `strictTypeChecked` + `eslint-plugin-boundaries` enforcing R-7 — `common` may not import a module; a module may import its own files, its own `db/`, any module's `public/` port, and `common`; nothing else.
- [x] `.prettierrc`, `.dockerignore`, `nest-cli.json`, `pnpm-workspace.yaml`, `vitest.config.ts`, `vitest.setup.ts`.

Scripts: `dev`, `dev:worker`, `build`, `start:api`, `start:worker`, `lint`, `lint:fix`, `format`, `typecheck`, `test`, `test:watch`, `db:generate`, `db:check`, `infra:up`, `infra:down`, `infra:logs`, `openapi:generate`, `openapi:check`, `prepare`.

**Verify:** `pnpm install` succeeds; `node -v` inside the repo reads 24.x.

### Part 2 — Config and logging

- [x] `src/common/config/env.schema.ts` — zod, fails closed. P0 variables only:
      `NODE_ENV`, `PORT`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`, `HEALTH_CHECK_TIMEOUT_MS`,
      `OPENAI_API_KEY` (optional in P0, required from P1).
      **The key is renamed `OPEN_AI_API_KEY` → `OPENAI_API_KEY`**, the OpenAI SDK's own name (Doston approved 2026-09-11; closes the open item in `docs/PROGRESS.md`).
- [x] `src/common/config/config.module.ts` — global, `validate: validateEnv`.
- [x] `src/common/logger/logger.module.ts` — pino, redacting `authorization`, `cookie`, `set-cookie`, `DATABASE_URL`, `*.token`, `*.password`, `*.secret`, `OPENAI_API_KEY`, and the prompt/brief/image fields named in spec §10. `pino-pretty` in development only.
- [x] `.env.example`, values-free, every variable documented.
- [x] Tests: a valid env parses; a missing `DATABASE_URL` throws naming the field; a malformed `REDIS_URL` throws; an out-of-range `PORT` throws.

**Verify:** `pnpm test` — env tests pass.

### Part 3 — Postgres, Redis, migrations

- [x] `src/common/db/tokens.ts`, `database.module.ts` — a `pg` Pool, an `error` handler so a database blip cannot kill the process, closed on shutdown.
- [x] `src/common/db/migration.runner.ts` — a `pg_advisory_lock` so `api` and `worker` booting together serialise instead of racing.
- [x] `src/common/redis/tokens.ts`, `redis.module.ts` — ioredis with `maxRetriesPerRequest: null` (BullMQ needs it), an `error` handler, `quit()` on shutdown.
- [x] `drizzle.config.ts` — schema glob `./src/*/db/schema.ts`, output `./drizzle/migrations`.
- [x] Generate the baseline migration. **P0 invents no tables.** Outcome: with no `src/*/db/schema.ts` files there is no journal, and drizzle's `migrate()` throws on the missing folder. The runner checks for `drizzle/migrations/meta/_journal.json` and logs `No migrations to apply` instead — verified in the boot log. From P2, when real tables exist, that branch stops being taken. No table was invented to work around it.

**Verify:** `pnpm infra:up`; the api boots against it and the migration runner logs "migrations up to date".

### Part 4 — Health and the error shape

- [x] `src/health/` — `GET /health/live` does no I/O (a dependency being down must never get a healthy process killed). `GET /health/ready` checks Postgres and Redis with a per-check timeout, returning 200 / 503.
- [x] `src/common/errors/app.error.ts` — the `DomainError` (4xx, safe to show) / `InfraError` (5xx, never shown) split.
- [x] `src/common/filters/problem-details.filter.ts` — the `{ code, messageKey, details? }` shape from spec §9, with a request id. Provider and internal errors never reach a caller.
- [x] Tests: `live` returns ok with both dependencies down; `ready` is 503 when Postgres is down, 503 when Redis is down, 200 when both are up; a check that hangs is reported down rather than hanging the endpoint; the filter maps a `DomainError` to its status and an unknown throw to a bare 500.

**Verify:** `pnpm test` green, and `curl` against the running api — `/health/live` 200, `/health/ready` 200, then Redis stopped → `/health/ready` 503 naming `redis` as down, then restarted → 200.

### Part 5 — Entrypoints

- [x] `src/app.module.ts` (api), `src/worker.module.ts` (worker = app + future consumers).
- [x] `src/main.api.ts`, `src/main.worker.ts` — one shared image, two entrypoints. Signals handled explicitly, not via `enableShutdownHooks()`, which re-raises and kills the process before the pool drains.
- [x] Global `/api` prefix, excluding `/health` so a container healthcheck needs no prefix (D-032: everything public is under `/api`).
- [x] Test: the app module compiles with its dependencies stubbed.

**Verify:** both processes start and stop cleanly on SIGTERM with no stack trace.

### Part 6 — Docker

- [x] `Dockerfile` — multi-stage on `node:24-bookworm-slim` (Debian, not Alpine: `sharp` arrives in P2 and fights musl), a non-root user, migrations copied into the image.
- [x] `docker-compose.dev.yml` — Postgres and Redis only, on their own project and volumes, ports 5437 / 6384.
- [x] `docker-compose.yml` — `api`, `worker`, `postgres`, `redis`, each with a restart policy and a healthcheck, on ports 5436 / 6383 / 3041. `web` and `cloudflared` are declared as commented placeholders with the phase that fills them in; neither can be built before the web repo exists (D-033, D-026).
- [x] Redis runs with `--maxmemory-policy noeviction`; BullMQ drops delayed jobs otherwise.
- [x] A private `photos` volume declared for P2 (spec §7). Nothing writes to it in P0.

**Verify:** `docker compose --profile app up -d --build` → all four healthy, `/health/ready` green on 3041, then down.

### Part 7 — The API contract

- [x] `src/common/openapi/` — a script that boots the app without listening, builds the document, and writes `openapi.json`.
- [x] `pnpm openapi:generate` writes it; `pnpm openapi:check` regenerates into a temp file and fails on a diff (D-031, and CI runs it).
- [x] `openapi.json` committed, holding the two health routes.

**Verify:** `pnpm openapi:generate` then `pnpm openapi:check` → clean. Hand-edit the file, re-run the check → it fails. Restore.

### Part 8 — Checks (D-034)

- [x] `.githooks/pre-commit` — lint and typecheck, no `--no-verify` escape hatch in the script, wired by `prepare`.
- [x] `.github/workflows/ci.yml` — on push and PR: Node 24, pnpm, Postgres and Redis services, then `lint`, `typecheck`, `test`, `build`, `openapi:check`. **No AI keys in CI** (spec §11: no live AI calls in CI).
- [x] `README.md` — real setup instructions replacing "Not yet".

**Verify:** done — a staged file with a type error was refused, and `git log` confirmed HEAD did not move. CI is **unrun**: `gh auth login` is still blocked, so the workflow has never executed. It is not claimed to pass.

### Part 9 — Exit check

- [x] `pnpm lint && pnpm typecheck && pnpm test && pnpm build` clean from a cold `pnpm install`.
- [x] `/health/ready` green in dev and in the container.
- [x] `docs/PLAN.md`'s P0 row corrected to api-only, pointing at D-026.
- [x] `docs/PROGRESS.md` updated: Resume here, what was verified, the `OPENAI_API_KEY` rename.
- [x] `DECISIONS.md`: new entries for the P0 dependency picks and the ports.
- [x] **Nothing committed.** Doston reviews the working tree first.

---

## Risks

| Risk | Handling |
|---|---|
| The shell's Node is 22.17.1, not 24 | `.nvmrc` pins 24, `engines` enforces it, CI and the image both use 24. Flagged to Doston: `nvm use` is needed per shell. |
| Drizzle with zero schema files | P0 invents no tables to work around it. Whatever it does is recorded in Part 3 and PROGRESS. |
| CI cannot be verified | `gh auth login` is blocked on a missing `read:org` scope. The workflow ships unrun, and PROGRESS says so plainly rather than claiming it passes. |
| `eslint-plugin-boundaries` with no modules yet | `health` is the first module, so the rule has something real to enforce from day one. |
