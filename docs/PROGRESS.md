# PROGRESS

Where the project stands, what is next, and what is blocked. Updated at the end of every step. Decisions live in `/DECISIONS.md`. The roadmap lives in `docs/PLAN.md`.

**Last updated:** 2026-09-13

## Resume here

*A new session starts here. Keep this block current at the end of every step (D-018).*

| | |
|---|---|
| Phase | **P8c — PRO access. Layer 1 built 2026-09-21, uncommitted and not deployed.** P8b is live. Layer 2 (the subscription) is blocked on Q-18. |
| Branch | api **`p8c-pro-access`** (from `main` at `632f03f`), web v2 **`p8c-pro-access`** in the worktree `../jas-ad-studio-web-v2-p8b` on port 3043. The live tree is untouched and still serving P8b. |
| Active plan | **`docs/superpowers/plans/2026-09-21-p8c-pro-access.md`** — Layer 1 done, Layer 2 blocked. |
| Doing now | **Waiting on Doston's review, then a commit and a deploy.** Built: `prompt_access` on an example (migration `0012`, default `'free'` so nothing was locked by the migration), the owner's free/paid switch, **`GET /api/gallery/:slug` answering 403 `PROMPT_LOCKED`** for a PRO prompt without access, the PRO badge and locked panel, the Bepul/Pullik filter, and `pro_access` + `POST /api/owner/pro` so the owner can grant access by hand. D-100. Also **D-101**: a filtered gallery flows from the first slot again — D-099's centring made one card of three sit where it had been. |
| Next | After deploying: **mark one example PRO in `/admin` and look at the page** — no PRO card has been rendered in a browser yet. Then **P8c Layer 2**, the seller-facing PRO order, which D-102 unblocked except for the price; it shows nothing until Jakhongir sets one, exactly as the credit packs screen does today (D-072). |
| Blocked | **The PRO price and the pack prices are both Jakhongir's** (Q-17 / D-082), and they block selling and P9. **Q-18 is answered** (D-102) except the price: PRO unlocks gallery prompts, 30 days, paid by hand, one plan. **Q-04** (which examples get published) is what would close R-011's empty sides. Privacy and terms text still owed by Jakhongir (D-022). The **PROMPTLY** rename is unanswered. |
| Live config | `ad-director-v3`. `DAILY_AI_SPEND_LIMIT_USD=10`, a **rolling 24 h** cap. The public site is still a `next dev` server serving `jas-ad-studio-web-v2` on 3042 — P9 should serve a production build. `/health/ready` is excluded from the `/api` prefix (`bootstrap.ts:18`), so it answers on the origin only and is **404 through the tunnel by design** — check it at `http://127.0.0.1:3040/health/ready`. |
| Last verified state | **2026-09-21, P8c Layer 1.** api: lint, typecheck, build clean, **683 tests in 48 files**, `openapi:check` up to date. web v2 worktree: lint and typecheck clean, **38 unit tests**, **84 Playwright** at 1440/390/360. The filter reflow checked in a real browser at 1440. **Not done:** a PRO card has never been rendered in a browser, because no example is marked PRO yet. |

## 2026-09-13 — phase 7: prompt quality (D-094 to D-097)

Doston supplied two prompts that give him great Flow videos and said ours were flat and
changed the product. After an overreach, where they were read as templates to rebuild the
formats from, he corrected it: *examples, not replacement*. Six lessons were applied to the
existing system prompt and formats as `ad-director-v3`: absolute label rules, talent from
the product, timed shots with a held final shot, grade bans, float/spin/particles for
`high-energy` only (assembly banned everywhere), and the beat limit taken from the format.

Deployed the same evening. The first cap hit was the $2 rolling-24 h spend cap, not a bug;
raised to $10. Three real v3 prompts follow the new structure. D-097 lists what closing it
uncovered for P8.

## 2026-09-13 — phase 6f: the frontend rebuilt from scratch and switched live (D-093, R-009)

Doston judged D-092's dark redesign reskinned rather than designed, so the frontend was
rebuilt as a new app beside v1, from motionsites.ai (feel) and Jakhongir's build (structure),
against the unchanged API.

**Built:** every v1 route and state (landing with search and gallery, `/studiya`, `/admin`
with 7 tabs, `/maxfiylik`, both drawers) in a new monochrome system with Onest. The font was
chosen by rendering Uzbek glyphs: **Sora, Jakhongir's display face, has no U+02BB.** API types
are generated from `openapi.json`, and one client module does all fetch and XHR.

**Found:** three API error codes with no Uzbek copy (now written), and an API gap: the owner
cannot set a first pack price from `/admin`, because nothing lists unpriced packs.

**Switched:** at Doston's instruction, pm2 `jas-web` now serves v2 on 3042 and v1 is stopped.
Doston then compared a softer-contrast variant against it and kept the live look.

## 2026-09-13 — phase 6b: the owner edits what the site shows (D-090, D-091)

Doston asked for the gallery to be editable from `/admin`, asked why the support contacts
appear nowhere, and asked whether a card number he enters will show up. Two of those had
answers before any code was written.

### What was actually wrong

**The contacts were never missing.** They were in `site_settings` and `GET
/api/settings/public` served them; the web app simply never asked outside the credits
drawer and the admin panel, both behind sign-in. So the seller most likely to need help —
the one who has not signed in — had no way to ask for it. They now render in the footer,
server-side, signed out, as labelled cards.

**The card number already worked.** `credits-drawer.tsx` reads `paymentInstructions` and
shows the payment block once one is set. Verified by driving the real screen, not asserted.

**The gallery genuinely did not exist** in the panel, and building it reversed R-5.

### The bug that was blocking him, found from a screenshot

`POST /api/owner/grants` returned 403 and the panel said *"Soʻrov qabul qilinmadi"*. The
api's `.env` had `WEB_ORIGIN=https://jas.kitobnarxi.uz` while he was working at
`localhost:3042`, and the CSRF guard matches one exact origin — so every write from
localhost was refused while every read succeeded. **D-086's failure mode, a second time,
from a different direction.**

`ALLOWED_ORIGINS` was already a `string[]` whose comment read *"A list because dev and
production differ"* — it had simply never been given a second source. `EXTRA_WEB_ORIGINS`
now widens it, `WEB_ORIGIN` stays the single redirect target, and the list is still matched
exactly. Measured after the fix: `localhost:3042` → 401 (CSRF passes, session takes over),
`evil.test` → 403. Then the grant driven through the real form in Chrome: 200, and
`owner_grant 2` in the ledger.

### Built

Three owner routes for the gallery plus an upload, a `hero_photos` settings key with its
own `/admin` tab, and the footer contacts. Uploads are validated by their **bytes**, not
their filename, and stored content-addressed — which is what makes the media route's
year-long immutable cache honest.

### What this phase got wrong, recorded the same day

**R-005: the hero photo screen is not usable.** It announces that default images are in use
and then shows none of them; it cannot replace the third plate, only the whole set. Doston
said so plainly and he is right. **R-006:** the contact cards need icons. Both are logged,
neither is fixed — his call, next session.

**R-001 was attempted and reverted.** Routing "Shu uslubdan foydalanish" to step 1 when the
brief is empty works, but the "Ilhom: …" chip lives inside step 2, so the button then looks
broken. The chip has to move up to the workbench first. Reverted rather than half-shipped,
and the finding is written into the request so nobody rediscovers it.

## 2026-09-13 — the gallery is live, with an honest gap in its provenance (D-089)

Three examples published and rendering on the running stack: the rotary phone, the
notebook and the wet wipes. `pm2 restart jas-api` was needed — **the content file is read
once at boot**, by design — and the page took one revalidation cycle (≤60s) to pick them
up, which is the `revalidate: 60` on the server fetch working as intended.

**D-089, and why the instruction was not followed literally.** Asked which Flow model made
these, Doston answered *"Omni, Veo 3.1 choose randomly"* — a mix of both, and no record of
which made which. Picking at random would have written a claim that is wrong for about
half of them into the one file whose job is to say where the content came from, under a
card that reads *"Promptly prompti asosida Google Flowʻda tayyorlangan namuna."*

