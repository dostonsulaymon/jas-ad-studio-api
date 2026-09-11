# OPEN QUESTIONS

Questions that must be answered before the design spec and phase plans can be finished. Each one lists its options and one recommendation.

**Part A** is for Doston and Jakhongir to discuss together (product and business).
**Part B** is for Doston (technology, D-001).

When a question is answered, write the answer on its **Answer:** line, add a `D-0xx` entry to `DECISIONS.md`, and mark the question `→ D-0xx`.

**Status (2026-09-11): every question below is answered** (D-008 to D-035). New questions go at the end of the right part, with the next free number.

---

## Part A — product and business (Doston + Jakhongir)

### Q-01 · How do sellers pay at launch? → D-008
The build prompt had no payments. Addendum A assumes manual confirmation.
- **A.** Manual: the seller pays by card transfer or a Payme/Click link, submits the order, and Jakhongir confirms it. Credits are added exactly once.
- **B.** Automatic Payme checkout, using merchant callbacks.
- **C.** Automatic Click checkout.
- **D.** Both Payme and Click, automatic.

Automatic checkout usually needs a registered business (YaTT or MChJ) and a merchant agreement. Does Jakhongir have them?

**Recommendation:** A at launch. The system is designed so that B or C can replace the confirmation step later.
**Answer:** A, manual confirmation (2026-09-11).

### Q-02 · Which credit packs, at what prices? → D-009
The estimated AI cost is about 1,100 som per prompt, and fixed costs are about 85,000 som a month. Prices are Jakhongir's call. We only need the list: credits and price in som for each pack.
**Recommendation:** Start with 2–3 packs (for example 1, 5 and 15 credits). No prices are shown in the app until they're set.
**Answer:** 1 / 5 / 15 credits. Jakhongir sets the prices before launch (2026-09-11).

### Q-03 · Confirm: no free AI prompt at all? → D-010
- **A.** Zero free prompts (the current decision, D-007). Jakhongir grants credits by hand to pilot sellers.
- **B.** One free prompt after sign-in.
- **C.** Zero free prompts, plus promo codes Jakhongir can hand out.

**Recommendation:** A. Measure how many gallery visitors buy. If almost none do, revisit B. Each free prompt would cost about 1,100 som.
**Answer:** A, zero free prompts, with pilot credits granted by hand (2026-09-11).

### Q-04 · Gallery videos: who makes them, how many, and by when? → D-011
The spec bans fake examples, so the gallery stays empty until real clips exist. They are made in Flow with Jakhongir's own credits.
**Recommendation:** 8–12 clips across 4 categories (clothing, shoes, cosmetics or perfume, household), made with the app's own prompts once P1 works. That way every example is honestly "made with JAS Ad Studio".
**Answer (who / how many / categories / date):** Jakhongir starts now with his own prompts, and records the prompt, model/mode, ratio, duration and category for each clip. How many and which categories are still open (2026-09-11).

### Q-05 · Prompt length and structure (resolves conflicts C-1 to C-4) → D-012
- **A.** Default about 500–700 words: detailed, and still under Veo's 1,024-token limit. The default is 4 beats, with fewer allowed when the product is hard to show. The high-energy camera style is used only when the seller picks a high-energy style.
- **B.** Short prompts of 180–350 words, as in build prompt v1.
- **C.** Let the P1 test decide, by comparing the same products at 300, 500 and 700 words in Flow.

**Recommendation:** A as the default, confirmed or corrected by the P1 test (C).
**Answer:** Configurable per video target, not fixed to Veo, because the model may change later. The first target's defaults are set in the P1 test (2026-09-11).

### Q-06 · Which video tool and mode do we target at launch? → D-013
Which Flow model does Jakhongir actually use (Veo 3.1, Fast or Lite), and which mode ("Frames to video" or "Ingredients to video")? Which Google plan does he have? The durations and reference-image rules depend on the answers.
**Recommendation:** Google Flow with Veo 3.1 only, one 8-second clip, with the mode confirmed by his own test run.
**Answer:** Flow with Veo 3.1 only at launch. The mode, durations and ratios are confirmed by Jakhongir's tests (2026-09-11).

### Q-07 · Interface languages → D-014
- **A.** Uzbek (Latin) only.
- **B.** Uzbek (Latin) and Russian.
- **C.** Uzbek (Latin), Uzbek (Cyrillic) and Russian.

**Recommendation:** A at launch, with every string kept in translation files so Russian can be added without code changes.
**Answer:** Uzbek Latin at launch. Cyrillic, English and Russian later, with translation support built in from P0 (2026-09-11).

