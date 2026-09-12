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


---

## Inputs recorded but not yet decided

- **Supabase Free:** Jakhongir wanted to start on Supabase's free plan "if it covers what we want." **Settled by D-028: no Supabase.** His goal, zero extra cost, is met by our own Postgres in Docker.