So `flowModel` says `Omni yoki Veo 3.1` — what is actually known — and `flowMode` says
`not-recorded`, now a named constant rather than someone's prose. `null` still means
"draft"; `not-recorded` means somebody looked and the record does not exist. A guess
remains the one thing the schema will not take. Flow keeps a generation history, so this
is recoverable whenever he wants to.

## 2026-09-13 — P6 Part B: the gallery on the web (D-088)

`p5-studio-ui` merged to the web repo's `main` first, then Part A merged here, which is
what unpinned the client. Part B built on `p6-gallery` there and merged as `c0a4697`.

**The web gate:** lint and typecheck silent, **61 unit tests**, **57 Playwright
assertions** at 1440, 390 and 360 (from 33), `api:check` matching `main` at 31 paths,
build clean. Driven against a **real API and real clip bytes**, not stubs — the gallery is
the one flow with no session to forge, so `flow.spec.ts`'s stubbing was neither needed nor
honest here.

**Their guard caught me within minutes of the Part A merge.** `errors.test.ts` reads this
repo's `main` and fails when a seller-facing code has no Uzbek copy, so
`GALLERY_EXAMPLE_NOT_FOUND` broke the web build the moment the contract moved. That is the
guard working exactly as designed.

### Two defects a screenshot found that the tests had not

1. **An aborted fetch was reported as a failure.** React's development StrictMode runs
   every effect twice, so the first request is always cancelled by its own cleanup; the
   rejection reached `setError` and put *"Kutilmagan xatolik"* directly above a prompt
   that had loaded perfectly well. It would also have fired in production whenever a
   seller closed the sheet mid-load. The assertion that catches it was **verified to fail
   against the old code** before being trusted.
2. **`conceptUz` read like a system log.** The ingest took it from each report's *Xabar*
   section, which is the generator's handoff message — *"8 soniyalik 9:16 … prompt
   tayyor."* For the rotary phone that was the entire field. The tool now strips that
   sentence and leaves `TODO` when nothing is left, and the three curated concepts were
   rewritten from the clips themselves.

Neither was visible in 57 green assertions. Looking at the page is not optional.

## 2026-09-13 — P6 Part A: the gallery, built and empty on purpose

`docs/superpowers/plans/2026-09-13-phase-6-gallery.md` written, approved, and Part A built
on `p6-gallery`. Recorded as **D-087**.

**The gate, re-run in full:**

```
$ pnpm lint       → $ eslint .      (silent)
$ pnpm typecheck  → $ tsc --noEmit  (silent)
$ pnpm test       → Test Files  46 passed (46)
                     Tests  625 passed (625)
$ pnpm build      → $ nest build    (clean)
$ pnpm openapi:check → openapi.json is up to date.
```

94 new tests. The contract went from 28 to 31 paths: `GET /api/gallery`,
`GET /api/gallery/{slug}` and `GET /api/gallery/media/{path}`, all public.

### The defect the phase existed to close

**`galleryInspirationId` had been accepted and validated by nobody since P1.** It was in
`briefSchema`, in the `projects` table and in the system prompt's `GALLERY INSPIRATION`
block — but `ad-generator.ts` hard-coded `inspiration: null`. A seller could `PATCH` any
string at all and have it stored; nothing resolved it; nothing checked it named a real or
published example. All three are closed, and the field now does what it always claimed to.

### Both new guards were broken on purpose, to prove they work

A test that has never failed is a decoration. The isolation check asserts on the bytes
handed to the provider, not on the resolver's return value:

- **Mis-wire one field** (`mood: example.promptEn`) and 8 assertions fail, including
  `carries no trace of IGNORE ALL PREVIOUS INSTRUCTIONS`.
- **Clear the coverage set** and it reports `never driven to a 2xx: GET /api/gallery,
  GET /api/gallery/media/{path}, GET /api/gallery/{slug}`.

Worth recording: a first attempt at proving teeth **failed to fail**. Spreading the whole
example into the resolver still leaked nothing, because `buildDataBlock` reads six named
fields and ignores anything else. That is real defence in depth — and it is also why the
assertion had to move to the provider call to mean anything.

### Walked by hand, not only asserted

The P5 lesson. A scratch instance on 3055 against a real 1.8 MB ingested clip:

```
GET /api/gallery                      200, no cookie, no headers at all
GET /api/gallery/media/44e9…mp4       200  Content-Length: 1809726
                                           Cache-Control: public, max-age=31536000, immutable
Range: bytes=100000-100999            206  Content-Range: bytes 100000-100999/1809726
Range: bytes=99999999-                416
media/..%2F..%2Fetc%2Fpasswd.mp4      404   (the traversal target really exists, one level up)
```

And the claim that invalid content stops the boot is measured, not asserted: exit 1, with
`examples.0.slug: Invalid input: expected string, received undefined`.

### Why the gallery ships empty

`tools/gallery-ingest.mjs` ingested all 8 real Flow clips from `out/pack` — content-addressed
onto the media volume, posters cut at 1.0 s, metadata read from each clip's own report.
Every entry is `isPublished: false`, and **none was merged into `content/gallery.json`**:

- **Four of the eight are cars**, and source 01 §11 has no car category. Inventing one to
  fit test footage is precisely what §11 forbids.
- The other four map onto real categories but still need a creative preset from somebody
  who watched them, and `flowModel`/`flowMode` from Doston. The schema refuses to publish
  without those (D-011).

So `GET /api/gallery` returns `{"examples":[]}` and the page will render its honest empty
state — D-072's pattern for packs, applied to content. Q-04 is narrowed from an open
question to a three-line list in `docs/OPEN-QUESTIONS.md`.

### Two corrections to the plan, made while building it

1. **The preset filter the plan specified was wrong.** It called for refusing any digit or
   §13 banned noun, which refuses `"hard key at 45 degrees"` and `"light that flatters
   matte materials"` — both legitimate cinematography. A filter that fights the person
   writing content gets worked around. Now a 120-character cap plus seven words that are
   never creative attributes.
2. **`GalleryModule` is registered in `app.module.ts` only.** The plan said both processes;
   `worker.module.ts` imports `AppModule` wholesale, so a second registration would have
   been a duplicate provider, not a safety net.

**One thing found and deliberately not fixed:** `.env.example` still sets
`WEB_ORIGIN=http://localhost:3040`, the value D-086 corrected in the schema default a day
earlier. Anyone copying the example file to `.env` hands themselves the original defect
back. One line, outside P6's scope, flagged rather than quietly widened.

### What closing P5 changed here

P5 is Session B's phase and its code is in `../jas-ad-studio-web`, but walking the whole
flow by hand against a running stack found three defects in **this** repo, all fixed and
merged (D-086):

1. **`WEB_ORIGIN` defaulted to `http://localhost:3040`, this API's own port.** The CSRF
   guard checks the browser's `Origin` against it and the sign-in callback redirects to
   it, so every write from the web app was refused and sign-in landed on the API. Reads
   passed, which is exactly why it looked healthy. Measured: Origin 3042 gave 403
   `CROSS_ORIGIN_REFUSED`, Origin 3040 gave 401. Now defaults to the web dev port.
2. **`GET /api/projects/:id` returned 3 of the brief's 11 fields.** `PATCH` requires all
   11, so reopening a saved project and saving it would have wiped `audience`, `offer`,
   `confirmedClaims` and five more. Source 01 §20 asks for that flow. The route now
   returns the brief beside the summary, reusing the `readBrief` port the worker already
   had. Ownership is unchanged: another user's id is still a 404, never a 403.
