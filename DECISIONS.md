# DECISIONS

Every locked decision, newest last. Once an entry is recorded it is locked. Changing one takes a new entry that says which entry it supersedes, and why.

Format: **ID · date · decision.** Then why, and what it costs.

---

### D-001 · 2026-09-11 · Product requirements come from the owner; technology is ours

The owner's documents in `docs/source/` (01 build prompt v2, 02 prompt quality standard, 03 Addendum A) define **what** the product does. Doston decides **how** it is built. The build prompt's technology section (Next.js full-stack, Supabase, OpenAI SDK) is a suggestion only.

Why: "We are the developers… we will pick the technologies, whichever I'm comfortable with." (Doston)

### D-002 · 2026-09-11 · Two repositories: NestJS API and Next.js web

`jas-ad-studio-api` (NestJS) and `jas-ad-studio-web` (Next.js). All planning docs live in the api repo. The web repo's `CLAUDE.md` points here.

Why: Doston wants the backend and frontend separate, as in kitobnarx. Credits, orders and the AI call live in plain backend code.
Cost, accepted: two deploys, and an API contract that has to stay in sync between repos (see T-04).

### D-003 · 2026-09-11 · Team: Doston and Claude write all the code

Jakhongir owns product decisions, the gallery videos, payment confirmation and Uzbek copy review.

### D-004 · 2026-09-11 · Accounts are split between owner and developer

Paid services and customer data are in **Jakhongir's name**: AI API billing, the database and storage, the domain and the VPS. The repositories are **private on Doston's GitHub** and can be transferred later by agreement.

Why: it's his business and his bills. The code stays with the developer until both agree otherwise.

### D-005 · 2026-09-11 · Production hosting: a small VPS with Docker and Caddy

Why: there's no time limit on the 20–60 second AI call, it costs about $6 a month, and it's the same setup as kitobnarx. Gallery videos can be served from the same box or from R2.
Cost, accepted: we handle updates and HTTPS ourselves (Caddy automates HTTPS).

### D-006 · 2026-09-11 · Frontend framework: Next.js (App Router)

Why: the landing page is server-rendered, so search engines can index it, and it's the same as kitobnarx-web. **Next.js renders pages only; every business rule lives in the API.**

### D-007 · 2026-09-11 · Business model: paid prompt credits, free gallery (owner decision)

There are no free AI prompts. Product-specific AI generation costs one purchased credit. Anyone, signed in or not, can watch the gallery videos and open and copy their prompts. Full rules are in `docs/source/03-addendum-a-paid-credits.md`.

Why: Jakhongir's decision, 2026-09-11.

### D-008 · 2026-09-11 · Payment at launch: manual order confirmation (Q-01)

The seller picks a pack, pays outside the app (card transfer, or a Payme/Click link or QR code), and submits the order with an optional reference. The order stays `pending` until Jakhongir confirms it through `confirm_credit_order(order_id)`. Confirming atomically marks the order `paid` and inserts exactly one ledger entry. No admin dashboard is built for this. Details are in `docs/source/03-addendum-a-paid-credits.md` §A4.

Why: no merchant contract or registered business is needed to launch. Automatic Payme or Click checkout can later call the same confirm function.
Cost, accepted: Jakhongir checks and confirms each payment by hand, and sellers wait for that confirmation.

### D-009 · 2026-09-11 · Credit packs: 1, 5 and 15 credits (Q-02)

There are three packs. Prices in som are set by Jakhongir in the pack configuration before launch. The app shows no price, and offers no pack for sale, until a real price is entered.

Why: one pack to try it, a small batch, and a bulk pack that can have a lower per-prompt price, so fewer manual confirmations are needed per prompt sold.

### D-010 · 2026-09-11 · No free AI prompts; pilot credits are granted by hand (Q-03)

New accounts start with 0 credits. There's no starter grant and no promo codes in the MVP. Jakhongir gives pilot sellers credits through `owner_grant` ledger entries, and each grant needs a note.

Why: this confirms D-007. The gallery is the free product.
Watch: track how many gallery visitors go on to buy. If almost nobody buys, revisit the idea of one free prompt with a new decision.

### D-011 · 2026-09-11 · Jakhongir starts making the gallery videos now (Q-04)

Jakhongir starts making example clips in Google Flow now, with his own prompts, so the gallery is ready early.

**For each clip, he records:** the exact prompt used, the Flow model and mode, aspect ratio, duration, product category, and the reference photo. These fill the gallery metadata fields (source 01 §14).

**Honest labelling** (source 01 §42): these clips are labelled as examples made by JAS Studio in Google Flow, not as output of the JAS Ad Studio app. A clip may be called "made with JAS Ad Studio" only if it was made from an app-generated prompt.

Why: the gallery is the free product, and the sales pitch (D-007, D-010), so it should be ready before launch.
Cost, accepted: early examples may not match what the app's prompts produce. Once P1 works, add or replace clips made from app prompts.

### D-012 · 2026-09-11 · Prompt length and structure are set per video target, not fixed (Q-05)

No prompt length, beat count or camera intensity is hard-coded, in code or in the system prompt. Each **video target** (a video generator, model and mode) has one trusted configuration entry:

- maximum prompt tokens and words, and the recommended word range
- default and maximum number of beats
- supported durations and aspect ratios
- whether reference images are supported
- whether high-energy camera moves (whip transitions, speed ramps) are allowed

The selected target's values are injected into the system prompt at instruction level, and the server-side validators enforce them. Changing video models later means adding or switching a configuration entry, not rewriting code or the prompt.

The first target's defaults are chosen during the P1 test by comparing real videos. For Veo 3.1 the hard ceiling is 1,024 tokens, about 700 English words (Google's model page, checked 2026-09-11).

Why: Doston: "configurable, may change the model later so not fixed to Veo."
This resolves conflicts C-1 to C-4 in `docs/BRIEF.md`: the numbers in the source files become per-target defaults, not constants.

### D-013 · 2026-09-11 · Launch video target: Google Flow with Veo 3.1 only (Q-06)

One target is configured at launch: Google Flow with Veo 3.1, one single clip. Duration is 8 seconds if the chosen mode supports it. The exact Flow mode ("Frames to video" or "Ingredients to video"), its supported durations and aspect ratios, and its reference-image rules are confirmed by Jakhongir's test runs. They are stored in the target configuration with a `checkedAt` date and source URL (source 01 §24). More targets can be added later as new configuration entries (D-012).

Why: this is the generator the spec and Jakhongir's gallery examples use. With one target, all prompt tuning goes into it.

### D-014 · 2026-09-11 · Uzbek Latin at launch; built so more languages can be added (Q-07)

The interface launches in **Uzbek (Latin)**. Uzbek (Cyrillic), English and Russian come later.

Translation support is built in from P0:
- Every UI string lives in translation files keyed by locale.
- The API accepts a locale.
- The language of the AI's explanations, shot plan, questions and editing copy is a parameter.

The generated video prompt is always English. Adding a language later means a translation file, the AI output language, and a native review. No code changes.

Why: Doston wants all four languages eventually. Doing them one at a time keeps writing, review and testing manageable at launch.

### D-015 · 2026-09-11 · Sign-in: Google only (Q-08)

Sellers sign in with Google. Signing in is needed only to buy credits, upload photos and generate. The gallery, including copying prompts, works signed out (D-007). There's no Telegram login, phone/SMS or email magic link at launch.

Why: the simplest option to build and secure, and what the spec assumed.
Watch: sellers who rarely use a Google account. If pilot sellers struggle to sign in, reconsider Telegram login with a new decision.
Note: this makes Supabase more attractive for T-01, because Google sign-in is built into Supabase Auth.

### D-016 · 2026-09-11 · The product will be renamed before launch; build with a placeholder (Q-09)

"JAS Ad Studio · by JAS Studio" is a working name only. Jakhongir picks the final name before launch. Until then, every product name, attribution, logo and domain reference comes from **one brand settings file** in each repo. Renaming is then a one-file change. No code, test or doc should hard-code the name in user-facing text.

The domain is bought in Jakhongir's name (D-004) after the name is final and before P8. Google sign-in (D-015) needs the real domain configured by launch.

Why: Jakhongir wants a different final name.
Watch: the name and domain must be settled before P8, or they block the Google sign-in setup and the deploy.

### D-017 · 2026-09-11 · Uzbek voiceover and overlay text are deferred until after launch (Q-10)

The MVP leaves out three things from source 01:
- the step-2 audio choice (§9, "O‘zbekcha ovozli matn")
- the result's "Matn va ovoz" section (§17.5)
- the `editingAssets` output fields (voiceover, overlay texts, end-card note)

MVP video prompts use natural product sounds only: foley and room tone, with no music, dialogue or narration. The concept still includes a short Uzbek hook and CTA line (`concept.hookUz`, `ctaUz`).

Why: not needed to prove the core product. Adding it later is one output field, one toggle and one result section, and nothing in the architecture depends on it.
Revisit: if pilot sellers ask for voiceover or overlay text.
Pending: Jakhongir's OK, since this removes an option from his spec.

### D-018 · 2026-09-11 · AI core first; plans written so a fresh session can't get lost (Q-11)

**Order:** `P0 → P1 (AI core + command-line script) → Jakhongir tests real products in Flow → go/no-go → P2 … P8`. No accounts, payments or UI get built until P1 passes its go/no-go (the threshold is recorded separately).

**Session continuity:**
- Every phase plan in `docs/superpowers/plans/` is written so that a new session with no memory can carry it out. Each plan has exact file paths, exact commands, the output to expect, and checkbox tasks.
- `docs/PROGRESS.md` starts with a **Resume here** block: current phase, active plan file, next task, and last verified state. It is updated at the end of every step.
- `CLAUDE.md` tells a new session to read that block first and to state its next action before touching anything.

Why: Doston: "option 1 with detailed plans; when I start a new session the AI shouldn't get confused."

### D-019 · 2026-09-11 · P1 go/no-go: at least 6 of 10 videos usable (Q-11)

After P1, Jakhongir runs about 10 real products (a mix of categories) through the command-line script and generates the videos in Google Flow. He judges each one.

**Usable** means:
- the product's shape, colours and labels are intact
- nothing is invented on the product
- it could be posted without heavy editing

**Go:** at least 6 of 10 are usable.
**Below 6:** we fix the system prompt or target configuration and re-test. After at most **2** fix-and-retest rounds, we decide together whether to continue, change the video target, or stop.

