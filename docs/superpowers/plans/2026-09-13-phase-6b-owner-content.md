# Phase 6b — Owner-editable content

> Spans both repos. Requested by Doston on 2026-09-13, approved in the same message
> ("If you need to plan it, plan, then go to execute. I approve"), to be finished before P7.

**Goal:** Jakhongir can change everything a visitor sees as an *example* — the gallery
clips and the hero photos — from `/admin`, without a deploy. And the support contacts he
has already entered actually appear to the people who need them.

---

## What was actually wrong, measured first

Three questions were asked. Two have answers that needed no code to find.

**1. "Why are the contacts not appearing anywhere on our website?"**

They are in the database and the API serves them. Measured on the running stack:

```
$ curl -s localhost:3040/api/settings/public
{"paymentInstructions":{...all null...},
 "supportContacts":{"telegramUser":"@dostonsulaymon_wk",
                    "telegramBot":"@apl_league_standings_bot",
                    "email":"dostonqosimiy19@gmail.com"}}
```

**The web app never asks for them outside two places:** `credits-drawer.tsx`, which is
behind sign-in, and the admin panel itself. So a signed-out visitor, and a seller who is
stuck *before* buying credits, has no way to reach support at all. D-023 chose three
channels and asked "where is it shown in the app?" — the answer today is "almost nowhere".
That is a gap in P5's wiring, not a settings problem.

**2. "When I add the card number, will it appear on our website?"**

**Yes, already** — `credits-drawer.tsx` reads `paymentInstructions` and gates the payment
block on `hasPaymentInfo`. Nothing more is needed for the card to show. It appears when a
seller opens the credits drawer to place an order, which is where Addendum A §A4 puts it.
This plan verifies it by driving the real screen rather than asserting it.

**3. "Make the gallery updateable from the admin panel."**

Nothing of the sort exists. Gallery metadata is a committed JSON file read once at boot
(R-5), so publishing an example today means editing a file and restarting the API.

---

## Scope: what becomes editable, and what deliberately does not

The request said *"everything which is being shown on website, main website, **as
example**, the pictures and other parts"*. That is read as **example content**, and the
line is drawn there on purpose:

| Editable in `/admin` | Stays in code | Why |
|---|---|---|
| Gallery examples: create, edit, publish, reorder, delete | — | His content, changes without a release |
| Gallery clip + poster files | — | His media |
| Hero tray photos | Their size and tilt | The photos are content; the layout is design |
| Support contacts, payment details, pack prices | — | Already editable |
| — | Hero headline, how-it-works, FAQ, every error string | Product copy |

**Why product copy stays in code, and this is worth an argument if you disagree.** Source
01 §55 rules out a heavyweight CMS and D-037 kept the owner panel small on purpose. More
concretely: every Uzbek string lives in one catalogue that `uzbek-source.test.ts` guards —
it fails the build when a quotation mark is used where `oʻ`/`gʻ` need U+02BB. Moving copy
into a database moves it out from behind that guard, and the first person to type an
apostrophe on a phone keyboard ships mojibake to every visitor. Copy changes are rare and
cheap as a commit. **Say so and I will move it; I would rather flag the cost than quietly
accept it.**

---

## The two locked decisions this reverses

Both need recording before any code, because `DECISIONS.md` wins over everything.

**1. R-5 / D-038 said gallery metadata is a JSON file in the repo, and explicitly named a
`gallery_examples` table as the rejected alternative.** That was right when the owner
panel did not exist and the content was seeded by hand. It is wrong now: a file cannot be
edited by a signed-in owner, a server writing to its own source tree is not a design, and
a container redeploy would discard the edits. **It becomes a table.** Recorded as D-090.

**2. Media is uploaded, never generated server-side.** The ingest tool cuts posters with
`ffmpeg`, which is a system binary that happens to exist on this machine and may not exist
in a container. Making the owner panel depend on it would be a hidden runtime requirement.
**The owner uploads a clip and a poster; the server validates both and stores neither
more nor less.** `tools/gallery-ingest.mjs` keeps its ffmpeg path for bulk local seeding.

---

## Architecture

- **`gallery_examples` table** carrying today's JSON fields, plus `created_at`/`updated_at`.
  The zod schema in `example.schema.ts` stays the single definition of a valid example —
  the table stores it, the schema still validates it.
- **Media** keeps the existing store and the existing public route
  (`/api/gallery/media/*`, immutable caching). Owner uploads are content-addressed by
  hash, exactly as the ingest tool names them, so caching stays honest.
- **Hero photos** are a new `site_settings` key, not a second table: an ordered list of
  `{ path, altUz }` pointing into the same media store. Their size and tilt stay in
  `hero-tray.tsx` because they are layout.
- **Every owner write goes through `/api/owner/*`, writes `owner_audit_log`, and reuses
  `OwnerGuard`.** No new auth path.
- **The JSON file becomes a seed**, applied by a migration, and is no longer read at
  runtime.

---

## Tasks

### Part A — api

- [x] **1. `gallery_examples` table + migration**, seeded from `content/gallery.json` so
      the three live examples survive the move. `GalleryContentStore` reads the table.
- [x] **2. Owner CRUD**: `GET/POST /api/owner/gallery`, `PATCH/DELETE
      /api/owner/gallery/:id`, every write audited. Validation is the existing schema.
- [x] **3. Owner media upload**: `POST /api/owner/gallery/media`, multipart, video or
      image. Real signature checks (not the extension), size caps, content-addressed
      names. Returns the path the example fields reference.
- [x] **4. Hero photos**: a `hero_photos` settings key with its schema, public in
      `GET /api/settings/public`, edited by `PATCH /api/owner/settings/hero-photos`.
- [x] **5. Contract + the coverage guard** extended to the new routes (D-077).

### Part B — web

- [x] **6. Support contacts on the public site.** In the footer, signed out, from
      `GET /api/settings/public` — the answer to question 1.
- [x] **7. Admin: gallery manager.** List, create, edit, publish toggle, reorder, delete,
      with clip and poster upload.
- [x] **8. Admin: hero photos.** Upload, reorder, remove.
- [x] **9. The hero tray reads its photos from the API**, falling back to the committed
      files so the page never renders an empty tray.

### Part C — verify by driving it

- [x] **0. Fix the 403 on every owner write** (found mid-phase): `EXTRA_WEB_ORIGINS`, because the app is legitimately reachable at both the tunnel domain and localhost and the CSRF guard matches one exact origin.
- [x] **10. Drive every part in a real browser** (Playwright against the running stack,
      with a real owner session): set a card number and see it reach the seller's order
      screen; add a gallery example end to end; swap a hero photo; read the contacts in
      the footer signed out. Screenshots, at 1440 and 360.
- [x] **11. Docs**: D-090 (the R-5 reversal), D-091 (what 6b changed), PROGRESS, PLAN.