3. **The owner panel's generations and spend views had no endpoint.** `GET
   /api/owner/generations` and `GET /api/owner/spend` are reads over data the
   `generations` table already carried, so no schema change. Spend is recorded USD cost,
   never credits, and a test asserts a spend row carries no credit field.

The two endpoint-coverage guards (D-077) did their job: both new routes failed the build
until `money.e2e.spec.ts` drove them to a 2xx.

## 2026-09-12 — P5's generation slice, built to the point where only design is left

Doston asked this session to finish P5 with one condition: *"designing parts should be
done by the second one not by you."* So the logic, wiring, copy and tests are done and
the visual treatment of the two new panels is deliberately plain. Recorded as **D-085**;
the web repo carries `HANDOFF-P5-generation.md` pointing at it.

**Two contract bugs found first, by doing the web repo's job for a moment and reading
what the generator produced.** Nothing on the api side reads its own contract as a
client, so `openapi:check` and 525 tests were green through both:

- **D-083:** the ad package was `z.unknown()`, so `openapi.json` described it as `{}` and
  the client typed the concept, shot plan and prompt as `any` — the whole payload the
  studio exists to render.
- **D-084:** **every nullable field was published as an array of its own type.** zod 4
  emits a nullable as `type: ["string","null"]`, illegal in OpenAPI 3.0, and the
  conversion read that array as `type: "array"`. `payerReference` and `rejectionReason`
  have been `string[]` since P3 merged. OpenAPI 3.1 does not help — the information is
  already gone — but nestjs-zod leaves a marker on exactly what it mangled and not on
  real arrays, which is what made the repair decidable. Verified against seven variants.

`src/contract.spec.ts` now fails on an untyped field, on a nullable spelled as an array,
on a real array wrongly repaired, and on a state-changing route with no documented body.

### The web side

`src/lib/generation.ts` holds the logic with no React in it: start, poll with backoff
(1s → 2s → 3s, giving up near three minutes, because a measured run takes 60s), the TXT
export, copy-with-fallback, the Flow link. Nine tests, including the two that matter —
**a single failed poll is swallowed** because the credit is already spent and the job is
safe in Postgres, and **five in a row give up**.

The pieces worth knowing: one idempotency key per attempt, reused on retry and kept when
a poll fails, because a fresh key is the one mistake that could charge twice; the save
runs before the generate, because the worker reads the brief from the row; only the
prompt reaches the clipboard (§48); and step 3 states the price before the button, not
after (§A2 §16).

**Session B's own guard caught a real gap of mine.** Their `errors.test.ts` reads this
repo's `main` and fails when a seller-facing code has no Uzbek copy — five P4 codes had
none. Fixed, with the credit reassurance where it matters.

**Left for Session B, deliberately:** the visual pass on both panels, and an e2e test of
the gated flow, which needs a sign-in fixture that does not exist in that repo.

Verified there: lint, typecheck, 53 tests, a clean build, `api:check` matching `main`,
and their 18 Playwright checks passing at 360, 390 and 1440.

## 2026-09-12 — P4 merged, and P5's backend side closed

**P4 is on `main` as `bdfaec2`**, nine commits, gate green after the merge: 525 tests in 40 files. `openapi.json` now carries `POST /api/projects/{id}/generations` and `GET /api/generations/{id}`, which is what unblocks P5's generation slice.

### P5, backend side

P5 is Session B's phase in the web repo (D-025, R-8, and its own plan says *"Session B never edits the api repo except for this one file"*). What was left on this side was making sure the contract it consumes is actually usable — and it was not.

**One hole, in the worst place (D-083).** A sweep for untyped fields found exactly one: `GenerationDetailDto.package.result` was `z.unknown()`, so `openapi.json` described the **ad package** as `{}`. The web client generates from that file, so the concept, the Uzbek shot plan and the prompt — the entire payload the studio exists to show — would have arrived as `any`. Now `generationResultSchema`, imported from the ai port so it cannot drift, and **parsed** on the way out of jsonb rather than cast.

`src/contract.spec.ts` keeps it shut: it walks every schema and fails on any empty field, names the ad package's fields, and demands a request body on every state-changing route. It caught a real exemption while being written — `POST .../generations` takes only a path id and an `Idempotency-Key` header — so the four bodyless writes are an explicit list rather than a regex.

**The handoff is verified without touching Session B's files:** `pnpm api:check` in the web repo now reports *"out of date with main, run pnpm api:generate"*. Their lint, typecheck and 44 tests are green, and their client was pinned at `dec385d` (the P3 merge), which is why the admin panel and the whole P3 slice are already built there.

### What is still not ours to do

The generate action, job polling, the inline result, copy-with-fallback, TXT export, the Flow handoff and the `AI_*` error screens are all in Session B's plan and all in their repo. Merging P4 and fixing the contract is the whole of this side's contribution.

## 2026-09-12 — P4 done: the generation pipeline, proven with a real model call

**Gate on `p4-generation-pipeline`:** `lint` and `typecheck` silent, `pnpm test` **525 passed in 40 files**, `build` clean, `openapi:check` up to date. The contract is at **31 operations and 20 component schemas**, both new routes carrying a response shape.

### One real generation, end to end (Task 10 Step 6)

The only real spend in the phase, and the step that has now found something in all three phases it has been run in. A real product (the P1 wet-wipes photo) through the real queue with the real `gpt-5.5`:

```
POST /api/projects/{id}/generations   → 202 {"generationId":"cc868a5e…","status":"queued"}
GET  /api/generations/{id}            → running (12 polls, ~60s) → ready
GET  /api/credits/balance             → {"available":0,"reserved":0}

 type        | amount | linked        status | attempts | provider | model   | in    | out   | est_cost_usd
-------------+--------+--------       -------+----------+----------+---------+-------+-------+-------------
 owner_grant |      1 | f             ready  |        1 | openai   | gpt-5.5 |  3370 |  5139 |     0.358890
 reserve     |      1 | t
 debit       |      1 | t