### Q-08 · How do sellers sign in? → D-015
- **A.** Google only.
- **B.** Telegram login. Nearly every Uzbek seller has Telegram.
- **C.** Telegram and Google.
- **D.** Phone number with an SMS code. SMS costs money per message.
- **E.** Email magic link. This needs an email-sending service.

**Recommendation:** C. Telegram is where the sellers are, and Google is the fallback.
**Answer:** A, Google only (2026-09-11).

### Q-09 · Brand and domain → D-016
Is "JAS Ad Studio by JAS Studio" the final name? Which domain? Is there a logo, and who owns the brand assets?
**Answer:** Rename before launch. We build with a placeholder in one brand settings file, and the domain is bought after the name is final, before P8 (2026-09-11). The new name and logo are still to come from Jakhongir.

### Q-10 · Uzbek voiceover in the MVP? → D-017
The spec offers "O‘zbekcha ovozli matn". Veo's Uzbek speech is unreliable.
**Recommendation:** Deliver voiceover and overlay text as separate Uzbek lines for editing only. No speech inside the video prompt at launch.
**Answer:** Deferred until after launch. Natural product sounds only; the concept keeps its Uzbek hook and CTA. Pending Jakhongir's OK (2026-09-11).

### Q-11 · Build order and "good enough" → D-018 (order), D-019 (threshold)
- **A.** AI core first (P1). Jakhongir tests about 10 real products in Flow before we build accounts, payments and the UI.
- **B.** Build the full MVP in order, and test the video quality at the end.

If A, what counts as "good enough to continue"? For example, 6 out of 10 videos usable without editing.
**Recommendation:** A, with the threshold agreed now so it isn't argued later.
**Answer (order / threshold):** Order: A, AI core first, with detailed plans that a fresh session can follow (D-018). Threshold: at least 6 of 10 usable, with up to 2 fix-and-retest rounds (D-019, 2026-09-11).

### Q-12 · Policies → D-020 (refunds), D-021 (photo retention), D-022 (legal texts)
Who writes the privacy policy and terms? What is the refund rule? The proposal: a failed or refused job returns the credit automatically, and a video the seller dislikes does not (Flow made it, not us). How long do we keep product photos?
**Recommendation:** Keep photos for as long as the project exists, and delete them on project deletion. Jakhongir approves the texts.
**Answer:** Refunds: the credit is only spent on success and released automatically otherwise, with goodwill credits granted by hand (D-020, 2026-09-11). Photo retention: kept until the project is deleted (D-021). Legal texts: Jakhongir provides them, and we give him a factual list of what the app does (D-022).

### Q-13 · Support channel → D-023
Where do sellers ask for help, for example a Telegram support account? Where is it shown in the app?
**Answer:** All three: Telegram account `@dostonsulaymon_wk`, Telegram bot `@apl_league_standings_bot`, and email `dostonqosimiy19@gmail.com`. All editable without a deploy, through `site_settings` (D-023, 2026-09-11).

### Q-14 · Timeline and pilot sellers → D-024 (timeline), D-025 (two sessions)
What is the target launch date? Who are the 10–15 pilot sellers, and in which categories?
**Answer:** About mid-October 2026 (D-024). Two Claude sessions build in parallel, one per repo, with Doston coordinating (D-025). The pilot sellers are still open and come from Jakhongir (2026-09-11).

### Q-15 · Where may user data be stored? (personal-data law, for Jakhongir) → D-027

Uzbekistan's Law "On Personal Data" (Art. 27¹) has required citizens' personal data to be kept on servers inside Uzbekistan since 2021. The 2026 amendments, signed 26 March 2026, narrowed that. **Only these must stay in Uzbekistan:**
- biometric data: fingerprints, **facial images**, iris data, voice samples
- genetic data
- telecom subscriber data: passport details, PIN, SIM numbers

Other personal data may be stored abroad if three conditions are met: information-security requirements, international data-protection standards, and oversight by the authorized state bodies.

What we hold: Google name and email, product photos and briefs, and order references (no card data). None of these is a listed category, with one catch: a clothing photo may show a model's face, and the law lists "facial images."

- **A.** Host abroad (an EU VPS and/or Supabase), guide sellers to upload product-only photos, and have Jakhongir's lawyer confirm when the legal texts are prepared (D-022).
- **B.** Host in Uzbekistan with a local VPS provider. This removes the question, but may cost more and offers fewer options.

**Recommendation:** A, with the lawyer check. This is research, not legal advice. Sources, checked 2026-09-11: settleadvisory.com ("Localization of Personal Data in Uzbekistan"), gazeta.uz (2026-01-21), timesca.com.
**Answer:** Doston's call. For now everything stays in Docker on his laptop, and production is picked at P8 (D-027, 2026-09-11).