Each run is recorded in `docs/PROGRESS.md`: product, category, prompt version, Flow mode, usable yes or no, and what went wrong.

Why: a solid majority is realistic for AI video today and good enough to sell. Agreed up front, so the result isn't argued afterwards.

### D-020 · 2026-09-11 · Refunds: automatic when our system fails, manual goodwill otherwise (Q-12)

**Automatic, and no extra feature to build.** A credit is reserved when a job starts and debited only when a valid package is saved. `failed`, `refused` and `needs_input` jobs release the reservation as part of the P4 flow (source 01 §32). So "auto-refund" is simply how credits work, not a separate refund system.

**Goodwill.** If a seller is unhappy with the video Flow made, Jakhongir may give a credit back by hand, as an `owner_grant` ledger entry with a required note. There's no self-service refund button.

**Terms.** The terms say plainly that the product is the prompt package. The video is made by Google Flow, which we don't control.

Why: fair to sellers without opening the door to "refund, then reuse the delivered prompt."
Doston's concern that "making it auto will take time" does not apply: the release is part of the reservation logic we must build anyway.

### D-021 · 2026-09-11 · Product photos are kept until the project is deleted (Q-12)

Uploaded photos, including the downloadable reference copy and the model-input copy, are kept for as long as their project exists. Deleting a project removes its photos, briefs and generated packages, except for the minimal operational records needed for security and accounting (source 01 §35). Deletion asks for confirmation first. There's no automatic expiry in the MVP.

Why: sellers can reopen an old project and re-download the exact photo to upload into Flow.
Watch: storage growth, especially if T-01 picks Supabase Free with its 1 GB limit (Addendum A §A7). If storage becomes a problem, add an expiry rule with a new decision.

### D-022 · 2026-09-11 · Jakhongir provides the privacy policy and terms (Q-12)

Jakhongir writes or sources the Uzbek privacy policy and terms of use. We only render them as pages and link to them where the product needs them: sign-in, the first photo upload, and buying credits.

To keep the texts true to the product, we give him a factual list of what the app actually does:
- the data collected, and Google sign-in
- that photos and briefs are processed by the AI provider
- credits and refunds (D-020)
- photo retention and project deletion (D-021)
- where data is stored

Why: Jakhongir's choice.
Watch: this is a **launch blocker owned by Jakhongir**. There's no P8 deploy without both texts.

### D-023 · 2026-09-11 · Support: Telegram account, Telegram bot and email, all editable (Q-13)

Three support channels are shown to sellers:

