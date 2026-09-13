          # PLAN — phase roadmap

**Status: ACTIVE.** Every open question is answered and the design spec is approved (D-036 to D-038). P0 is built and awaiting Doston's review.

How phases work:

1. Before a phase starts, write its detailed plan to `docs/superpowers/plans/YYYY-MM-DD-phase-N-<name>.md` (using the writing-plans skill).
2. Doston reviews it, we discuss, he approves, and only then does code start.
3. Build one part at a time, test-first where logic matters, stopping for review after each part.
4. A phase is done only when its exit check passes with real output, not assumed.
5. Update `docs/PROGRESS.md` at the end of every step.

---

## Phases

| # | Phase | Repo | Goal | Exit check |
|---|---|---|---|---|
| **P0** ✅ | Foundations | api | The api repo builds. Lint, typecheck and tests run. Docker-compose dev stack (Postgres, Redis). zod-validated env. `/health`. Generated `openapi.json`. Pre-commit hook and CI. **Api only:** this row once said "both repos" and included a web shell, which contradicts D-026 (no UI before the P1 go/no-go). Corrected 2026-09-11. | `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check` clean; `/health/ready` green in dev and in the container |
| **P1** ✅ | AI core + real-world test | api | Provider interface. One merged `AD_DIRECTOR_SYSTEM_PROMPT_V2` (resolves C-1 to C-4). Strict output schema. Deterministic validators (Veo token limit, timeline, placeholders, capability, language). A CLI `generate` script. The 7 fixtures from source 01 §49. | **Closed 2026-09-12 (D-055).** Fixtures pass the §51 rubric offline. The ten-product pilot was not run: one real product gave one usable video from two prompts, and Doston closed the phase on that. |
| **P2** ✅ | Accounts & uploads | api (+ web sign-in) | Sign-in. Users, projects, product assets. Upload validation (signature, bytes, pixels), metadata stripping, a 2048 px reference copy, a model-input copy, private storage, ownership checks. | Ownership tests: user A can't read, overwrite, generate from, or delete user B's data |
| **P3** ✅ | Credits & orders | api | Ledger, packs, `credit_orders`, `confirm_credit_order`, owner grants, balance. Clients can never write the ledger. Owner-only `/api/owner/*` endpoints and the owner audit log (D-037). | Tests: double confirm credits once; a user can't confirm their own order; balance always matches the ledger |
| **P4** ✅ | Generation pipeline | api | Job states (queued, running, ready, needs_input, refused, failed). Reserve → AI call → validate (≤1 repair) → persist → debit. Lease and recovery, polling endpoint, rate limits, daily spend cap. | Tests: one credit with two concurrent jobs gives one success; success survives a disconnect; a late success can't race a refund |
| **P5** ✅ | Studio UI | web | Hero, 3-step wizard, inline result, copy with a fallback, TXT export, Flow handoff, history drawer, credits and order screens, every Uzbek error state. The owner `/admin` panel: orders, grants, settings, read-only users, generations and spend (D-037). | **Closed 2026-09-12 (D-086).** Full flow driven in Playwright at 1440, 390 and 360: 33 assertions, plus 54 unit tests. The whole path also walked by hand against the running stack, which found the WEB_ORIGIN defect and four UI defects. |
| **P6** ✅ | Gallery | both | Example content config, video hosting that uses no database egress (R2 or static), posters and lazy loading, prompt sheet, copy, inspiration presets. | **Closed 2026-09-13 (D-087, D-088).** Signed out over real HTTP and in Playwright at 1440, 390 and 360. Isolation asserted on the bytes handed to the provider: mis-wiring one field fails 8 assertions. Content is curated but **unpublished** — each example needs its Flow model and mode from Doston. |
| **P7** | Hardening | both | Security review, backups with a rehearsed restore, abuse limits, analytics events, privacy and terms text, project deletion. | `/security-review` findings fixed; restore from backup rehearsed once |
| **P8** | Launch & pilot | both | Cloudflare Tunnel (or a VPS with Caddy, if we switch; D-032), domain on Cloudflare DNS, deploy, and a 10–15 seller pilot run from the checklist in source 01 §53. | Pilot results recorded in `docs/PROGRESS.md` |

## Branches

**P5 is ✅, closed 2026-09-12 (D-086).** This paragraph used to say "P5 is ◐, not ✅", written before the phase closed and left contradicting both the table above and D-086. Corrected 2026-09-13. What D-082 still blocks is the *credits and order screens*, not P5's exit check: `GET /api/packs` returns `[]` until Jakhongir prices a pack.

**P6 is ✅, closed 2026-09-13.** Both halves merged: api `cb57ce9`, web `c0a4697`. `p5-studio-ui` merged to the web repo's `main` first, which is what let Part B pin its client to a closed contract.

Each phase is built on its own branch, `p<n>-<short-slug>` taken from the phase title above, cut from `main` before the first task — never on the previous phase's branch. It merges to `main` once the phase's exit check passes and Doston has reviewed it (D-070). P3 was `p3-credits-orders`; P4 gets `p4-generation-pipeline`.

## Recommended order

`P0 → P1 → go/no-go on video quality → P2 → P3 → P4 → P5 → P6 → P7 → P8`

- P1 comes before any product UI so that we learn early whether the videos are good enough. This depends on Q-11.
- No web work starts before the P1 go/no-go (D-026). After the go, the frontend session (D-025) builds P5 and P6 in parallel with the backend's P2–P4, feature by feature, as each API contract is fixed (see T-04).

## Rough size

About 3–4 weeks of focused work. This is an estimate made before the detailed plans exist; each phase plan will re-estimate.