```

The package: a 2,251-word English prompt, three contiguous shots covering 0–10s, the target echoed back correctly, four fidelity constraints, properly normalised Uzbek. Re-POSTing the same `Idempotency-Key` returned the same generation and charged nothing; a new key on the now-empty balance got **402 `NO_CREDITS`** with no second call — one generation, one billed call, for the whole walk.

### **D-082: it costs 4x what the pricing assumed.** For Jakhongir.

$0.3589 ≈ **4,414 som** per generation, against Q-02's **1,100 som** estimate. The result was good and the cost is the price of that depth — D-045 and D-048 chose deep prompts deliberately, and 5,139 output tokens is what that costs. But two things follow, and neither is ours to decide:

1. **The pack prices rest on a figure that is wrong by 4x.** D-072's placeholder 9,000 som for one credit leaves 51% margin, not the ~87% the old number implied; the 15-pack at 105,000 som leaves **34%**.
2. **`DAILY_AI_SPEND_LIMIT_USD` defaults to 2 — five generations a day for the entire app.** A fine guard against a runaway bug, useless for a 10–15 seller pilot. It needs raising before P8, and a spend limit is not something to change quietly.

### The four exit checks pass

`src/generation.e2e.spec.ts` runs the real worker in-process against the real dev Redis with a scripted fake provider (D-078). All four, over real HTTP:

1. **One credit, two concurrent jobs → one success.** One 202, the other 402 or 409, one package, balance at zero.
2. **A success the client never saw is still a success.** The result is in Postgres; a re-read returns it and the credit stays spent (§32).
3. **A late success is dropped, not paid out next to the refund.** The sweeper fails the job and releases the credit; the stale worker then settles a perfectly good `ready` and writes *nothing* — no package, no second ledger row. Asserted as `['owner_grant','reserve','release']` and no package.
4. **Five duplicate clicks → one job, one charge.**

Plus the four outcomes (`ready` debits, `needs_input`/`refused`/`failed` release), the §29 cache answering with no second call, the one repair attempt, and the gates that refuse before any money moves.

### Three things worth keeping

**A flaky test found a real bug (D-079).** `generations` has two unique indexes and one row can violate both — `generations_user_key` means "duplicate click, reuse and charge nothing", `generations_one_active_per_user` means "409". `ON CONFLICT` names only the first as its arbiter, so a row breaking both raises `23505` from whichever index Postgres checked, and five duplicate clicks got 409 about one run in four. **The answer now comes from the data, not the error**: re-read by key, and a row means it was a duplicate. Also, the INSERT now comes *before* the reserve — a check-then-insert would have all five clicks reserve a credit before the index refused four.

**`openapi:generate` hung for ever (D-080),** and it was two mistakes compounding: the BullMQ queue opened a Redis connection in its constructor, and it shared `REDIS_CLIENT`, so when `app.close()` quit that client first, `queue.close()` waited on a dead socket. The queue is lazy now and owns a duplicated connection it closes itself. **A Nest provider must not open a socket in its constructor** — two things in this repo boot the whole app for reasons unrelated to serving traffic.

**P3's debt is paid.** `credit_ledger.generation_id` has its foreign key, `ON DELETE set null` so a money record outlives the job it describes. It immediately broke five P3 tests that passed stand-in UUIDs — which is the constraint doing its job.

### The dev database needed repairing, and why

A killed `openapi:generate` had left dev with a `generations` table from *before* two columns were added, recorded as applied, so the real migration could not run. All three affected tables held **0 rows**; they were dropped with the orphaned migration record and the migration re-applied cleanly. **Doston's user and sessions were never touched** — verified before and after (1 user, 3 sessions). Migration 9 is recorded and the schema now matches the committed SQL.

### The four gaps Doston's question exposed, now closed

Asked whether P4 was fully tested, the honest answer was no: **0 of 49 plan steps were ticked, only 2 test files existed, and four behaviours had no test at all.** Measured, not guessed — `grep` over the specs found nothing for any of them. Now:

| behaviour | where it is tested |
|---|---|
| daily generation cap → 429 | `generation.service.spec.ts` |
| daily spend cap → 503, credit untouched | `generation.service.spec.ts` |
| needs-input cap → 429, counting misses only | `generation.service.spec.ts` |
| `claim()` under contention, live vs lapsed lease | `lease.spec.ts` |
| the sweeper's `attempts < 3` requeue, and its idempotence | `lease.spec.ts` |
| cache key: photo order, added photo, cross-user isolation | `needs-input.cache.spec.ts` |

**28 new tests across three files.** Two assertions worth keeping: a *lost* concurrent claim must not count as an attempt (three racing workers would otherwise exhaust the retry budget instantly), and re-remembering identical inputs upserts one row — answering the questions a seller was asked must not count against their cap twice.

**Nothing is committed** (D-071) and the branch is not merged (D-070).

## 2026-09-12 — P3 closed: credits, orders and the ledger

**The full gate, on `p3-credits-orders`:**

```
$ pnpm lint       → $ eslint .      (silent)
$ pnpm typecheck  → $ tsc --noEmit  (silent)
$ pnpm test       → Test Files  35 passed (35)
                     Tests  471 passed (471)