| Channel | Launch value |
|---|---|
| Telegram account | `@dostonsulaymon_wk` |
| Telegram bot | `@apl_league_standings_bot` (linked only; we don't build a support bot) |
| Email | `dostonqosimiy19@gmail.com` |

**They are editable without a deploy.** They live in an owner-editable `site_settings` store in the database, alongside the payment instructions (Addendum A §A4). The API serves them and the web app reads them. Nothing is hard-coded in code or translation files. The owner edits them directly in the database, since there's no admin dashboard (source 01 §55).

They are shown in the header menu, the FAQ, every error state, the payment-pending screen and the footer.

Why: Doston: "all of them… such things should be editable."
Watch: the launch values look like Doston's own handles, and the bot seems to exist for another purpose. Replace them with Jakhongir's channels before launch if they should belong to the business (D-004).

### D-024 · 2026-09-11 · Target launch: about mid-October 2026 (Q-14)

The aim is about 5 weeks from 2026-09-11, around 16 October 2026: 3–4 weeks of work, plus a buffer for the P1 go/no-go and its fix rounds (D-019). The date is re-estimated in each phase plan. If a phase slips, `docs/PROGRESS.md` says so plainly. We never cut the quality gates (the P1 test, the security review) to hit the date.

Why: Doston chose the recommended timeline and will run two Claude sessions in parallel (D-025).

### D-025 · 2026-09-11 · Two Claude sessions in parallel, one per repo, coordinated by Doston (Q-14)

- **Session A** works in `jas-ad-studio-api`: the backend and all planning docs.
- **Session B** works in `jas-ad-studio-web`: the frontend. It learns the project from the MD files, starting with `../jas-ad-studio-api/docs/PROGRESS.md` → Resume here. It reads the backend code for API contracts, and asks Doston questions instead of guessing.
- Doston relays between the sessions. **Neither session edits the other's repo.**
- What the frontend may build before the P1 go/no-go is Q-16. The exact coordination rules are fixed in the design spec: how the API contract is handed over, and where web-only decisions and web progress are recorded.

Why: Doston has two Claude accounts and will manage both. Session B's kickoff prompt is written after the design spec exists.

### D-026 · 2026-09-11 · The frontend session starts only after the P1 go/no-go (Q-16)

Session B (`jas-ad-studio-web`, D-025) starts after P1 passes its go/no-go (D-019). Before that, no UI is built: no web shell, no landing page, no gallery. This **confirms D-018 unchanged**.

After the go: backend phases P2–P4 (Session A) and frontend phases P5–P6 (Session B) run in parallel, joined by the API contract (T-04). Session B's kickoff prompt is written after the design spec, and handed over at the go.

Why: no UI work is wasted if the video test fails or the AI output shape changes.
Cost, accepted: web work doesn't overlap P0 and P1, which leaves less buffer before the mid-October target (D-024). If P1 needs both fix rounds, `docs/PROGRESS.md` re-states the date.

### D-027 · 2026-09-11 · Data lives in Docker on Doston's laptop for now (Q-15)

During development and the P1 test, everything runs in Docker on Doston's laptop: database, Redis, uploaded photos. The production location is picked at P8, with the VPS from D-005. Data location is Doston's call, and it's not a development concern.

Why: Doston: "I will store wherever I want, for now on my laptop. We are using Docker."

### D-028 · 2026-09-11 · No Supabase: our own Postgres in Docker, Google sign-in in NestJS (T-01)

- **Database:** Postgres in Docker via Drizzle, with SQL migrations committed. Same pattern as kitobnarx.
- **Sign-in:** Google sign-in (D-015) is written in NestJS. The API issues its own session.
- **Photos:** stored privately on a Docker volume for now (D-027). Production storage is picked at P8.
- **Supersedes:** `docs/source/03-addendum-a-paid-credits.md` §A7 (Supabase Free constraints). Its other rules still apply: gallery videos don't consume database bandwidth, 2048 px reference copies, nightly backups.

Why: Doston: "why do we need Supabase?" We don't. NestJS is the whole backend, and Postgres runs in the same Docker setup at no extra cost. Supabase would only have saved about a day of sign-in code, and would have brought free-tier limits and a second stack.
For Jakhongir: his reason for Supabase Free was cost, and that's met here too.

### D-029 · 2026-09-11 · AI provider: compare 2–3 in P1, then pick (T-02)

All model access goes through one provider interface. In P1 the same fixtures and real products are run through up to three candidates: OpenAI, Claude and Gemini. The pick is based first on prompt quality (the hard-fail rubric in source 01 §51, plus Jakhongir's Flow results), and then on cost per successful package. The winner and its model are recorded as a new decision after P1. The others stay available behind the interface.

**Keys:**
- Doston has put an API key in the api repo's local `.env` for development and P1 testing.
- `.env` is never committed. P0 adds `.gitignore` and a `.env.example` with no secrets.
- Before launch, production billing moves to Jakhongir's accounts (D-004).

Why: Doston chose to compare. We learn which model writes the best Veo prompts instead of assuming.

### D-030 · 2026-09-11 · Background jobs: Redis + BullMQ (T-03)

AI generation runs as BullMQ jobs in the `worker` process, which is the same image as `api` with a different entrypoint (kitobnarx pattern). Redis runs as a Docker container next to Postgres (D-027).

BullMQ's retries, stalled-job detection and concurrency limits sit underneath the P4 credit rules: reserve a credit, call the AI, validate, save, debit; release the credit on failure; at most one repair attempt. **Postgres stays the source of truth** for job state and credits. A Redis failure can delay a job, but it can never double-charge.

Why: Doston knows it from kitobnarx, and writing our own stalled-job recovery is where money-safety bugs hide.

### D-031 · 2026-09-11 · API contract: generated from zod, with a typed client generated in the web repo (T-04)

- The API's **zod schemas are the single source** for every request and response shape.
- They produce an OpenAPI document, committed as `openapi.json` in the api repo and regenerated by one script. A check fails if it's out of date.
- The web repo generates its typed client from `../jas-ad-studio-api/openapi.json` with one command. **The web session never hand-writes API types** (D-025).
- A contract change works like this: Session A regenerates `openapi.json` and notes the change in `docs/PROGRESS.md`. Session B regenerates its client, and its build shows every place that must change.
- The libraries for this are new dependencies, so they're picked in the P0 plan under the standing gate.

Why: two separate sessions (D-025) would let hand-copied types drift silently. A generated client breaks loudly at build time instead.

### D-032 · 2026-09-11 · Public access: Cloudflare Tunnel on one domain; a VPS with Caddy stays an option (T-05)

- **One domain.** Cloudflare Tunnel sends `/api/*` to NestJS and everything else to Next.js. Cloudflare provides HTTPS, so there are no open ports, no CORS, and the session cookie is a plain httpOnly cookie on that one domain.
- **Local development** has the same shape: Next.js dev forwards `/api/*` to the NestJS port.
- **Runs from Doston's machine for now** (D-027), exactly like kitobnarx: a free Cloudflare named tunnel. The domain (D-016) must use Cloudflare DNS.
- **Supersedes the Caddy part of D-005.** A later move to a rented VPS with Caddy, or the tunnel on a VPS, is planned for. The app only assumes "one origin, API under `/api`," so either option works without code changes.

Why: Doston: "1, with the idea of changing to 3 later." It's the same tool as kitobnarx, so there's nothing new to learn.
Watch: a home machine is a single point of failure (sleep, power, internet). Decide at P8 whether production stays at home or moves to a VPS.

### D-033 · 2026-09-11 · Everything runs in Docker Compose (T-06)

One compose setup runs every service as a container: `api`, `worker`, `web`, Postgres, Redis and `cloudflared`. Each has a restart policy and a healthcheck. `docker compose up` starts the whole product. The same file moves unchanged from Doston's machine to a VPS (D-032). There's a separate dev compose for local work (Postgres and Redis only, with apps run in watch mode), as in kitobnarx.

The web image is built from the web repo, and the compose file lives in the api repo, which holds the deployment docs (D-002). Session B never edits it (D-025).

Why: one file describes the whole box, and it's portable.

### D-034 · 2026-09-11 · Checks: a local pre-commit hook plus GitHub Actions on every push (T-07)

- **Locally:** a fast pre-commit hook in each repo runs lint and typecheck on the changed files. It never skips silently. If it fails, fix the root cause.
- **GitHub Actions:** on every push in both repos, the full `lint`, `typecheck`, `test` and `build`. The api repo also checks that `openapi.json` is up to date (D-031).
- The hook and Actions are set up in P0. Actions need the GitHub remotes, so they wait on `gh auth login`.
- The hook tool is a new dependency and is picked in the P0 plan (standing gate).

Why: mistakes are caught before a commit, and CI enforces the checks even if a session forgets. That matters with two sessions (D-025).

### D-035 · 2026-09-11 · Frontend styling: Tailwind v4 (T-08)

Tailwind v4 via `@tailwindcss/postcss`, the same as kitobnarx-web. The design tokens from source 01 §5 (palette, Manrope, 12–18 px radius) become Tailwind theme values in one tokens file. No component library is assumed; adding one is a new dependency and goes through the standing gate.

Why: familiar to Doston, and the spec's own suggestion.

### D-036 · 2026-09-11 · Sessions: an opaque ID in an httpOnly cookie, stored in Postgres (spec R-1)

After Google sign-in, the API creates a random 256-bit session ID. It stores the ID in a `sessions` table with the user and an expiry, and sets it as an `HttpOnly; Secure; SameSite=Lax` cookie on the one domain (D-032). Logging out deletes the row. Banning a user or "log out everywhere" deletes all of that user's rows. No JWT.

Why: sessions can be revoked instantly, and one origin keeps cookies simple.

### D-037 · 2026-09-11 · A small owner admin panel in the web repo (spec R-2)

- **Where and who:** a `/admin` section of `jas-ad-studio-web`, shown only to users with role `owner`. The owner role is set at sign-in from an env allowlist of Google emails (`OWNER_EMAILS`), never from the client.
- **Screens:**
  - pending orders: confirm, or reject with a reason
  - grant credits, with a required note
  - settings: support contacts (D-023), payment instructions (D-008), pack prices (D-009)
  - read-only views of users, generations and daily AI spend

  Phone-friendly.
- **Safety:** every action calls owner-only API endpoints under `/api/owner/*`, which reuse the same credit services and transactions as the app. There is no direct table editing. Every owner action is written to `owner_audit_log`: who, what, when.
- **When:** after the P1 go. The endpoints come in P3, the screens in P5. About 2–3 extra days.
- **Supersedes:** the owner-CLI idea (spec R-2), and the "no admin dashboard" line in Addendum A §A4. Source 01 §55 rules out a *heavyweight* dashboard; this is a small panel. Gallery clips are still managed as a file plus a folder for now (spec R-5).

Why: Jakhongir confirms every payment by hand (D-008) and needs to do it from his phone. Doston: "why not admin dashboard?"

### D-038 · 2026-09-11 · Design choices R-3 to R-8 approved as written in the spec

Doston approved the remaining design choices in `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` §0:

- **R-3:** The credit balance lives in a `credit_accounts` row (`available`, `reserved`, never below zero), with a `credit_ledger` row in the same transaction for every change. A reserve is one atomic `UPDATE … WHERE available >= 1`.
- **R-4:** Money and job logic is tested against a real Postgres (integration tests), in addition to unit tests. This departs from kitobnarx's unit-only rule on purpose.
- **R-5:** Gallery metadata lives in a JSON file in the api repo, and the clips live on a media volume served at `/api/gallery/media/*` with long cache headers. It could move into the owner panel (D-037) later.
- **R-6:** Only two copies of each photo are kept: the 2048 px reference copy and the 1024 px model-input copy. The original upload is discarded after processing.
- **R-7:** API modules talk only through each module's public port file, enforced by lint.
- **R-8:** Web-only decisions go in the web repo's `DECISIONS.md` as W-001 onward, written by Session B. Shared decisions go only in this file, written by Session A.

With D-036 (R-1) and D-037 (R-2), **the design spec is approved.**

### D-039 · 2026-09-11 · P0 is the api repo only (PLAN.md corrected)

`docs/PLAN.md`'s P0 row said "both repos" and included a Next.js shell with design tokens. D-026 says no UI is built before the P1 go/no-go. `DECISIONS.md` wins over `PLAN.md`, so P0 covered the api repo only, and the PLAN row was corrected to match.

Why: Doston confirmed api-only when asked. The two documents disagreed because the roadmap was written before D-026.

### D-040 · 2026-09-11 · P0 dependency picks

Installed in P0 under the standing gate. Everything not listed here was not installed.

- **Framework and infrastructure**, all as in kitobnarx: `@nestjs/*` 11, `@nestjs/config`, `drizzle-orm` + `pg`, `ioredis`, `bullmq`, `zod` 4, `pino` + `pino-http` + `nestjs-pino`.
- **Tooling:** `typescript` 5.9, `eslint` 9 + `typescript-eslint` + `eslint-plugin-boundaries` 5 + `prettier`, `vitest` 3 + `unplugin-swc`, `drizzle-kit`, `@nestjs/cli`.
  Their newest majors (TypeScript 7, ESLint 10, vitest 5, boundaries 7) resolved on first install and were **pinned back** to the versions kitobnarx runs. P0 is not where a compiler rewrite gets debugged.
- **The API contract (D-031):** `@nestjs/swagger` + `nestjs-zod`. The document is generated by booting the real application, so a route that exists is in it and one that does not, is not. The alternative, a standalone `zod-to-openapi` registry, is a second hand-kept list of routes that can drift from the controllers — the exact failure two parallel sessions (D-025) must not have.
- **The pre-commit hook (D-034): no dependency.** A tracked `.githooks/pre-commit` plus `git config core.hooksPath .githooks`, wired by the `prepare` script. husky and lefthook each add a package and a postinstall step to do what one shell script does.

### D-041 · 2026-09-11 · The OpenAI key is `OPENAI_API_KEY`

`.env` held `OPEN_AI_API_KEY`. It is now `OPENAI_API_KEY`, the name the OpenAI SDK reads by default, so no adapter has to remap it. Doston approved the rename; the value was carried over unchanged, and `.env` stays git-ignored.

It is **optional** in the env schema in P0: nothing calls a model yet, and CI must boot without a key (spec §11 forbids live AI calls in CI). P1 makes the provider require it at the point of use, so a missing key fails the generate command rather than the boot.

### D-042 · 2026-09-11 · Ports on the build machine

Every other port on Doston's machine is taken by kitobnarx and the attendance project.

| | dev (`pnpm infra:up`) | deployed (`docker compose --profile app`) |
|---|---|---|
| Postgres | 5437 | 5436 |
| Redis | 6384 | 6383 |
| api | 3040 | 3041 |

Dev and deployed are separate compose projects with separate volumes, so `pnpm dev` can never write into deployed data. `POSTGRES_PASSWORD` has no default in the deployed file: a missing one refuses the boot rather than starting the database with a guessable password.


### D-043 · 2026-09-11 · P1 builds the provider interface but only the OpenAI adapter (Q-P1-2)

D-029 asked for a 2–3 provider comparison. Only an OpenAI key exists (D-041), and adapters for providers we cannot call would be untested code that gives false confidence in a comparison that never happened.

- P1 builds the **provider interface** (the `ai` module's public port) and the **OpenAI adapter**.
- The seam is proven by a `FakeProvider` used throughout the tests, so it is a real boundary rather than a theoretical one.
- Adding Claude or Gemini later is one file each against an already-tested contract.
- P1 therefore compares **OpenAI models against each other**. `docs/PROGRESS.md` records it as a one-provider comparison, not as three.

**Amends D-029**, which stands otherwise: the winning provider and model are still recorded as a decision after P1, and other providers stay available behind the interface.

Why: Doston chose this when asked. It keeps D-029's real goal — never being locked to one vendor — without pretending to a comparison we cannot run.


### D-044 · 2026-09-11 · The TARGET block tells the model to echo the target id exactly

The first two live calls both returned `targetId: "instagram-story"` instead of `flow-veo-3.1`, failing the source 01 §50 capability check and costing a repair call every time. The TARGET block named the target but never said to echo it back, so the model invented a plausible-sounding identifier from the platform in the brief.

One line added to the assembled TARGET block in `src/ai/prompt/assemble.ts`:

> Echo this exact targetId in the target field. Do not substitute a platform, a format name, or any other identifier.

**Measured before and after on the same input and model (`gpt-4.1-mini`):**

| | before | after |
|---|---|---|
| attempts | 2 | 1 |
| cost | $0.00697 | $0.00335 |
| elapsed | 35.9s | 15.4s |

This is a standing-gate change to the AI system prompt. Doston approved it. `AD_DIRECTOR_SYSTEM_PROMPT_V2` itself is untouched — the line lives in the target block, which is assembled from config, so it stays out of the versioned prompt constant.

Why: the repair call exists for problems we cannot design out. An invented target id is one we can, and paying twice per generation for it in production would be a permanent tax.


### D-045 · 2026-09-12 · Prompt length is reported, not enforced; the model is the lever

Doston: "no need for limit for word size at all, we can have a prompt like that example ones, the reason why our product exists is because we need such long prompts" — and then, on being shown that the cap was not what was limiting output: "change the model".

**Both done.**

- **The length cap is removed.** `validateLength` no longer fails a long prompt. The target's `maxPromptTokens` stays in the config as the generator's documented limit and now surfaces as a **warning** (`PROMPT_OVER_TARGET_LIMIT`) rather than an error, so a prompt that might be truncated is visible without being destroyed. The config's internal "maxWords × tokensPerWord ≤ maxPromptTokens" rule is gone with it.
- **The model is the real lever.** The cap was never binding: with a 730-word ceiling, `gpt-4.1-mini` produced 342 words and `gpt-4.1` 464. Measured on one real product at the same brief and system prompt:

| Model | Words |
|---|---|
| `gpt-4.1-mini` | 342 |
| `gpt-4.1` | 464 |
| `gpt-5.4` | 907 |
| `gpt-5.6-terra` | 1,009 |
| `gpt-5.5` | **1,101** |

`gpt-5.5` is the working default. Its output is not merely longer: it observes detail the smaller models miss (heel pull tab, almond toe shape, centre seam line, darker interior collar) and writes a product-specific lock rather than a generic one.

**Supersedes** the enforcement half of D-012. The rest of D-012 stands: no numbers in the system prompt, every figure from the target config, so switching generator is a config edit.

**Two things this leaves open, both untested:**
1. A 1,101-word prompt is about 1,542 estimated tokens, **above Veo 3.1's documented 1,024-token limit**. If Flow truncates, the tail — which carries the fidelity constraints — is lost, and a longer prompt would be actively worse. Nobody has tested this. It is now the most important open question in P1.
2. gpt-5.x is not in the pricing table, so reported costs use a deliberately high fallback ($15/$60 per million) and are **overestimates**. Real rates are needed before cost per successful package can inform D-029.


### D-046 · 2026-09-12 · The 1,024-token ceiling was never real; it is removed

Doston has run prompts of **2,000–4,000 words through the real generator with no truncation**. The 1,024-token figure in D-012, `docs/BRIEF.md` C-4 and spec §5 was read off a model page on 2026-09-11 and never tested against the tool we actually use.

- `maxPromptTokens` now records what has been **observed to work** (6,000) rather than what a page claimed, and the length check only warns (D-045).
- `recommendedWords` is 2,400, matching the example prompt Doston is working from.
- The result schema's `promptEn` cap went from 8,000 to 30,000 characters, which had become a second hidden ceiling.
- **Supersedes** the token-ceiling clause of D-012 and resolves C-4 in `docs/BRIEF.md`: the conflict between source 01's 180–350 words and source 02's 500–1,000 was arbitrated by a limit that does not exist. Source 02's depth requirement stands unopposed, and the example prompt puts the real target higher still.

**How this was missed.** The figure entered `DECISIONS.md` in the first planning session and was treated as settled. P1's own Part 0 listed "does the generator's prompt box truncate a long prompt?" as untested — and six parts were built around the limit anyway instead of spending two minutes checking it. A documented constraint that nothing depends on is cheap; one that shapes the architecture has to be tested before it is trusted.

### D-047 · 2026-09-12 · Target generator: Omni, not Veo — details pending

Doston: "We can use Omni, not the Veo." The `flow-veo-3.1` entry in `src/ai/targets/` is therefore the wrong target and is **stale**, though its length settings now reflect real observed behaviour.

Still needed before a correct entry can be written: the generator's exact name and where it runs, its supported durations and aspect ratios, its reference-image mode and how many it accepts. **Supersedes D-013** once those are supplied.


### D-048 · 2026-09-12 · Mandatory sections are what make prompts deep; mini-tier models cannot follow them

Source 02 is itself 2,373 words — Doston pointed at it as the specimen of the depth a generated prompt should reach. Its ~24 labelled sections are the shape, not just the length.

The system prompt's `PROMPT ARCHITECTURE` section previously said "headings are optional; the information is not", so models wrote flowing prose and stopped when they felt finished. It now names all seventeen sections **in a fixed order**, requires each to carry product-specific direction, and states that falling short of the target length means under-specification rather than too few adjectives.

Measured on one real product (a knit sneaker), same brief, before and after the change:

| Model | Before | After | Sections | Time | Cost |
|---|---|---|---|---|---|
| `gpt-4.1-mini` | 342 | 427 | **1 / 17** | 12s | $0.004 |
| `gpt-4.1` | 464 | **803** | 17 / 17 | 18s | $0.026 |
| `gpt-5-mini` | — | 1,086 | 21 / 17 | 69s | ~$0.34 |
| `gpt-5.4-mini` | — | **1,260** | 17 / 17 | 21s | ~$0.23 |
| `gpt-5.5` | 1,101 | **1,653** | 17 / 17 | 58s | ~$0.30 |

**Two findings.**

Structure is a stronger lever than the length instruction. `gpt-4.1` nearly doubled its output from the same "aim for 2,400 words" request once the sections were mandatory.

**Mini-tier models cannot follow the section format.** `gpt-4.1-mini` produced one section of seventeen. It is disqualified on shape rather than length, which no amount of asking for more words would fix.

`gpt-5.4-mini` is the current best value: all seventeen sections at 1,260 words in 21 seconds, three times faster than `gpt-5.5` for 76% of the words. `gpt-4.1` is the cheap option with a **known** price.

**Cost caveat:** only the `gpt-4.1` figures are real. gpt-5.x is absent from the pricing table, so its costs use a deliberately high fallback ($15/$60 per million) and are upper bounds. The model pick under D-029 weighs cost per successful package, and that half of the equation stays a guess until real rates are supplied.

This is a standing-gate change to the AI system prompt. Doston directed it: "that example prompt has 2373 words and ours should have such words."


### D-049 · 2026-09-12 · Build prompt v1 is deleted from the repository

`docs/source/00-build-prompt-v1-superseded.md` is removed. It was superseded by build prompt v2 on day one, was never built from, and appeared in no code or plan — it only invited a reader to wonder whether it still counted.

Doston: "it is causing distraction and confusion."

**Recoverable:** `git show e3e7d90:docs/source/00-build-prompt-v1-superseded.md`. Nothing is lost, only removed from the working tree where it could mislead.

The precedence list in `CLAUDE.md` now has four entries instead of five, and says where to find v1 if a provenance question ever needs it.


### D-050 · 2026-09-12 · The target is Google Flow itself; the seller picks model, length and ratio inside it

Doston: "all of them will be selected on [Flow] itself… we will pick the ratio, and we will select the time and the model."

The config described a generator with fixed capabilities. Flow is not that — it is a tool in which the seller chooses the model (Veo, Omni, whatever comes next), the clip length and the aspect ratio. There is no capability set for us to hold a result to.

**Changed:**
- The target id is `google-flow`, not `flow-veo-3.1`. Config version 5, no longer provisional.
- `durations`, `aspectRatios` and `referenceMode` are **removed**. They were describing limits the tool does not have, and two validators enforced them — they would have rejected good output the moment Flow offered something the config did not list.
- `referenceImages` became `maxReferenceImages`: how many photos *we* send is our decision, not the generator's.
- Duration and aspect ratio still reach the prompt, because the sequence is timed and the hero ending is framed — but from the **seller's brief**, stated as "the seller will generate at 8 seconds, 9:16. Build the sequence and framing for exactly that."
- The capability validators narrowed accordingly: `DURATION_UNSUPPORTED` and `ASPECT_RATIO_UNSUPPORTED` are gone; `DURATION_RENEGOTIATED` and `ASPECT_RATIO_RENEGOTIATED` stay, because a prompt timed to 10 seconds when the seller chose 8 is still broken whatever the tool can do.

**Retires D-013**, which named Veo 3.1 as the launch target and made its mode, durations and aspect ratios something Jakhongir had to confirm. There is nothing left for him to confirm there.

### D-051 · 2026-09-12 · `gpt-4.1` fails a §49 safety case that the gpt-5 models pass

Re-recording the fixtures against `gpt-4.1` surfaced a behaviour difference that word counts never would.

On `conflicting-variants` — a blue bottle and a red bottle of the same product — `gpt-4.1` returned **`ready`**. It noticed the conflict, recording *"Ikki xil rangli butilka varianti bor"*, and then chose one anyway: *"Qizil butilka varianti asos qilib olindi."*

Source 01 §25 is explicit: **"Do not spend a successful generation inventing a compromise."** `gpt-5.5` and `gpt-5.4-mini` both return `needs_input` here and ask which variant is being sold.

This is a **model-selection criterion, not a bug to fix in the prompt.** The instruction is already unambiguous; the smaller model does not act on it. Under D-029 the pick weighs prompt quality first, and refusing to guess about a seller's product is part of quality — a wrong-variant video wastes a credit and the seller's trust.

The fixture test records which behaviour the recording shows rather than asserting one, so the suite reports the difference instead of failing when the model changes.

**Also fixed:** the injection-fixture test flagged the phrase "product lock" as a leaked system prompt. `Product lock:` became a required section heading of every generated prompt when the architecture was made mandatory, so the test was reporting compliance as a leak. It now checks for phrases that appear only in the instructions.


### D-052 · 2026-09-12 · The model is `gpt-5.5`

Doston: "use 5.5 not mini then."

Settles the provider-and-model question D-029 left open, as amended by D-043 (OpenAI only, one provider compared against itself).

| | `gpt-4.1` | `gpt-5.4-mini` | **`gpt-5.5`** |
|---|---|---|---|
| Words | 803 | 1,260 | **1,653** |
| Sections | 17/17 | 17/17 | 17/17 |
| Time | 18s | 21s | 58s |
| Conflicting variants | **invents a compromise** | asks | **asks** |

`gpt-4.1-mini` was disqualified earlier for producing one section of seventeen (D-048), and `gpt-4.1` for choosing a variant instead of asking when two photos contradicted each other (D-051) — a seller's credit spent on a video of the wrong product.

`OPENAI_MODEL` in `.env.example` is `gpt-5.5`. `--model` still overrides it per run.

**Cost is not part of this decision, because it cannot be.** gpt-5.x is absent from the pricing table, so every cost figure reported for it uses a deliberately high fallback ($15/$60 per million) and is an upper bound. D-029 weighs cost per successful package second; that half stays unanswerable until real rates are supplied. The known real figure is `gpt-4.1` at $0.026 per prompt.

### D-053 · 2026-09-12 · First real Flow video: "kinda good"

Doston generated a video in Google Flow from a `gpt-5.5` prompt for a real product — beige knit sneakers from shoptextile.uz, photographed as a pair with no visible branding. His verdict: **"it's kinda good."**

The first end-to-end proof that the chain works: real seller photo → our prompt → Flow → a watchable ad. Not yet a D-019 judgement, which needs about ten products across categories and a usable/not verdict on each.

"Kinda good" is a soft pass, and what was *not* good is the input D-019's fix rounds exist for. Recorded here so the next session knows this was the first signal and that its detail is still outstanding.


### D-054 · 2026-09-12 · First fidelity assessment: `gpt-5.5` passes, `gpt-5.6-terra` invents a component

Two Flow videos from the same product photo (beige knit sneakers, shoptextile.uz), each generated from a different model's prompt. Frames extracted with ffmpeg and compared against the reference photo.

**`gpt-5.5` — usable.** Silhouette, proportions, beige upper, white sole and heel pull tab all held. No invented branding. The product survived being worn and walked in. The knit read coarser than the reference's fine flat knit, but recognisably the same shoe.

**`gpt-5.6-terra` — not usable.** It added a **ribbed webbing strap across the midfoot** holding the laces. The reference has no such strap; the laces pass straight through the knit. Source 01 §25 forbids "adding components", and D-019's second criterion is "nothing is invented on the product". It also turned the fine knit into a chunky crochet with prominent holes. No logo was invented — the worst failure did not occur — but a customer receiving these would say they are not the shoes in the photo.

Doston: "I guess it was too smart for such cases." The larger model elaborated past its reference. **This confirms D-052**: bigger is not automatically better for a product-fidelity task, and `gpt-5.5` stays the default.

**A finding neither prompt could control:** both videos are 10 seconds; the brief said 8, so the shot plan was timed 0–2.4 / 2.4–5.6 / 5.6–8.0 and Flow had two unscripted seconds to fill. Whatever duration the seller picks in Flow must be the duration they enter in the wizard, or the timeline is wrong from the start. **Carry into P5:** the duration field is not cosmetic.

### D-055 · 2026-09-12 · P1 is closed at Doston's decision, not by the D-019 criterion

Doston: "phase one is close it now. No more codes."

**Recorded honestly:** D-019 set the exit at *about ten real products, at least six usable*. One real product was tested, giving one usable video from two prompts. The phase is being closed on the builder's judgement that the approach works, not on the agreed measurement.

That is a legitimate call — the evidence is a real seller's product going through the whole chain and producing something postable — but the record should not claim a gate was passed that was not run. If the wider pilot later shows a lower hit rate than one product suggested, this entry is where to look.

**Built and verified in P1:** target config · output contract, brief schema and trusted envelope · deterministic validators · the merged system prompt V2 · provider interface and OpenAI adapter · the repair path with a pre-call spend cap · the CLI harness · the seven §49 safety fixtures replayed offline · the offline sweep (conclusions void, see the plan).

**Not done:** the ten-product pilot (D-019) and the Flow length comparison (Part 8b). They remain available in `pnpm p1:handoff` whenever Jakhongir wants to run them.

**Total live AI spend across the whole phase: roughly $2.**


### D-056 · 2026-09-12 · Every prompt comes out the same shape — the cause, and what is missing

Doston generated ten videos from ten prompts across five product categories: *"videos are good… but all of them in one format. There is one structure and it's following one structure."*

Measured: **8 of 9 generated prompts carry the identical 17 sections in the identical order.** Two separate causes, and only one of them was intended.

**1. The fixed order is mine.** D-048 made the seventeen sections mandatory *in a fixed sequence* to force depth after the prompts came out too short. It worked — 342 words became 1,650 — and it flattened every prompt into the same skeleton. The trade was never stated at the time; it should have been.

**2. The action mode almost never fires.** High-energy camera work is gated on `style: energetic-social`. None of the ten used it, so every prompt received *"High-energy camera treatment: not permitted."* Tested directly by regenerating the car as `energetic-social`: the block flipped to permitted, and the prompt changed only marginally — beats moved from 0–2.5/2.5–5.5/5.5–8 to 0–2/2–5/5–8, and the wording gained "quick enough for social energy".

**The deeper reason it barely moved:** source 01 §25 states *"use one dominant camera move per beat"* and *"do not stack whip pans, barrel rolls, crash zooms and multiple orbits"* as unconditional rules, while source 02's HIGH-ENERGY COMMERCIAL MODE explicitly allows whip transitions, crash zooms and speed ramps. §25's conservatism dominates because it is phrased as a rule and source 02's as a permission. **This is a fourth source conflict, alongside C-1 to C-3, and it was never recorded.** Call it **C-6**.

**What exists today:** five styles in `brief.schema.ts` (`clean-studio`, `lifestyle`, `ugc`, `premium-cinematic`, `energetic-social`), and source 01 §9's step-2 picker with an automatic default.

**What does not exist:** any concept of a *creative format* — a different prompt shape, not just a different adjective. The reference prompt Doston supplied is one of these: fast-paced, 0.3–1.5 second shots, whip pans and crash zooms, product assembling and launching toward camera. Nothing in the current design can produce that, because the seventeen-section skeleton and §25's camera rules apply to every generation regardless of style.

**Not built now.** P1 is closed (D-055) and Doston asked for no more code. Recorded as the open design question for a later phase.


### D-057 · 2026-09-12 · C-6 resolved: fidelity is unconditional, pacing belongs to the format

Source 01 §25 protects two different things in one sentence, and conflating them is why every advertisement came out the same (D-056).

| §25 protects | Now |
|---|---|
| **Product legibility** — no revealing unseen surfaces, no impossible physics, no cropping into detail the reference lacks, the product stays recognisable in every beat | **Unconditional.** No format relaxes it. |
| **Pacing and transition vocabulary** — one move per beat, no whip pans, no crash zooms, no speed ramps | **Format-dependent.** This is taste, and source 02's HIGH-ENERGY COMMERCIAL MODE explicitly allows the opposite. |

A whip pan does not endanger a product; revealing an invented sole does. `EXECUTABLE CINEMATOGRAPHY` now states the first group as never relaxed and defers the second to the FORMAT block.

**Resolves C-6** in `docs/BRIEF.md`.

### D-058 · 2026-09-12 · Creative formats decide the prompt's shape

A **creative format** is a versioned config entry, like a video target. It carries the section list *and its order*, the beat count, the shot-length range, the camera vocabulary and the transition vocabulary, plus an energy level that is what unlocks §25's pacing rules (D-057).

`AD_DIRECTOR_SYSTEM_PROMPT_V2` no longer names a single section. It says: use the sections the FORMAT block lists, in that order. Same principle as D-012 — nothing numbered or enumerated in the prompt, everything from config, so a new format is a config entry rather than a prompt rewrite.

Four formats ship, mapped from the `style` the seller already picks (source 01 §9), so no brief changes:

| Format | Styles | Sections | Beats | Shot length | Energy |
|---|---|---|---|---|---|
| `product-film` | clean-studio, premium-cinematic | 17 | 3 | 2–3.5s | restrained |
| `high-energy` | energetic-social | 14 | 5 | 0.6–1.8s | high |
| `lifestyle-story` | lifestyle | 15 | 3 | 1.8–3.5s | moderate |
| `ugc-authentic` | ugc | 12 | 3 | 1.5–3s | moderate |

Every format begins with the same two sections — *Product reference and source of truth* and *Product lock* — whatever else it changes. A test enforces it. An unmapped style falls back to `product-film`, never to an energetic one: a style nobody defined must not silently gain permission to whip-pan around a product.

**Verified on the same car, one photo, four styles:**

| Format | Sections written | Beats | Words |
|---|---|---|---|
| `product-film` | 17 of 17 | 3 | 1,859 |
| `high-energy` | 14 of 14 | 4 | 1,533 |
| `lifestyle-story` | 15 of 15 | 3 | 2,321 |
| `ugc-authentic` | 12 of 12 | 3 | 2,072 |

The high-energy prompt opens *"a sharp flash cut from black"* and uses *"a very quick crash zoom"* — then immediately: *"the grille, left headlamp, and part of the front bumper must remain readable as a car, not just reflections."* Energy and fidelity at once, which is the whole point of D-057.

**The risk, unchanged:** faster cutting gives a video model more room to drift, which is how `gpt-5.6-terra` invented a strap (D-054). The seven §49 safety fixtures still pass. The real test is Flow — one high-energy prompt judged against its reference photo before this direction is trusted.


### D-059 · 2026-09-12 · Video generation stays manual; the tooling removes the friction instead

Doston asked whether generation could be automated — testing ten products by hand means copying a photo, copying a prompt, waiting, repeating. A fair ask, and the rule "the app never automates Google Flow" is about the shipped product, not about his own test harness. That distinction was mine to make and I initially got it wrong.

**Checked, and rejected on cost:** Veo 3.1 is available through the Gemini API with a documented `generateVideos` method taking an image and a prompt — same model family, no browser scraping. But it bills per second: $0.75 for Veo 3, $0.40 for Veo 3 Fast, so an 8-second clip is $3.20–$6.00 and ten products $32–$60. Flow bills against an existing subscription. Doston: "no api, i already spend more money."

**Rejected on risk:** scripting Flow's browser UI with Playwright. It would use the existing subscription and cost nothing extra, but it runs against Doston's own Google account, Google detects automation on consumer properties, and the failure mode is a flagged account rather than a failed test. Available if he ever wants it; not built.

**Built instead — two commands that remove the manual work without generating anything:**

- `pnpm p1:pack` lays out a numbered folder per product holding the photo and the prompt as bare `prompt.txt`, plus an index table. No markdown to pick through, nothing to select around.
- `pnpm p1:check` finds every `video.mp4` dropped into those folders and builds one comparison sheet each: the reference photo beside six frames sampled across the clip, timestamped. Judging ten videos becomes ten glances.

The expensive part was never the clicking — it was comparing frames against the reference by hand, which is how the invented strap and the knit drift were caught (D-054). That part is now one command.


### D-060 · 2026-09-12 · Format test: 2 of 3 pass, and `lifestyle-story` has a structural conflict

Three Flow videos from the same car photo, one per creative format, frames compared against the reference with `pnpm p1:check`.

| Video | Format | Fidelity |
|---|---|---|
| car1 | `product-film` or `high-energy` — **unconfirmed** | **Pass.** Gold bowtie, grille geometry, silver alloys and sedan silhouette intact. Nothing invented. |
| car2 | `lifestyle-story` | **Fail.** A person opens the driver's door, revealing a complete interior — door card, window switches, steering wheel — that the reference never established. |
| car3 | `ugc-authentic` | **Pass.** Wheel design matches, stays on known angles, no invented trim. |

**The failure is not a prompt weakness.** The generated prompt forbade it three separate times: *"The door must remain closed to avoid revealing an invented interior"*, *"avoid cutting to details that the reference cannot support, such as interior controls… dashboard"*, and *"avoid camera paths that expose unknown rear, underside, interior"*. Flow opened the door regardless.

**It is a conflict inside the format.** `lifestyle-story`'s premise is a person using the product, and for a car "using it" means opening a door. The format invites precisely the action the product lock forbids. This will recur for any product whose inside, underside or reverse is not established by a single exterior photo — a bag, a box, an appliance.

**Fixable in config, not in the prompt** (D-058): either give `lifestyle-story` an explicit interaction boundary, or mark it unsuitable where the reference cannot support interaction. **Not fixed** — recorded for whoever takes it up.

**Still open:** which format produced car1. If it was `high-energy`, then fast cutting cost no fidelity and D-057 is validated; if it was `product-film`, the energetic format remains untested in Flow. Doston has the answer.


### D-061 · 2026-09-12 · Google sign-in: a dev OAuth client now, a separate production one at P8

P2 cannot be verified without a signed-in user, and nothing existed. Doston gave browser access and chose the dev/production split over creating one client for both.

**Created under Doston's Google account**, in a new GCP project `jas-ad-studio` (project number `888421139554`) rather than in his existing `media-downloader` project, which holds an unrelated live YouTube API key. Seller credentials do not share a project with unrelated keys.

| | |
|---|---|
| OAuth client | `jas-ad-studio-dev`, type Web application |
| Consent screen | App name `JAS Ad Studio` (placeholder, D-016), support and contact email `dostonqosimiy19@gmail.com` |
| Audience | **External**, publishing status **Testing** — 100-user cap, Doston added as the one test user |
| Redirect URIs | `http://localhost:3040/api/auth/google/callback` and the `127.0.0.1` twin. Google treats them as different origins, so both are registered |
| Scopes | `openid email profile` only. Non-sensitive, so **no Google verification review** is required before the pilot |

**Why two clients and not one.** D-004 puts paid services and customer data in Jakhongir's name, and an OAuth client is the front door to customer accounts — its consent screen shows an app name and support email to every seller. Creating the production client under Jakhongir's account at P8 keeps D-004 intact. The two are independent: the dev one keeps working for local development afterwards.

**The credentials are verified, not assumed.** A first transcription read off the screen was wrong — a lowercase `l` read as a capital `I` — and Google returned `invalid_client`. The corrected value returns `invalid_grant: Malformed auth code` against a deliberately bogus authorization code, which is the response that proves the client id and secret are both accepted. The secret is shown once and cannot be re-read, so this check happened before the dialog was closed.

Values live in `.env` only (git-ignored, verified). `.env.example` documents the variable names, the consent-screen settings and the redirect URIs, with no values.

**One thing Doston did himself, and should stay that way:** ticking "I agree to the Google API Services: User Data Policy". It is a binding developer agreement. Broad browser access is not permission to accept an agreement on his behalf.

**Not yet done, deliberately:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` and `OWNER_EMAILS` are **not** in the zod env schema yet. That is P2 auth code, and project rule 2 puts the plan first.


### D-062 · 2026-09-12 · The seller picks the creative format directly

Doston: *"we will make user to select a format, so i was thinking this as well."*

D-058 mapped format from the `style` the seller already picks, deliberately, so that no brief change was needed. That indirection is now removed: the format becomes the seller's own choice in the wizard.

**Why this matters more than it looks.** Two of the five styles — `clean-studio` and `premium-cinematic` — both map to `product-film`. So the style picker cannot express three of the four formats without the seller knowing the mapping, and nine of the ten test products landed on the same format without anyone choosing it (D-063).

**Consequences, all of them contract-level:**
- `briefSchema` gains a `formatId`. That changes `openapi.json`, and therefore the web repo's generated client (D-031). Session B must be told.
- `projects` carries `format_id` from its first migration in P2, so this costs no later migration.
- What happens to `style` is **not decided** — see the open question below. Nothing is built on `formatId` until it is answered.

**Open, and blocking the P2 brief work only:** does `style` survive alongside `format`, or does `format` replace it? They overlap but are not the same axis — `style` currently carries look (studio, lifestyle, UGC) while `format` carries shape (sections, beats, pacing). Keeping both means the seller answers two questions that sound alike; collapsing them means losing a distinction the prompt assembler uses today.


### D-063 · 2026-09-12 · Video audit: the sameness is mostly one untested format, plus a real shared ending

Eight Flow videos compared against their reference photos with `pnpm p1:check`. Doston's report — *"the format of them almost the same"* — is correct, and it has three separate causes, only one of which is a defect in our config.

**1. Four of the five new videos are literally the same format.** `clean-studio` and `premium-cinematic` both map to `product-film`, so:

| Video | Style | Format |
|---|---|---|
| 01-phones | premium-cinematic | `product-film` |
| 02-rotary-phone | premium-cinematic | `product-film` |
| 03-notebook | clean-studio | `product-film` |
| 05-car | premium-cinematic | `product-film` |
| 10-wipes | lifestyle | `lifestyle-story` |

Across the whole ten-product pack, **nine of ten are `product-film`** and one is `lifestyle-story`. `high-energy` and `ugc-authentic` never appeared. The batch was never a format comparison; it was one format run nine times. D-062 fixes the cause.

**2. Where the format did differ, the video visibly differed.** `10-wipes` (`lifestyle-story`) is a domestic room with a hand entering to pull out a wipe. `car3` (`ugc-authentic`) is an overcast outdoor car park, handheld, unpolished. `car1` and `05-car` (`product-film`) are a dark seamless studio. Those are three genuinely different films, so D-058's mechanism works.

**3. The real shared defect: every format ends the same way.** In all eight clips, the frames at 5.7s, 7.1s and 8.6s are near-identical — the last three seconds settle into a static wide hero. That holds for `product-film`, `lifestyle-story` and `ugc-authentic` alike, so it is not one format's problem.

**A likely cause nobody had connected (hypothesis, untested):** every clip measures **10.00 seconds** while every brief asked for **8**. D-054 recorded this mismatch as a P5 UI requirement and stopped there. But the shot plan ends at 8s, which leaves Flow two unscripted seconds to fill — and filling them by holding the last framing would produce exactly the static tail seen in all eight. If that is right, the sameness of the endings is a **duration bug, not a creative one**, and matching the brief duration to the Flow duration fixes it for free. **Test before trusting:** generate one prompt with `durationSeconds: 10` and compare the ending.

**Answers D-060's open question: `car1` was `product-film`, not `high-energy`.** Its arc, dark studio, pacing and settled ending are near-identical to `05-car`, which is confirmed `premium-cinematic` → `product-film`. `high-energy` specifies 0.6–1.8s shots across 5 beats; three near-identical frames spaced 1.4s apart in the back half rule it out.

**The consequence is the important part: `high-energy` has still never been tested in Flow.** It is the format most likely to answer Doston's complaint — the one with whip transitions, crash zooms and 0.6s shots — and the one whose fidelity risk D-058 flagged as unresolved. It remains both untested and unvalidated.

**Fidelity across the batch: no invented components.** Phones keep three correct colours, logo and camera bar; the rotary phone keeps its dial, cream centre and red button; the notebook keeps its band and page block; both cars keep the bowtie, grille and alloys with the doors shut. One minor drift: the notebook's ribbon marker reads blue in the reference and pale green in the video. Nothing at the level of the invented strap in D-054 or the invented interior in D-060.


### D-064 · 2026-09-12 · Clip duration defaults to 10 seconds

Doston: *"Duration should be ten seconds. Default. I set it to the older session. It didn't change it, I guess."*

**Why it did not change: there was no default to change.** `durationSeconds` was `z.number().positive()` with no `.default()`, so every value came from a per-product `brief.json`, and all 22 of them said 8. The earlier edit had nothing to bite on.

**The evidence agrees with him.** All eight judged Flow clips measure exactly 10.00s against 8s briefs (D-063). Flow makes 10-second clips; asking for 8 guaranteed two unscripted seconds at the end, which is the suspected cause of every clip's identical static tail.

**Changed:**
- `briefSchema.durationSeconds` is now `.default(10)`. This is the wizard's default in P2.
- All 14 `trial/*/brief.json` products moved 8 → 10.
- **`fixtures/*/brief.json` deliberately left at 8.** Their recorded provider responses in `fixtures/__recordings__/` carry 8-second shot timelines, and the timeline validator requires the last shot to end at the brief's duration. Changing the brief without re-recording would fail the suite and cost live AI spend to fix, for no gain: these fixtures test the source 01 §49 safety cases, where duration is irrelevant.

Verified: `lint`, `typecheck`, 253 tests and `openapi:check` all clean. No contract drift, because no HTTP endpoint consumes `briefSchema` yet — P2 is where that starts, and it starts with 10 already correct.

**This is the cheap half of the D-063 hypothesis.** Whether it also fixes the identical endings is still untested: it needs one regeneration and one Flow clip to confirm.


### D-065 · 2026-09-12 · Creative format replaces style; there is no separate style picker

Answers the question D-062 left open. Doston: *"I don't know. Which one is better?"* — so this is my call, made explicitly rather than by drift, and he can overturn it.

**Format replaces style. The seller answers one question, not two.**

Why: the four formats already carry the look. `ugc-authentic` *is* the filmed-on-a-phone look; `product-film` *is* the clean studio look. Keeping both pickers would ask the seller nearly the same question twice and let them contradict themselves — format `ugc-authentic` with style `premium-cinematic` — which the server would then have to resolve by a hidden rule. Hidden precedence rules between two overlapping inputs are what produced C-6 and D-056; we are not building another one.

**Consequences:**
- `briefSchema` gains `formatId` and **drops `style`**. `AD_STYLES` and the style→format mapping in `src/ai/formats/formats.ts` go with it.
- The format list becomes seller-facing, so each format needs an Uzbek label and one line of description. Today's `description` fields are English and written for the model, not the seller.
- `projects` carries `format_id` from its first P2 migration. No later migration.
- Session B's generated client changes (D-031). It has not started yet (D-026), so nothing breaks downstream.

**Not yet built.** This changes the P1 AI core's input contract, so it is a P2 task with its own step in the P2 plan, done test-first, not a side edit.


### D-066 · 2026-09-12 · An asset row describes its own file, not the upload it came from

Found by testing P2 over real HTTP, not by a unit test — the old unit tests asserted the wrong behaviour and passed.

`image.pipeline.ts` read `metadata()` before `.rotate()` applied the EXIF orientation, then returned those numbers for both rows. A phone photo held upright is encoded landscape and tagged orientation 6, so the file was stored correctly as portrait while the API reported it landscape: **transposed, not merely scaled.** Measured: db 3000x2000, file 1365x2048.

**Each rendered copy now reports its own dimensions, taken from the encoder** (`toBuffer({ resolveWithObject: true })`), so `reference` and `model_input` carry different, true numbers.

Why this way rather than rotating the header read: one source of truth. Any "record the original" rule has to answer "original as encoded, or as displayed?", and that question is exactly what produced the bug. A row that describes its own file cannot drift from it.

Supersedes the `ProcessedImage` contract as built — the old doc comment read *"The ORIGINAL dimensions, recorded before resizing, for the assets row"* while `assets.service.ts` called the same values `processedWidth`. Two files, two intents, one wrong answer.

Consequences: `StoredAsset.width/height` in the OpenAPI contract now mean the reference copy's size, capped at 2048. Session B has not started (D-026), so nothing downstream breaks.

### D-067 · 2026-09-12 · A forged OAuth callback is a 400, not a 502

The P2 plan (line 439) specified one error class for the whole Google flow: `GoogleAuthError`, `AUTH_PROVIDER_FAILED`, 502. The implementation followed it exactly, and `auth.controller.ts` threw it for the **state check** — which is a client condition, not a provider one.

Verified against the running server: a missing state, a mismatched state, a missing code and a genuine Google rejection all returned the identical 502.

**`OAuthStateError` / `OAUTH_STATE_INVALID` / 400 is now thrown for the state check.** `GoogleAuthError` keeps 502 for actual provider failures.

Why: the common cause is a seller finishing a sign-in after the ten-minute state TTL. Reporting that as a 5xx pages someone about an outage that isn't happening, and a 5xx alert that cries wolf is how a real outage gets ignored. It also told the seller the wrong thing — "the provider failed" when the fix is "sign in again".

This supersedes the plan, not a decision. Recorded here because the plan was approved as written.

### D-068 · 2026-09-12 · A soft-deleted project's photos stop serving

Delete is soft (`projects SET deleted_at`), and the download query filtered on `id`, `user_id` and `kind` without joining `projects`. Measured: after deleting a project, `GET /projects/{id}/assets` returned 404 while `GET /assets/{id}/reference` returned 200 and the full 16 KB photo. Two routes disagreeing about whether one asset exists.

**`readReference` now joins `projects` and requires `deleted_at IS NULL`.**

Not an isolation break — it was always the same user, and the P2 exit gate held throughout. It is a retention promise: "I deleted that project" has to mean the photo stops being served. Private product photos are the one thing this app holds that a seller cannot get back.

Left deliberately unchanged: `delete` on an individual asset of a soft-deleted project still succeeds. It removes data rather than exposing it, so it needs no guard.

### D-069 · 2026-09-12 · Swagger UI at /api/docs, off in production by default

There was no browsable contract at all — `openapi.ts` generated `openapi.json` at build time and `SwaggerModule.setup()` was never called.

**The UI is mounted at `/api/docs`, from the same document factory that writes `openapi.json`** (`buildOpenApiDocument` in `bootstrap.ts`), so the page a human reads cannot disagree with the client the web repo generates (D-031). Verified: the live `/api/docs-json` is byte-identical to `openapi.json`.

**Off when `NODE_ENV=production`,** unless `SWAGGER_ENABLED=true`. Default chosen, not asked: D-032 puts the API on one public origin behind the tunnel, and the docs page lists every route and request shape. Doston can flip it with one env var if he wants it public.


### D-070 · 2026-09-12 · One branch per phase, cut from `main`

Asked by Doston after P2 merged. Until now the convention was only a habit, and it had already slipped: P0 and P1 were both built on `p0-foundations`, so the branch name stopped describing what was on it.

**Every phase is built on its own branch, `p<n>-<short-slug>`, cut from `main` before its first task.** The slug comes from the phase title in `docs/PLAN.md`: `p3-credits-orders`, `p4-generation-pipeline`. A new phase never continues the previous phase's branch.

It merges to `main` only after the phase's exit check in `docs/PLAN.md` passes and Doston has reviewed it. So `main` is a line of closed phases, each merge is one reviewable phase, and reverting a phase is one commit rather than an archaeology exercise.

`p3-credits-orders` is the first branch cut under this rule.


### D-071 · 2026-09-12 · Doston commits; Claude does not

Asked for by Doston after a session committed three times in a row while working through one task — the task's code, then its `PROGRESS.md` update as a separate commit, then the plan.

**Claude never commits.** Work is left in the working tree, the task is reported with its real output, and Doston reviews the diff and says when to commit. When he does, it is **one commit per task** with that task's doc updates folded in — no separate commit for `PROGRESS.md` or `DECISIONS.md`.

Why: a commit is the point where work stops being reviewable at a glance. Doston reads diffs, and three commits deep into a task he is reading history instead of changes. `git reset` makes it recoverable, not free.

The misreading worth naming: the global `CLAUDE.md` says "prefer small, focused commits over large sweeping changes". That is about the **shape** of a commit, not permission to make one. `commit` is now on the standing gate for that reason.


### D-072 · 2026-09-12 · Packs carry editable placeholder prices and ship inactive

Doston asked for "some prices which are editable" rather than the null prices D-009 implies. Addendum A §A3 forbids inventing prices and A8 forbids showing one before the owner configures a pack, so the two are reconciled by making the price real in the table and unreachable by a seller.

**The seed** (`0005_seed_packs_and_settings.sql`) gives `pack_1` 9,000 som, `pack_5` 40,000 and `pack_15` 105,000, all with `is_active = false`. **Those three figures are Claude's placeholders, not prices Jakhongir has agreed.** They exist so the flow is walkable and the owner edits a number instead of inventing a record.

Two independent rules keep them away from sellers:

1. `GET /api/packs` returns only `is_active AND price_uzs IS NOT NULL`, so the list is empty until an owner acts. A `credit_packs_active_needs_price` CHECK makes the pair impossible to break from any direction.
2. **Activation must re-state the price.** `packEditSchema` refuses `{ isActive: true }` unless the same request carries a `priceUzs`. A placeholder cannot go live by one careless toggle. Verified on the running server: `{"isActive":true}` → 400, path `priceUzs`.

The seed uses `ON CONFLICT DO NOTHING`, so re-running migrations never overwrites a price the owner has since set.

### D-073 · 2026-09-12 · The ledger sign convention, and four new error codes

**`credit_ledger.amount` is always a positive magnitude; the `type` decides direction.** A row reads on its own — "debit 1" is one credit spent, not "amount 0" — and both balances derive from one query:

```
available = Σ purchase + Σ owner_grant + Σ release − Σ reserve
reserved  = Σ reserve  − Σ release     − Σ debit
```

`assertLedgerMatchesAccounts()` in `src/common/testing/ledger.ts` is that query, and every money test in P3 ends on it. Rejected: a signed `amount` meaning the delta to `available`, which would make every `debit` row read `0`.

**Four codes beyond spec §9's list:** `ORDER_NOT_PENDING` (409), `PACK_NOT_AVAILABLE` (409), `GRANT_NOTE_REQUIRED` (400), `PAYMENT_NOT_CONFIGURED` (409). Plus one that is deliberately *not* a `DomainError`: `LEDGER_INVARIANT` is an `InfraError`, 500, because a debit against an empty reservation cannot be caused by a seller — only by our own bug — so it must page us rather than apologise to them.

### D-074 · 2026-09-12 · `site_settings` is built in P3, not P5

Doston deferred it to P5 when the plan was commissioned, then reversed it while the plan was being written: *"add the payment part to phase 3."*

Without it P3 shipped a dead end — a seller could place an order and the app could never tell them where to send money (Addendum A §A4 step 2). One `site_settings` table, `GET /api/settings/public` (works signed out, per spec §3), and two owner routes.

**`POST /api/orders` now refuses with `PAYMENT_NOT_CONFIGURED` when no card, Payme or Click is set.** An order the seller cannot act on banks a pending row the owner can never match to a payment, and a seller who believes they have bought something.

**No card number is seeded.** The migration is committed and this repo will have a remote, so `payment_instructions` ships with every field null and the owner sets it through the API. The D-023 support contacts *are* seeded, because they are published addresses rather than secrets.

**Still out of scope:** automatic Payme or Click checkout. D-008 stands — it needs a registered business and a merchant agreement. Nothing in P3 talks to a provider; the confirm path is one service method so a verified merchant callback can call it later.

### D-075 · 2026-09-12 · The reserve/debit/release primitives are built in P3

Asked of Doston before the plan was written, because `docs/PLAN.md` assigns the generation flow to P4. His answer: build the primitives and their race tests now.

So P3 ships `reserveOne`, `debit` and `release` with nothing calling them but their tests, and **every money method takes an optional `Executor`** (`src/common/db/transaction.ts`) so P4's `POST /generations` can reserve a credit inside the transaction that inserts the generation row — or neither happens.

Why it was worth the extra half day: the reserve race is where a bug costs money, and in P4 it would compete for attention with job leases, sweepers and the AI call. Proven instead in `accounts.race.spec.ts` — one credit against two concurrent reserves, three against ten, a grant racing a reserve, and a 50-operation storm across five users that ends on the invariant. Run five times over, stable each time.

The guard is `WHERE available >= 1` **inside the UPDATE**, never a SELECT followed by an UPDATE. That single statement is what makes concurrency safe without a lock the application has to remember to take (R-3).

### D-076 · 2026-09-12 · An idempotent POST answers 200, not 201

Found by walking P3 by hand against the running server, which is the step that earned its place in P2 (D-066 to D-069).

`POST /api/owner/orders/:id/confirm` was answering **201 Created** — Nest's default for a POST — for an action that creates nothing, and which on a second call is explicitly a no-op returning `{"credited":0,"alreadyPaid":true}`. A client generated from that contract (D-031) would describe a resource that does not exist.

`confirm`, `reject`, `grants` and `orders/:id/cancel` now carry `@HttpCode(200)`. `POST /api/orders` keeps 201: it really does create an order.

Not a money bug — the balance was always right — which is exactly why no unit test saw it. The exit gate asserted the 201 it observed, so **the test was encoding the defect**, the same trap two P2 specs fell into (D-066).


### D-077 · 2026-09-12 · Endpoint coverage is asserted from the contract, not claimed

Doston asked, at the end of P3, whether every endpoint had been tested. It had not. Twelve of the fourteen P3 routes had been driven to a success; `GET /api/owner/users` and `GET /api/owner/orders` appeared only in the 404/401 refusal loops, and **`PATCH /api/owner/settings/support-contacts` had never been called at all**.

The fix is not "add two tests and say yes again". **`src/money.e2e.spec.ts` now records every route that answers 2xx, reads the route list out of `openapi.json`, and fails on any P3 route never driven to a success.** A 404 probe proves a door is shut, not that the room behind it works, so refusals do not count toward coverage.

Verified to have teeth: breaking only the support-contacts call makes the suite report exactly `never driven to a 2xx: PATCH /api/owner/settings/support-contacts`.

Because the list comes from the generated contract rather than a hand-kept array, **a route added to the API without a test that exercises it now fails the build.** Every future phase inherits that.


### D-078 · 2026-09-12 · P4 answers: real key in dev, needs_input cached and capped, a real worker in the tests

Asked of Doston before the P4 plan was written.

1. **Real OpenAI key in dev, fake provider in the suite.** `DAILY_AI_SPEND_LIMIT_USD` defaults to **2**, deliberately low — it is the number standing between a bug and a bill. Spec §11 forbids live AI calls in CI, and a recorded response could not be made to arrive *after its own lease expired*, which is exactly what the late-success race needs. So the fake is scripted (`ready`, `needs_input`, `refused`, `malformed`, `repair-then-ready`, `error`, `hang`), not replayed.
2. **needs_input stays free, but cached and capped** (source 01 §29). Keyed on the user id plus the sorted asset hashes, so photo order does not change the key and two sellers with the same stock photo never share a row. `NEEDS_INPUT_PER_PROJECT_PER_DAY` counts **misses**, never hits — counting hits would lock a seller out of reading the questions they are meant to answer.
3. **The real BullMQ worker runs in-process in the tests, against the real dev Redis.** The only way to test "a late success cannot race a refund".

### D-079 · 2026-09-12 · Two unique indexes on one row make 23505 ambiguous

Found by a flaky test, 1 run in 4, and worth recording because the wrong fix is easy.

`generations` carries two unique indexes and **one row can violate both**: `generations_user_key` means "this is a duplicate click, reuse the job and charge nothing" (§32), while `generations_one_active_per_user` means "a different job is already running, answer 409". `INSERT … ON CONFLICT (user_id, idempotency_key) DO NOTHING` only names the first as its arbiter, so a row breaking both raises `23505` from whichever index Postgres happened to check — and five simultaneous duplicate clicks got 409 about a quarter of the time.

**The answer comes from the data, not from the error.** On a unique violation the service re-reads by key: a row for that key means it was a duplicate click; no row means a genuinely different job is in flight. The lookup runs on the pool, because the aborted transaction can no longer be queried.

**Also: the INSERT comes before the reserve.** A check-then-insert would have all five clicks reserve a credit before the index refused four of them. Letting the database resolve the key first means only the request that actually created the row goes on to spend anything.

### D-080 · 2026-09-12 · A Nest provider must not open a socket in its constructor

`pnpm openapi:generate` hung for ever once `GenerationModule` was registered, and the cause was two mistakes compounding.

**First,** the BullMQ queue built its `Queue` — and a Redis connection — in its constructor. `openapi:generate` boots the whole app purely to read its routes, and every module-wiring test compiles it against stubs; neither has any business connecting to Redis. The queue is now built on first use.

**Second,** it shared the `REDIS_CLIENT` connection. `app.close()` runs every module's shutdown hook in an order nobody controls, and when `RedisModule` quit the shared client first, `queue.close()` waited for ever on a dead socket. The queue and the worker each `duplicate()` the shared client now and close their own, queue first, socket second.

The lesson generalises past BullMQ: **constructing a provider should have no side effects**, because two things in this repo boot the whole application for reasons unrelated to serving traffic.

### D-081 · 2026-09-12 · The ai module gets a port and a Nest module (R-7)

P1 built `generateAdPackage` as a library for the CLI, so it lived in `ai/generate.ts` with no port and no module — fine while only a script called it. P4's worker is its first caller in another module, and the boundary lint correctly refused the direct import.

So `ai/public/generator.port.ts` publishes `AD_GENERATOR`, the outcome types and `LAUNCH_TARGET_ID`, and `AiModule` provides it. **The target is named by id, not passed in**: resolving it is the ai module's business and the worker has no reason to know what a video target is. `LAUNCH_TARGET_ID` is single-sourced — `targets.ts` imports it rather than repeating the string, because two copies would drift apart silently.

Two other ports grew for the same reason: `PROJECT_BRIEF_READER` (the worker needs the whole brief, not the summary a listing shows) and `MODEL_INPUT_READER` on the assets port (the worker needs the 1024 px copies, and `assets` owns both the rows and the files). `AssetsModule` became `@Global()` to match how `AuthModule` and `ProjectsModule` already publish their ports.


### D-082 · 2026-09-12 · A real generation costs 4x what the pricing assumed — **for Jakhongir**

Measured by the P4 hand-walk: one real `gpt-5.5` generation of a real product (the wet wipes from the P1 trial set), end to end through the queue.

| | |
|---|---|
| input tokens | 3,370 |
| output tokens | 5,139 |
| **recorded cost** | **$0.3589 ≈ 4,414 som** |
| Q-02's estimate | 1,100 som ($0.089) |
| | **4.0x the assumption** |
| wall clock | ~60 seconds |

The result itself was good: a 2,251-word English prompt, three contiguous shots covering 0–10s, the target echoed correctly, four fidelity constraints, and properly normalised Uzbek. **The cost is the price of that depth, not a bug** — D-045 and D-048 chose deep prompts with mandatory sections deliberately, and 5,139 output tokens is what that costs.

**Two things follow, and both are Doston's or Jakhongir's call, not ours:**

1. **The pack prices need revisiting before launch.** D-072's placeholder of 9,000 som for one credit leaves a 51% margin at this cost, not the ~87% the 1,100 som figure implied. The 15-credit pack at 105,000 som would leave **34%**. Q-02 recorded the 1,100 som estimate as the basis for pricing; that basis is wrong by 4x and Jakhongir is setting real prices against it.
2. **`DAILY_AI_SPEND_LIMIT_USD` defaults to 2, which buys five generations a day for the entire app.** Fine as a guard against a runaway bug, useless for a 10–15 seller pilot (D-024). It needs raising before P8, and the number is a spend decision, so it is not being changed here.

Not yet known: whether a cheaper model, or a shorter prompt for the simpler formats, would hold the quality D-055 closed P1 on. Worth measuring before repricing — but that is a P1-style experiment, not a P4 task.


### D-083 · 2026-09-12 · The ad package is typed in the contract, and a test keeps it that way

P5's backend pass found one hole, and it was in the worst possible place.

`GenerationDetailDto.package.result` was `z.unknown()`, which put `"result": {}` in `openapi.json` — an empty schema. The web repo generates its client from that file (D-031), so **the ad package would have arrived as `any` on the one screen the studio exists to render**: the concept, the Uzbek shot plan and the prompt. Every other field in the contract was typed; this one was not.

It is now `generationResultSchema`, imported from the ai port rather than restated, so it cannot drift from what the validators actually enforce. The repo **parses** the stored jsonb on the way out instead of casting it: the contract now promises a real §26 shape, so the promise is checked. A package is validated before it is stored, so a failure there would mean the schema changed incompatibly with rows a seller already paid for — which should be loud.

This is T-09's defect one level down: a route can carry a documented body and still describe its most important field as `any`. So `src/contract.spec.ts` now walks every schema and fails on any empty field, checks the ad package's fields by name, and requires a request body on every state-changing route — with a short explicit allowlist for the four that genuinely take only a path and headers, listed so adding one is a decision rather than a regex quietly widening.


### D-084 · 2026-09-12 · Every nullable field in the contract was an array of its own type

Found by regenerating the web client and **reading it**, which is the first time anyone had.

`zod 4` emits a nullable as JSON Schema's `type: ["string", "null"]` — legal JSON Schema, illegal in OpenAPI 3.0 — and somewhere in `createZodDto` → `@nestjs/swagger` → `cleanupOpenApiDoc` that type array is read as `type: "array"`. So **every nullable field in the contract was published as an array of its own type**:

| field | was | is |
|---|---|---|
| `GenerationDetailDto.messageUz` | `string[]` | `string \| null` |
| `GenerationDetailDto.errorCode` | `string[]` | `string \| null` |
| `CreditOrderSummaryDto.payerReference` | `string[]` | `string \| null` |
| `CreditOrderSummaryDto.rejectionReason` | `string[]` | `string \| null` |

The order fields have been wrong **since P3 merged**. A generated client types them that way, so the web app would render a nullable string as a list — and D-031's whole point is that the client cannot drift from the API.

**Setting OpenAPI 3.1 does not fix it**; the information is already gone by then. What makes the repair decidable rather than guesswork is that, *before* `cleanupOpenApiDoc` runs, nestjs-zod leaves `x-nestjs_zod-empty-type: true` on exactly the fields it mangled and **not** on genuine arrays. Verified against seven variants: `.nullable()`, `.nullish()`, `z.union([x, z.null()])` and `.or(z.null())` all carry the marker; `z.array()` and `.optional()` do not.

So `repairNullableFields` in `bootstrap.ts` rewrites `{ marker, type: 'array', items: X }` to `{ ...X, nullable: true }` — OpenAPI 3.0's spelling — and it runs **before** cleanup, because cleanup strips the marker it depends on.

`src/contract.spec.ts` keeps it shut from both sides: the nullable fields must be nullable scalars, **and** a genuine array must come through untouched, so the fix cannot become worse than the bug.

**The lesson is not about zod.** `openapi:check` was green through all of this, and so were 525 tests: nothing on this side reads the contract as a client. The bug was only visible from the web repo, by generating the client and looking at the types it produced.


---

## Inputs recorded but not yet decided

- **Supabase Free:** Jakhongir wanted to start on Supabase's free plan "if it covers what we want." **Settled by D-028: no Supabase.** His goal, zero extra cost, is met by our own Postgres in Docker.
