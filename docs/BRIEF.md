# BRIEF

What we are building, for whom, and the known conflicts to resolve. The full requirements live in `docs/source/`. This page is the map, not the territory.

---

## The product in one paragraph

JAS Ad Studio turns a seller's product photo into a professional short video ad **prompt**. The seller uploads one to four photos of the same product, writes a name and a short factual description, and picks a goal, style and format. One AI call studies the photos and returns one ad package:

- an Uzbek concept title and angle
- what must stay identical about the product
- a detailed English prompt for Google Flow (Veo)
- an Uzbek shot plan with timing
- a short Uzbek hook and CTA line (voiceover and overlay text are deferred, D-017)

The seller copies the prompt, opens Google Flow, uploads the same photo, and generates the video there. We never generate, upload to, or automate Flow.

## Who it is for

- **Sellers:** Uzbek small online sellers (Instagram, Telegram, marketplaces), mostly on phones, with no prompt-engineering knowledge.
- **Owner:** Jakhongir. He confirms payments, curates the gallery, and reviews Uzbek copy.

## Core flow

```text
Visitor ──► gallery: watch examples, open and copy their prompts (free, no sign-in)
   │
   ▼
Sign in ──► buy credits (order: pending → owner confirms → +N credits)
   │
   ▼
Studio, step 1: Mahsulot            photos (1 primary + up to 3), name, short description
       step 2: Reklama yo‘nalishi   goal, style, platform, 9:16 or 16:9, optional offer
       step 3: Tekshirish           summary, "uses 1 credit", Reklama promptini tayyorlash
   │
   ▼
Job: reserve 1 credit ──► one multimodal AI call ──► validate (≤1 repair) ──► save ──► debit
         (needs_input / refused / failed: release the credit)
   │
   ▼
Result, inline: concept · product lock · Tayyor prompt (copy / TXT) · Kadrlar rejasi
   │
   ▼
Google Flow’da davom etish ──► the seller pastes the prompt and uploads the same photo in Flow

Project history: reopen, copy, export and edit for free. A new AI version costs 1 credit.
```

## MVP scope

**In:**
- one-page studio: hero, wizard, inline result, gallery, FAQ, history drawer
- sign-in
- credits, packs, and manually confirmed orders
- private photo storage
- the AI package, with server-side validation
- the Flow handoff and TXT export
- the gallery with its "Shu uslubdan foydalanish" inspiration presets
- feedback and basic analytics
- Uzbek error states
- project deletion

**Out:**
- generating or editing video, Flow automation, or unofficial Flow APIs
- subscriptions, or automatic payment checkout at launch
- a marketplace, teams, a public user gallery, a CMS, an admin dashboard, or an AI chat assistant

## Proposed backend modules (to be confirmed in the design spec)

| Module | Owns |
|---|---|
| `auth` | Sign-in, sessions, the current user |
| `projects` | Projects, briefs, versions, deletion |
| `assets` | Photo upload, signature and size checks, metadata stripping, reference and model-input copies, private storage |
| `ai` | Provider interface, versioned system prompt, strict output schema, deterministic validators, capability config |
| `generation` | Jobs and their states, the reserve → call → validate → persist → debit flow, lease and recovery, spend caps |
| `credits` | Ledger, packs, orders, `confirm_credit_order`, owner grants, balance |
| `gallery` | Example metadata, creative presets, prompt text |
| `feedback` | "Did this prompt give you a usable video?" answers and events |

## Conflicts in the sources, to resolve before the AI phase

| # | Build prompt v2 (source 01) | Quality standard (source 02) | Status |
|---|---|---|---|
| C-1 | Prompt 180–350 words | Prompt 500–1,000 words | Resolved, D-012: word range set per video target |
| C-2 | 3 beats: 0–2 / 2–6 / 6–8 s | 4 beats: 0–1.5 / 1.5–4.5 / 4.5–6.5 / 6.5–8 s | Resolved, D-012: beats set per video target |
| C-3 | One camera move per beat, no stacked whip pans or crash zooms | "High-energy mode" allows whip transitions and speed ramps | Resolved, D-012: high-energy moves allowed per target and style |
| C-4 | — | 1,000 words ≈ 1,300 tokens, above **Veo 3.1's 1,024-token text limit** (Google model page, checked 2026-09-11) | Resolved, D-012: each target's token ceiling is enforced by validators |
| C-5 | Suggests Next.js full-stack, Supabase, OpenAI SDK | — | Resolved by D-001 and D-002 |

## Costs (analysis 2026-09-11, estimates, not measured)

- AI: about **1,100 som per paid prompt** (GPT-5.6 terra, spec v2 prompt length, 30% overhead for retries and questions).
- Fixed: about **$7 a month** (VPS + domain, Supabase Free).
- Break-even: **22 prompts a month** at an example price of 5,000 som (not a recommendation).
- Replace these with measured token usage from the first 20 real calls.
- Full analysis and calculator: https://claude.ai/code/artifact/56eddb3d-8d0e-47e8-93e6-beef1a4509a1

## Working protocol

See `CLAUDE.md`, section "How work proceeds here".