$ pnpm build      → $ nest build    (clean)
$ pnpm openapi:check → openapi.json is up to date.
```

75 new tests. The contract went from 18 to 29 operations and 16 to 18 component schemas, every P3 route carrying a request body and a response shape.

### What holds the money together

**The guarantees are in the schema, not in service code.** `credit_ledger_one_purchase_per_order` — `UNIQUE (order_id) WHERE type = 'purchase'` — is Addendum A §A4's idempotency enforced by Postgres, so a double confirm cannot depend on application code being careful. `credit_accounts_non_negative` is the floor under R-3's atomic reserve. 16 tests assert the database refuses each bad write **and name which constraint did it**: a test that only asserts "it threw" passes just as happily when the write fails for an unrelated typo.

**The reserve guard is inside the UPDATE.** `WHERE available >= 1` on the `UPDATE` itself, never a SELECT then an UPDATE. That one statement is what makes concurrency safe without a lock anyone has to remember to take. Proven in `accounts.race.spec.ts`: one credit against two concurrent reserves, three against ten, a grant racing a reserve, and a 50-operation storm across five users — **run five times over, stable each time** (D-075).

**The owner module owns the transaction and passes it down.** The audit row must land in the same transaction as the credit move, but `credits` writing `owner_audit_log` breaks R-7 and injecting an audit writer into `credits` makes the modules mutually dependent. Instead `owner.controller.ts` opens the transaction and `credits` joins it through the same `Executor` parameter P4 will use. One transaction, no cycle, no callback.

**Two things `pnpm lint` refused during the build,** both fixed by depending on a port rather than by touching the config: a test *helper* importing another module's service (the `.spec.ts` exemption does not cover helpers), and the owner controller importing the settings module's DTO file.

### Endpoint coverage is now asserted, not claimed

Doston asked whether every endpoint had been tested. It had not: **12 of the 14 P3 routes** had been driven to a success, and two had only ever been refused —

- `GET /api/owner/users` and `GET /api/owner/orders` appeared only in the 404/401 refusal loops, never as the owner.
- **`PATCH /api/owner/settings/support-contacts` had never been called at all**, by any test or by the hand-walk.

Rather than add the two missing tests and claim completeness again, the suite now proves it. `send()` records every route that returns a 2xx, and a final test reads the route list **out of `openapi.json`** and fails on any P3 route never driven to a success. A 404 probe proves a door is shut, not that the room behind it works, so refusals do not count.

The gate was verified to have teeth: breaking only the support-contacts call makes the full suite report exactly `never driven to a 2xx: PATCH /api/owner/settings/support-contacts`. Because the list comes from the generated contract, a route added to the API without a test that exercises it now fails the build rather than going unnoticed.

Both previously-untested endpoints were then also walked by hand on the running server: `GET /owner/users` → 200 with balances and nothing else; `PATCH /owner/settings/support-contacts` → 200, a bad email → 400 on `email`, an unknown key → 404.

### The hand-walk found what 471 tests could not

Same discipline as P2, and it earned its place again. Walked on the running server with real cookies: empty pack list → activation refused without a price → activated with one → order refused with no payment instructions → instructions set → order placed → **seven confirms of the same order** → one ledger row, balance 5 → reject → cancel → the daily cap at 429 → grant with a note, and refused without one.

**D-076: an idempotent POST was answering 201 Created.** `POST /owner/orders/:id/confirm` creates nothing, and on a second call explicitly does nothing — `{"credited":0,"alreadyPaid":true}` — yet reported 201 because that is Nest's default for a POST. A client generated from that contract (D-031) would describe a resource that does not exist. Not a money bug, which is exactly why no unit test saw it; and **the exit gate had asserted the 201 it observed**, so the test was encoding the defect — the same trap two P2 specs fell into (D-066).

### Decisions

D-072 (placeholder pack prices, inactive, activation must re-state the price) · D-073 (the ledger sign convention and four new error codes) · D-074 (`site_settings` moved into P3) · D-075 (the primitives built here, not in P4) · D-076 (the 201).

**The pack prices are placeholders Claude chose — 9,000 / 40,000 / 105,000 som — not prices Jakhongir has agreed.** They ship inactive, `GET /api/packs` returns only priced *and* active packs, and activation refuses unless the same request states a price. Verified live: `{"isActive":true}` → 400 on `priceUzs`.

**No card number is in any migration.** `payment_instructions` seeds with every field null; the owner sets it through `PATCH /api/owner/settings/payment-instructions`. The D-023 support contacts are seeded, being published addresses rather than secrets.

### What P4 inherits

1. **`credit_ledger.generation_id` has no foreign key.** `generations` does not exist yet; P4's first migration must add the constraint.
2. **Every money method takes an optional `Executor`.** `POST /generations` must reserve a credit inside the transaction that inserts the generation row, or neither.
3. **`reserveOne` already refuses a zero balance with a 402** and leaves no ledger row. P4 wires that gate to the AI call so no paid model call happens on an empty balance (§A5).

## 2026-09-12 — P3 started: the plan, and the transaction helper

**The plan is `docs/superpowers/plans/2026-09-12-phase-3-credits-orders.md`** — 14 tasks, approved by Doston the day it was written. Three of his decisions shaped it:

1. **The reserve/debit/release primitives are built in P3, not P4,** with their concurrency tests. P4 then inherits a proven primitive instead of a primitive plus a job engine to debug at once. This is why every money method takes an `Executor`.
2. **`site_settings` and the payment instructions are in P3.** Deferred to P5 first, then reversed: *"add the payment part to phase 3."* Automatic Payme/Click checkout stays out — D-008 needs a registered business and a merchant agreement.
3. **The packs carry editable placeholder prices, seeded inactive,** and activation must re-state the price. So the numbers exist and are editable, and no price Claude invented can reach a seller. The three placeholder figures are Claude's, not Jakhongir's, and are marked as such in the plan and in D-071.

**Task 1 done.** `src/common/db/transaction.ts`: `withTransaction`, the `Executor` type, and `isUniqueViolation`. Nothing in the codebase ran two statements atomically before this — every service holds a `Pool` and calls `pool.query`.

Two things worth keeping:

- **`Executor` is `Pick<Pool, 'query'>`, not `Pool | PoolClient`.** The union's `query` overloads do not collapse into one callable signature, so every call site would need a cast. This matters because the type is about to appear in two module ports.
- **The leak test is the one that earns its place.** A missing `client.release()` leaves the client checked out — `totalCount` stays 1 while `idleCount` drops to 0 — and the next `connect()` waits forever. Asserting both counts catches it; asserting that the query worked does not.

Verified: 4 tests against a real Postgres, and `pnpm test` **380 passed in 27 files**.

**Task 2 done: the four credit tables**, `drizzle/migrations/0003_remarkable_tyrannus.sql`. The money guarantees are in the schema, not in service code — 16 tests assert that **Postgres** refuses each bad write, and each one checks the constraint *name*, because a test that only asserts "it threw" passes just as happily when the write fails for an unrelated reason.

The three that carry the phase:

- **`credit_ledger_one_purchase_per_order`** — `UNIQUE (order_id) WHERE type = 'purchase'`. This is Addendum A §A4's "confirmation must be idempotent", enforced by the database, so a double confirm cannot depend on application code being careful. Proved twice over: a second `purchase` row for the same order is refused, **and** a `reserve` plus a `release` on that same order are allowed — the index is partial, and if it were a blanket unique, P4 could never release a reservation.
- **`credit_accounts_non_negative`** — `available >= 0 AND reserved >= 0`. The last line of defence under R-3's atomic reserve.
- **`ON DELETE restrict`** on `credit_orders.pack_id` and `credit_ledger.order_id`. A cascade there would erase the record of money changing hands by deleting a pack.

Also asserted: a grant with no note, or a whitespace-only note, is refused (§A3); an active pack with no price is refused (§A8, no invented prices); a `paid` order with no `confirmed_at`, and a `pending` order that claims one, are both refused; a rejected order must carry a reason for the seller; an unknown ledger type or payment method is refused; and a seller's `payer_reference` is bounded at 120 characters.

**Deliberate gap for P4:** `credit_ledger.generation_id` has no foreign key. `generations` does not exist until P4, whose first migration must add it.


### Three things the next session should pick up

1. **`high-energy` has never been tested in Flow.** `car1` was identified as `product-film`, not `high-energy` (D-063), which closes D-060's open question and opens this one. It is the format most likely to answer Doston's "they all look the same", and the one whose fidelity risk D-058 flagged as unresolved.
2. **Every clip runs 10.0s against an 8s brief, and every clip ends in a 3-second static hold.** Probably the same bug (D-063, hypothesis). Test it cheaply: generate once with `durationSeconds: 10` and compare the ending before changing any format config.
3. **`lifestyle-story` invents interiors** (D-060) — but only where interaction reveals unestablished interior. It passed cleanly on wet wipes, where the reference already shows a wipe emerging (D-063). The fix is an interaction boundary, not removing the format.

## 2026-09-12 — the four defects fixed, Swagger mounted, pm2 set up

All four fixed, each with a test that fails against the old code, then re-tested against the running server. **376 tests, 26 files**, plus `lint`, `typecheck`, `build` and `openapi:check` green.

| | fix | measured after |
|---|---|---|
| **D-066** | each copy reports its own post-rotation dimensions, from the encoder | phone photo: db `1365x2048`, file `1365x2048` — match, and portrait |
| **D-067** | `OAuthStateError` / `OAUTH_STATE_INVALID` / 400, split from the 502 | forged state → 400; real Google rejection → 502, still distinct |
| **D-068** | `readReference` joins `projects`, requires `deleted_at IS NULL` | after delete: asset 404, and the project route agrees |
| **D-069** | Swagger UI at `/api/docs` from the shared document factory | 15 operations, byte-identical to `openapi.json` |

**Two tests were asserting the bug.** `image.pipeline.spec.ts` had *"reports the original dimensions, not the resized ones"* and `assets.service.spec.ts` had *"records the original dimensions, not the resized ones"* asserting `width === 3000`. Both passed for as long as the bug existed. That is the whole argument for testing over real HTTP with a real image: a unit test can only check the behaviour someone thought to write down.

**pm2.** `ecosystem.config.cjs` runs `jas-api` and `jas-worker` from `dist/`. The interpreter is pinned to Node 24.19.0 — **the pm2 daemon on this machine runs Node 25**, and without the pin the API launches on a runtime neither CI nor Docker uses. Postgres and Redis stay in Docker; pm2 manages node processes, not containers. `pnpm build` first, every time — pm2 does not build.

**Google sign-in verified by hand (Doston, 2026-09-12).** Task 7 Step 6, and P2's last exit criterion. The outbound leg and the exchange path were already proven automatically — 302 with correct scopes, a bogus code round-tripped to Google in 409 ms — and the success branch is now confirmed in a real browser against a real account. **P2 is closed.**

The row the real sign-in wrote, read back from dev Postgres at 16:22 on 2026-09-12 — one user, one live session, `role = owner` off the `OWNER_EMAILS` allowlist:

```
                  id                  |           email           |      name       | locale  | role  |          created_at
--------------------------------------+---------------------------+-----------------+---------+-------+-------------------------------
 02b63c96-ba53-4d80-8e7b-153b39276bbb | dostonqosimiy19@gmail.com | Doston Sulaymon | uz-Latn | owner | 2026-09-12 10:42:33.741094+00

  token_hash   |           email           | role  |          created_at           |         expires_at
---------------+---------------------------+-------+-------------------------------+----------------------------
 f68baee2d99b… | dostonqosimiy19@gmail.com | owner | 2026-09-12 10:42:33.743495+00 | 2026-10-12 10:42:33.743+00