### Q-16 · What may the frontend session build before the P1 go/no-go? → D-026

D-018 says no UI gets built until P1 passes. With a second Claude session on the frontend (D-025), the options were:
- **A.** Web shell, landing page and gallery only.
- **B.** Everything, against mock data.
- **C.** Wait for the go/no-go.

**Recommendation:** A.
**Answer:** C. The frontend session starts after P1 passes, and D-018 stays unchanged (2026-09-11).

---

## Part B — technology (Doston)

### T-01 · Database, sign-in and file storage → D-028
- **A. Supabase Free** (Jakhongir's preference). Postgres, Auth and Storage at $0, and NestJS verifies Supabase's sign-in tokens. It needs four workarounds (Addendum A §A7): pausing after 7 quiet days, 1 GB storage, no backups, and 5 GB egress. With Google-only sign-in (D-015), Supabase Auth handles the whole Google login for us, which is this option's biggest saving.
- **B. Self-hosted on the VPS, as in kitobnarx.** Postgres in Docker, sign-in handled in NestJS (Google and Telegram), and photos on Cloudflare R2 (10 GB free). No extra cost, no pausing, and our own backups. It means about 1–2 days more sign-in code.
- **C. Hybrid.** Supabase Auth only, with our own Postgres and R2.

**Recommendation:** B, but now a closer call. NestJS is the backend anyway, you already run Postgres in Docker, and B removes all four free-plan workarounds. Since D-015, though, A saves us writing Google sign-in (about a day) and matches Jakhongir's preference.
**Answer:** B, no Supabase. Our own Postgres in Docker, Google sign-in in NestJS, and photos on a Docker volume for now (D-028, 2026-09-11).

### T-02 · AI provider and model → D-029
All providers go behind one interface, so the choice can change. The candidates, all available in Uzbekistan: OpenAI (the spec's choice), Claude, and Gemini.
**Recommendation:** In P1, run the same fixtures and real products through 2–3 candidates and pick on prompt quality first, cost second. Jakhongir opens the API account(s) (D-004).
**Answer:** Compare in P1. Doston's key in the local `.env` is used for now (D-029, 2026-09-11).

### T-03 · Background jobs for the AI call → D-030
- **A.** Redis + BullMQ. Same as kitobnarx; retries and stalled-job recovery are built in.
- **B.** A Postgres job table using `SKIP LOCKED`. One less service, but we write the recovery ourselves.

**Recommendation:** A.
**Answer:** A, Redis + BullMQ, with Postgres as the source of truth for jobs and credits (D-030, 2026-09-11).

### T-04 · Keeping the API contract in sync between the two repos → D-031
- **A.** zod schemas in the API generate an OpenAPI description, which generates a typed client in the web repo.
- **B.** Types copied by hand.
- **C.** A shared npm package.

**Recommendation:** A. The client is generated, so it can't drift from the API.
**Answer:** A. zod → committed `openapi.json` → a typed client generated in the web repo (D-031, 2026-09-11).

### T-05 · How the web app reaches the API → D-032
- **A.** One domain: Caddy routes `/api/*` to NestJS and everything else to Next.js. Same origin, no CORS, and a simple httpOnly cookie.
- **B.** A separate `api.` subdomain, with CORS and a parent-domain cookie.

**Recommendation:** A.
**Answer:** One domain, but through a Cloudflare Tunnel (as in kitobnarx) instead of Caddy. Moving to a VPS with Caddy later stays an option (D-032, 2026-09-11).

### T-06 · How we deploy on the VPS → D-033
- **A.** docker-compose for everything: api, worker, web, Postgres, Redis and `cloudflared`.
- **B.** systemd user units, as in kitobnarx.

**Recommendation:** A. It's one file that describes the whole box.
**Answer:** A. Everything in Docker Compose, `cloudflared` included (D-033, 2026-09-11).

### T-07 · CI → D-034
Should GitHub Actions run lint, typecheck and tests on every push in both repos, once the remotes exist?
**Recommendation:** Yes.
**Answer:** Yes: a local pre-commit hook plus GitHub Actions on every push in both repos (D-034, 2026-09-11).

### T-08 · Frontend styling → D-035
- **A.** Tailwind (the spec's suggestion).
- **B.** Whatever kitobnarx-web uses, if that's different.

**Recommendation:** Follow kitobnarx-web so you stay in familiar territory. Check in the P0 plan.
**Answer:** Tailwind v4, the same as kitobnarx-web (D-035, 2026-09-11).
