# P8 — Hardening (short plan)

**Status:** approved by Doston ("Start p8 i approve", 2026-09-13), in scope as proposed after P7's close: PLAN's P8 row plus D-097's five gaps. Kept to one page at his request.
**Branch:** `p8-hardening` (cut from `main` at `c8e95fa`). **Exit check (PLAN):** security findings fixed, a backup restored once, all tests green.

**Where the data really is:** the live site's database is the Docker container `jas-ad-studio-dev-postgres-1` (volume `jas-ad-studio-dev_postgres-data-dev`), plus `storage/photos` and `storage/gallery` (24 MB). Nothing backs any of it up today.

## Parts, in order (each ends with a short report; Doston says when to commit)

| # | Part | What gets built | Gate it touches |
|---|---|---|---|
| 1 | **Provenance and pricing** (D-097 gaps 1–3) | The worker writes `generations.prompt_version` (the value exists and is dropped). `generations.format_id` records the format each generation used. Real `gpt-5.5` rates in `cost.ts`, so costs and the spend cap stop using the inflated fallback | schema: one nullable column |
| 2 | **Backups with a rehearsed restore** | `tools/backup.sh`: nightly `pg_dump -Fc` of the live database plus a tarball of `storage/`, kept 14 days in `~/backups/jas-ad-studio/` (outside the repo), run from Doston's user crontab. `tools/restore-check.sh` restores the newest dump into a throwaway database and compares row counts. Runbook in `docs/RUNBOOK-backups.md` | installs a cron entry |
| 3 | **Deleting a project deletes it** (D-021) | Project delete also removes its photo files and asset rows and its packages. The `generations` and ledger rows stay, as the money and cost record. v2's privacy copy is updated to match | deletes data, by design |
| 4 | **Abuse limits** (spec §10) | `UPLOADS_PER_HOUR_LIMIT` per user on photo uploads (§10 names it; it does not exist) | none |
| 5 | **Our own event log** (spec §4 `events`, source 01 §37) | An `events` table and a small writer: sign-in, project created or deleted, generation requested or settled (status only), order created, confirmed or rejected. Never prompts, briefs or images | schema: one table |
| 6 | **Two P7 leftovers** | `lifestyle-story` gains D-060's interaction boundary (no opening doors, lids or cases the photo never showed). v2's spend-cap message stops saying "today"; the cap is a rolling 24 hours | AI format config |
| 7 | **Security review** | A pass over spec §10: cookie flags, CSRF, security headers, upload validation, log redaction, secrets, owner guards, and `pnpm audit`. Findings fixed and listed in PROGRESS | none |

## Not in P8, blocked on someone else

- **Privacy policy and terms text** is Jakhongir's (D-022). v2 keeps the interim privacy page; a terms page is added once his text exists.
- **Where production runs** (D-027: Doston's machine for now). Backups go to a local folder; an off-machine copy is Doston's call.
