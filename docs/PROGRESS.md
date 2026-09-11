# PROGRESS

Where the project stands, what is next, and what is blocked. Updated at the end of every step. Decisions live in `/DECISIONS.md`. The roadmap lives in `docs/PLAN.md`.

**Last updated:** 2026-09-11

## Resume here

*A new session starts here. Keep this block current at the end of every step (D-018).*

| | |
|---|---|
| Phase | Planning, before P0 |
| Active plan | None yet. The design spec comes first. |
| Doing now | Answering `docs/OPEN-QUESTIONS.md` one question at a time, as pop-up questions in chat. Answered so far: Q-01 to Q-11 → D-008 to D-019; Q-12 → D-020 to D-022; Q-13 → D-023; Q-14 → D-024, D-025; Q-15 → D-027; Q-16 → D-026. Part A done. T-01 → D-028; T-02 → D-029; T-03 → D-030; T-04 → D-031; T-05 → D-032; T-06 → D-033; T-07 → D-034; T-08 → D-035. **Every question is answered.** The design spec has been written and is waiting for Doston's review. |
| Next | Doston reviews `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` (confirm R-1 to R-8) → fixes → write Session B's kickoff prompt → write the P0 plan (writing-plans skill) → review → build |
| Last verified state | Docs only, no code. Both repos are committed and pushed to private GitHub repos (`main`), 2026-09-11 |

## Current position

| | |
|---|---|
| Phase | Planning, before P0 |
| Code | None |
| Repos | Private on GitHub: `github.com/dostonsulaymon/jas-ad-studio-api` and `…/jas-ad-studio-web`. Branch `main`, pushed over SSH |
| Decisions | D-001 to D-035 |
| Open | None. The design choices R-1 to R-8 in the spec are waiting for Doston's review. |

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

The design spec is at `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md`.

## Next

1. Doston reviews the design spec, including the design choices R-1 to R-8 listed at its top.
2. Write Session B's kickoff prompt. It's handed over at the P1 go (D-026).
3. Write the P0 plan with the writing-plans skill, get it reviewed, then build.

## Owed by Jakhongir (not blocking P0 or P1)

- Pack prices (D-009)
- Final name, and a domain on Cloudflare DNS (D-016, D-032)
- Privacy policy and terms (D-022)
- Gallery clips with their metadata (D-011)
- Pilot sellers (Q-14)
- His OK on deferring voiceover (D-017)
- Production AI billing (D-004)

## Blocked

- **`gh` CLI login:** still expired. The token supplied for setup lacks the `read:org` scope, so it could create repos but can't log in. Pushing works over SSH, so this blocks nothing until the GitHub Actions setup in P0 (D-034). Doston revokes that setup token once setup is finished.
- **AI keys:** `jas-ad-studio-api/.env` holds only `OPEN_AI_API_KEY`, Doston's key for development (D-029). The P1 comparison also needs a Claude (Anthropic) key and a Gemini key; without them, P1 compares OpenAI models only. The OpenAI SDK's default variable name is `OPENAI_API_KEY`, so P0's env schema settles the name. `.env` is git-ignored as of 2026-09-11. Production billing moves to Jakhongir before launch (D-004).