```

The session is hashed at rest, so the table holds no usable token — `token_hash` is what D-036 asks for, and the 30-day `expires_at` is what D-038 asks for. The same server refuses `GET /api/me` without that cookie, which is the other half of the claim:

```
$ curl -s -w 'HTTP %{http_code}\n' http://localhost:3040/api/me
{"code":"SESSION_EXPIRED","messageKey":"errors.session_expired","requestId":"ae7a54dd-3a04-4896-949e-b47822f51633"}
HTTP 401
```

**Confirmed by Doston, 2026-09-12: "working fine."** He checked the authenticated `GET /api/me` in his signed-in browser. The response body is not pasted here because no session in this repo can read his cookie and forging a session row would make the criterion prove nothing — so this line is his attestation plus the database row above, which is the server's own account of that sign-in. **Task 7 Step 6 is closed.**

**T-09 done in the same session.** The contract went from 15 bare URLs to 4 component schemas, 3 request bodies, 8 response schemas and 15 summaries. Three things cost time and are worth remembering: `z.date()` cannot be represented in JSON Schema at all (zod 4 throws, so `createdAt` is `z.iso.datetime()` — the wire format never changed, only the claim about it); **`pm2` is not on PATH after `nvm use`**, because it lives in Node 22's bin, so `pm2 restart` silently does nothing and stale status reads as live; and a throw before `app.listen()` used to leave the process alive holding the pool, which **pm2 reported as `online` while it listened to nothing** — `main.api.ts` now exits non-zero on a failed boot.

## 2026-09-12 — P2 tested end to end over real HTTP: four defects

A live server on 3040, every route walked with real cookies, real files and one real call to Google. **370 unit tests stay green and the isolation gate holds** — none of these is a cross-user leak. All four are wrong-data or wrong-signal bugs the unit tests cannot see, because each one needs a real image, a real network call, or a real sequence of requests.

**1. EXIF-rotated photos get transposed dimensions.** `image.pipeline.ts:49` reads `metadata()` *before* `.rotate()` at line 96 applies the EXIF orientation, and line 71 returns those pre-rotation numbers. `assets.service.ts:75` then stores them as `processedWidth`/`processedHeight`. Measured, with a JPEG tagged orientation 6 — what a phone held upright produces:

| | db says | file actually is |
|---|---|---|
| `reference` | 3000x2000 | 1365x2048 |
| `model_input` | 3000x2000 | 683x1024 |

The file is rotated correctly; only the recorded dimensions are wrong, and they are **transposed** — the API tells the web app a portrait photo is landscape. Uzbek sellers photograph products on phones, so this is the common case, not the edge case.

**2. `processedWidth` is not the processed width.** The same root cause without any EXIF: both rows carry the *source* dimensions, identical on both, while `bytes` is per-row and correct. A grid laid out from those numbers reserves the wrong box.

**3. A forged OAuth callback reports as a Google outage.** `GoogleAuthError` is one class with `code = 'AUTH_PROVIDER_FAILED'`, `status = 502`, and `auth.controller.ts:51` throws it for a state mismatch — a client condition. Verified: a missing state, a mismatched state, a missing code and a genuine Google rejection all return the identical 502. A seller who leaves the tab open past the 10-minute state TTL gets "the provider failed" and a 5xx alert. **The plan specified this** (line 439), so the plan is what needs changing, not drifted code.

**4. A deleted project's photos still download.** Delete is soft (`projects.service.ts:126`), but the download query (`assets.service.ts:114`) filters on `id`, `user_id` and `kind` and never joins `projects`. Measured on a soft-deleted project: `GET /projects/{id}` 404, `GET /projects/{id}/assets` 404, `GET /assets/{id}/reference` **200, 16,781 bytes**. Two routes disagree about whether the same asset exists. Same-user only, so not an isolation break — but "I deleted that" must mean the photo stops serving.

**What passed, measured not assumed:** a PDF and an SVG renamed `.jpg` both refused on signature (`UPLOAD_DAMAGED`), a 12 MB file refused at 413, an 81-megapixel bomb refused at 400 without decoding · exactly two copies at 2048 and 1024, every EXIF/ICC/XMP/IPTC block stripped · storage paths random and sharded, not served statically on any of four guessed URL shapes, `Cache-Control: private, no-store` · logout revokes instantly and a replayed cookie 401s, an expired session is refused and swept on read · D-037 allowlist promotes, demotes and re-promotes · all 15 routes documented in `openapi.json` · session cookie `httpOnly`, `SameSite=Lax`, `secure` in production.

**Config note for the manual sign-in:** `OWNER_EMAILS` is `dostonqosimiy19@gmail.com`. Signing in with any other Google address gives `role = seller`, correctly.

## 2026-09-12 — P2 built: accounts, projects and uploads

Eleven tasks of `2026-09-12-phase-2-accounts-uploads.md` are committed: the throwaway-Postgres harness, Google sign-in written without an auth library, sessions hashed at rest, the owner allowlist, CSRF, projects with server-side ownership on every query, the decode-first image pipeline, and private uploads. The seller now picks the creative format directly (D-062, D-065) and `style` is gone.

**The exit gate passes.** `src/isolation.e2e.spec.ts` boots the real app on a real socket and runs Alice at Bob's data across nine routes. Every refusal is a 404, never a 403 — a 403 would confirm the id exists, which is itself the leak. It also covers the unauthenticated case on eight routes, both CSRF refusals, and that a downloaded product photo carries `private, no-store`.

Two defects found by running it, both fixed:

- **`drop()` ended the test pool twice.** The db module ends the injected pool in `onModuleDestroy`, so `app.close()` got there first and `drop()` threw `Called end on pool more than once`. All twelve tests passed; the suite still reported FAIL. Every future e2e that boots the app would have hit it. `drop()` now skips an already-ended pool.
- **`app.getHttpServer()` returns `any`,** so reading `.address()` off it failed lint. Typed as `node:http`'s `Server`.

**Not yet done:** the Task 12 commit, and the plan's checkboxes for Tasks 1–11 — including Task 7 Step 6, a by-hand sign-in through a browser, which nothing in the record says was performed. Worth confirming before P2 is called closed.

## 2026-09-12 — eight Flow videos judged, and the sameness explained

Doston supplied the videos and asked why they all look like one format. They do, and `pnpm p1:check` says why (**D-063**).

**The main cause is not the formats — it is that only one format was ever used.** `clean-studio` and `premium-cinematic` both map to `product-film`, so nine of the ten pack products, and four of the five new videos, are the same format. The batch was never a format comparison. **D-062** removes the cause: the seller picks the format directly from now on.

**Where the format did differ, the video differed.** Wet wipes (`lifestyle-story`) is a domestic room with a hand pulling out a wipe; `car3` (`ugc-authentic`) is an overcast car park, handheld; `car1` and `05-car` (`product-film`) are a dark studio. Three genuinely different films. D-058's mechanism works.

**One real shared defect, across every format:** all eight clips settle into a near-static wide hero for their last three seconds. And all eight measure **10.00s against an 8s brief**. The shot plan ends at 8s and Flow has two unscripted seconds to fill — which would produce exactly that tail. If the hypothesis holds, the identical endings are a duration bug (D-054) rather than a creative one, and cost nothing to fix. Not yet tested.

**D-060's open question is answered: `car1` was `product-film`.** Which means **`high-energy` has still never reached Flow** — the one format built to answer this complaint, and the one carrying D-058's unresolved fidelity risk.

**Fidelity held everywhere.** No invented components in any of the eight: phone colours and logos, the rotary dial and red button, the notebook's band, both cars' bowtie and alloys with doors shut. One minor drift — the notebook's ribbon reads blue in the reference, pale green in the video.

## 2026-09-12 — audit, and the P2 blocker cleared

**Full audit of P0/P1 re-run from scratch, not taken on trust.** `pnpm lint`, `typecheck` and `test` all clean, 253 tests in 14 files. The claims in this file match the code.

Evidence was spot-checked rather than assumed: `out/pack/sheet-car2.jpg` was opened and D-060's `lifestyle-story` failure independently confirmed — at 5.7s a person has the driver's door open showing an interior the reference photo never established. A generated prompt (`14-fmt-ugc`, 2,072 words) was read and its product lock is specific and real, not boilerplate.

**Gaps found, none of them blocking a P2 plan:**

1. **No integration-test harness exists.** R-4/D-038 requires money and job logic tested against a real Postgres with a throwaway database per run. Nobody has scoped it. It belongs in P2, because P3 and P4 cannot be verified without it. CI already provisions Postgres and Redis, so no workflow change is needed.
2. **`src/ai/` has no Nest module.** The core is plain functions (`generateAdPackage`); P4 needs a thin wrapper.
3. **`lifestyle-story` is a live defect** (D-060), unfixed. It will spend a seller's credit on invented interiors. Must not reach P5.
4. **One dependency needed for P2** under the standing gate: `@types/multer` (dev only). multer 2.2.0 already ships inside `@nestjs/platform-express`. Google sign-in needs no library.
5. **Stale doc:** D-047 still reads "Omni, details pending"; D-050 retired that question.

**Doston's format concern, answered honestly.** He reports the ten Flow videos still look like one format and asked whether it can be fixed later once the API and Swagger exist. Yes — formats are config (D-058), so it is a config edit. But **Swagger will not make that testing easier**: it checks whether an endpoint returns the right JSON, and cannot tell whether two videos look different. The real loop is edit `formats.ts` → generate → paste into Flow → judge, which `p1:generate` and `p1:check` already do with no HTTP in the way. Defer it, but not on the expectation that the API helps. The one real coupling: if the fix turns out to be "the seller picks a format" rather than "we map it from the five styles", `brief.schema.ts` changes and the contract with it — so P2's `projects` table carries a nullable `format_id` from the start.

**P2's hard blocker is gone (D-061).** A dev Google OAuth client now exists, in its own GCP project, verified against Google's token endpoint rather than assumed. The first transcription was wrong and the check caught it.

**On finishing P2 through P4 in one day: told him no.** That is 12 tables, ~25 endpoints, a Google OAuth flow, a sharp image pipeline, a BullMQ worker with leases and a sweeper, and the credit ledger — plus the race tests spec §11 names. P3 and P4 are the money path. The only way to compress it into a day is to skip the integration tests, which are the entire reason R-4 departed from kitobnarx's unit-only rule. Honest estimate at this project's quality bar: P2 ≈ 1 day, P3 ≈ 1 day, P4 ≈ 1–1.5 days.

## Current position

| | |
|---|---|
| Phase | P0, P1, P1b complete. P2 not started |
| Code | api repo on `main`: NestJS api + worker, the AI core, four creative formats, the CLI harness and the test tooling. No HTTP product endpoints, no database tables, no accounts, no credits, no uploads |
| Repos | `github.com/dostonsulaymon/jas-ad-studio-api` and `…/jas-ad-studio-web` (untouched, D-026) |
| Decisions | D-001 to D-063 |
| Tests | 253 |
| Live AI spend, whole project | about $6 |

## 2026-09-12 — P1b: creative formats, and the Flow test that found their limit

**The problem.** Ten videos across five product categories all came out in one shape. Measured: 8 of 9 prompts carried the identical 17 sections in identical order (D-056).

**Two causes, one of them mine.** D-048 had made the seventeen sections mandatory *in fixed order* to force depth after the prompts came out too short. It worked and it flattened everything; the trade was never stated at the time. And high-energy camera work was gated on a style none of the ten used.

**The deeper cause was a source conflict nobody had recorded.** Source 01 §25 states *"one dominant camera move per beat"* and *"do not stack whip pans, crash zooms"* as unconditional rules; source 02's HIGH-ENERGY COMMERCIAL MODE allows exactly those. Prohibitions beat permissions, so the calm reading always won. Logged as **C-6** and resolved by **D-057**: §25 was protecting two different things in one sentence — product legibility, which is now unconditional in every format, and pacing, which belongs to the format. A whip pan does not endanger a product; revealing an invented sole does.

**Built (D-058).** A creative format is a versioned config entry carrying its own section list *and order*, beat count, shot-length range, camera and transition vocabulary, and an energy level. `AD_DIRECTOR_SYSTEM_PROMPT_V2` no longer names a single section — a test enforces that. Four formats ship, mapped from the `style` the seller already picks, so no brief changes. Every format opens with the same two fidelity sections, and an unmapped style falls back to restrained rather than silently gaining permission to whip-pan a product.

Verified on one car photo: `product-film` wrote 17 sections in 3 beats, `high-energy` 14 in 4, `lifestyle-story` 15, `ugc-authentic` 12 — 1,533 to 2,321 words. Genuinely different shapes, not one skeleton with different adjectives.

**Tooling (D-059).** Doston asked whether generation could be automated. Veo 3.1 *is* available through the Gemini API, but it bills per second — $32–$60 for ten clips against a Flow subscription already paid for. Scripting Flow's browser would cost nothing extra but risks his Google account. Neither built. Instead: `pnpm p1:pack` lays out a folder per product with the photo and the prompt as bare text, and `pnpm p1:check` turns every video dropped into those folders into one comparison sheet — reference photo beside six timestamped frames. The expensive part was never the clicking; it was comparing frames by hand.

**Tested in Flow (D-060): 2 of 3 pass.** `ugc-authentic` and one unconfirmed format held the car perfectly. **`lifestyle-story` failed** — a person opens the driver's door and a complete interior appears that the reference never established. The prompt forbade it three separate times. That makes it a conflict inside the format rather than a prompt weakness: its premise is a person using the product, and for a car that means opening a door. It will recur for any product whose inside is not visible in one exterior photo.

**253 tests. About $6 of live AI spend across the whole project.**

## 2026-09-12 — first real product through the whole chain, and P1 closed

**A real seller's product, end to end.** Beige knit sneakers from shoptextile.uz: photo → our prompt → Google Flow → a watchable advertisement. Doston generated two videos from two models' prompts and I compared extracted frames against the reference photo.

| Prompt from | Verdict | Why |
|---|---|---|
| **`gpt-5.5`** | **usable** | silhouette, colour, sole and heel tab held; no invented branding; survived being worn and walked in. Knit read coarser than the reference, but recognisably the same shoe |
| `gpt-5.6-terra` | **not usable** | added a ribbed webbing strap across the midfoot that the real shoe does not have, and turned the fine knit into a chunky crochet |

The failure is the useful kind — specific and diagnosable. No logo was invented, which is the worst outcome and it did not happen. But an added strap is an invented component, which source 01 §25 forbids and D-019 counts as a fail. Doston: *"I guess it was too smart for such cases."* The larger model elaborated past its reference, which confirms D-052 — bigger is not automatically better for a fidelity task.

**One lesson neither prompt could have prevented:** both videos are 10 seconds, but the brief said 8, so the shot plan was timed to 8 and Flow had two unscripted seconds to fill. The duration the seller picks in Flow must be the duration they enter in the wizard. That is a P5 UI requirement, not a prompt problem (D-054).

**P1 is closed (D-055)** on Doston's decision — "phase one is close it now, no more codes" — rather than by D-019's ten-product measurement. One product was tested, not ten. The record says so plainly: the approach is proven on real input, but the wider gate was not run. `pnpm p1:handoff` remains available whenever Jakhongir wants it.

**Total live AI spend for the whole phase: about $2.**

## 2026-09-11 — P1 Parts 8b and 9 prepared and handed off

Both parts need a person with Google Flow open. Everything that could be built for them is built.

`pnpm p1:handoff <model> <cap> <product dirs...>` writes **`out/flow-pilot.md`**: the same products at 300 / 500 / 700 words, each prompt in a copy-paste block with its Uzbek shot plan and a blank verdict line. It opens with how to run it, what "usable" means (D-019's wording), and the reminder that the app writes prompts while Flow makes the video and nothing touches Google credits automatically. A 3-product pack costs about $0.03 and is generated: 8 videos to judge.

**What is still owed by a human, and by whom:**

| Who | What | Blocks |
|---|---|---|
| Jakhongir | Which Flow mode, and its real durations, aspect ratios and reference rules (D-013) | The target config stays `provisional` |
| Jakhongir | Whether Flow's paste box truncates a long prompt | Nothing now — prompts run 220–350 words, far under any plausible limit |
| Jakhongir or Doston | Run the 8b pilot and pick the prompt length | The `recommendedWords` setting |
| Jakhongir | ~10 real products, mixed categories | The D-019 go/no-go, and therefore the whole phase |

The truncation question turned out to matter less than the plan feared: the model produces 220–350 word prompts whatever it is asked for, so the 1,024-token ceiling is nowhere near binding.

## P1 status — what is done and what is not

**Built, tested and verified:** target config · the output contract, the brief schema and the trusted envelope · the deterministic validators · the merged system prompt V2 · the provider interface and OpenAI adapter · the repair path with its spend cap · the CLI harness · the seven §49 safety fixtures replayed offline · the offline sweep.

**229 tests. Total live spend across every run in the phase: $0.28.**

**Not done, and not doable in code:** the Flow pilot (8b) and the go/no-go (9). P1's exit criterion is "at least 6 of 10 real products give a usable Flow video" — that is a judgement about videos, made by a person, on products we do not have.

**The one finding that could change the product:** `gpt-4.1-mini` saturates at 250–330 word prompts no matter what length it is asked for. Source 02 specifies 500–1,000 words of production-brief depth. Either a larger model is needed — raising cost per package, which D-029's criterion weighs — or source 02's depth expectation is revised against what actually makes good video. Part 8b is where that gets decided, and it needs eyes on real Flow output, not more word counts.

## 2026-09-11 — P0 built (api repo), not committed

Built from `docs/superpowers/plans/2026-09-11-phase-0-foundations.md`. Doston approved P0 up front and asked for it finished in one sitting, reviewed before any commit. **Nothing is committed; the whole of P0 sits in the working tree.**

**Scope corrected first.** `docs/PLAN.md` said P0 covered both repos and included a web shell; D-026 forbids UI before the P1 go/no-go. Doston confirmed api-only (D-039), and the PLAN row was fixed.

**What was built:**
- Repo scaffold: pnpm, Node 24 (`.nvmrc`), strict TypeScript, ESLint with `eslint-plugin-boundaries` enforcing the module-port rule (R-7) from the first module, prettier, vitest.
- `config`: a zod env schema that fails closed, with tests for every failure mode.
- `logger`: pino with redaction covering cookies, tokens, `DATABASE_URL`, the API key, and the prompt/brief/image fields spec §10 names — listed now so no generation code can land before the redaction exists.
- Postgres pool and ioredis client, both with `error` handlers so a dependency blip cannot kill the process, and an advisory-locked migration runner.
- `health`: `/health/live` does no I/O; `/health/ready` checks both dependencies with a per-check timeout.
- The spec §9 error shape `{ code, messageKey, details?, requestId }`, with a filter that never lets an internal message or a 5xx detail reach a caller.
- Two entrypoints on one image: `main.api` and `main.worker`.
- `Dockerfile`, `docker-compose.yml` (deployed) and `docker-compose.dev.yml` (datastores only, separate project and volumes).
- `openapi.json`, generated from the running app (D-031), with a `openapi:check` that fails on drift.
- `.githooks/pre-commit` (no new dependency) and a GitHub Actions workflow.

**Verified with real output, not assumed:**
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (33 passing), `pnpm build`, `pnpm openapi:check` — all clean.
- Dev: `/health/live` 200 and `/health/ready` `{"status":"ready",...}` 200 on 3040.
- Redis stopped → `/health/ready` **503** `{"postgres":"up","redis":"down"}` while `/health/live` stayed **200**; restarted → 200 again with no app restart. Postgres stopped → the same, naming postgres.
- Unknown route → `404 {"code":"NOT_FOUND","messageKey":"errors.not_found","requestId":"…"}`, and an `x-request-id` header on every response.
- Both processes exited on SIGTERM with no stack trace; the worker's keep-alive kept it alive until then.
- Container stack (`--profile app`): postgres, redis, api and worker all healthy; the api's own healthcheck passed; it runs as uid 1000 `node`; image 291 MB. Torn down afterwards.
- The pre-commit hook refused a staged file with a type error, and `git log` confirmed HEAD did not move.

**Found while building:**
- **tsx cannot boot Nest.** The OpenAPI generator first ran under tsx and exited code 1 with no output at all. esbuild emits no decorator metadata, so `NestFactory.create()` cannot resolve constructor types and dies silently. The generator now lives in `src/` and is compiled by `nest build`. Worth remembering: any future script that boots the app must be compiled, not tsx'd.
- **`nestjs-zod` v5 dropped `patchNestjsSwagger`**, replaced by `cleanupOpenApiDoc`.
- **Newest majors resolved on install** — TypeScript 7, ESLint 10, vitest 5, boundaries 7 — and were pinned back to kitobnarx's versions (D-040).
- **Drizzle with no schema files** produces no journal, and `migrate()` throws on the missing folder. The runner logs `No migrations to apply` instead. No table was invented to work around it; the branch stops being taken in P2.
- `.gitignore` had a voice transcript pasted into it from an earlier session. Restored.
- The `/health/ready` route was documenting only 200 in the contract though it can return 503. Fixed before Session B could generate a client from it.

**Mistake, reported:** while testing SIGTERM handling, a `pgrep` pattern matched a kitobnarx container's process and it was sent SIGTERM. `restart: unless-stopped` brought it back within seconds and it verified healthy; no data was touched. Process lookups in this repo now match on `/proc/<pid>/cwd`, not on a command-line string.

**Not verified:** the GitHub Actions workflow has never run — `gh auth login` is still blocked (below). It is not claimed to pass.

### Review run, same day

Doston asked for the five review tests to be run and the results written up. Every one passed; the whole run is on one page: **https://claude.ai/code/artifact/9e78f1ed-42dc-41b0-b150-d03bc5292788**

| # | Test | Result |
|---|---|---|
| 1 | `lint` · `typecheck` · `test` · `build` · `openapi:check` | clean, 33 tests passing, contract up to date |
| 2 | Health probes and the error shape on a running api | `/health/live` 200, `/health/ready` 200, unknown route `404 {"code":"NOT_FOUND","messageKey":"errors.not_found","requestId":"…"}`, `x-request-id` on every response |
| 3 | Redis and Postgres each stopped and restarted | `/health/ready` 503 naming the downed one; `/health/live` stayed 200 throughout; both recovered with no app restart |
| 4 | Pre-commit hook against a staged type error | commit refused, `git log` confirmed HEAD did not move |
| 5 | Container stack | refused to start without `POSTGRES_PASSWORD`; with it, all four containers healthy, api healthcheck passing, running as uid 1000, 291 MB |

Afterwards the deployed stack was torn down with its volumes, the dev api process was stopped, and kitobnarx was confirmed untouched. The dev datastores (5437 / 6384) were left up so Doston can run the same checks himself.

### CI verified — the last P0 gap closed

`gh auth login` succeeded (scopes: `gist`, `read:org`, `repo`, `workflow`), so the old setup token's missing `read:org` is no longer a blocker. The nine P0 commits were pushed to branch `p0-foundations` and **the workflow ran for the first time and passed every step**: install, lint, typecheck, test, build, `openapi:check` — 1m17s against real Postgres and Redis services.

One annotation, not a failure: GitHub is deprecating Node 20 for actions, and `actions/checkout@v4`, `actions/setup-node@v4` and `pnpm/action-setup@v4` are being forced onto Node 24. They still work. Bumping to the v5 actions is a small chore for P7 hardening, or sooner if it starts warning louder.

**With this, P0 has nothing left unverified.** The branch is not merged to `main` — that is Doston's call.

Doston's remaining housekeeping: revoke the old setup token, which no longer has a use.

## Next

1. Doston reviews the P0 working tree and commits it.
2. Write the P1 plan (AI core + the go/no-go), get it approved, then build.
3. Write Session B's kickoff prompt before the P1 go (D-026).

## Owed by Jakhongir (not blocking P0 or P1)

- Pack prices (D-009)
- Final name, and a domain on Cloudflare DNS (D-016, D-032)
- Privacy policy and terms (D-022)
- Gallery clips with their metadata (D-011)
- Pilot sellers (Q-14)
- His OK on deferring voiceover (D-017)
- Production AI billing (D-004)

## Blocked

- ~~**`gh` CLI login**~~ — **resolved 2026-09-11.** `gh auth login` over the browser flow granted `read:org` and `workflow`. CI has run and passed. Doston still needs to revoke the old setup token, which has no remaining use.
- **AI keys:** `.env` holds `OPENAI_API_KEY`, Doston's key for development (D-029). **The variable was renamed from `OPEN_AI_API_KEY` in P0 (D-041)**, with the value carried over; it is the name the OpenAI SDK reads by default. It is optional in the env schema, so CI and a fresh checkout boot without it. The P1 comparison also needs a Claude (Anthropic) key and a Gemini key; without them, P1 compares OpenAI models only. `.env` is git-ignored. Production billing moves to Jakhongir before launch (D-004).
