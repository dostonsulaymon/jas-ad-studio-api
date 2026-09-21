# P8b — Jakhongir's revisions pass (short plan)

**Status:** approved and built 2026-09-21 (Doston: "finish them all please"). Uncommitted, awaiting his review of the diff. Recorded as D-099.
**Scope:** R-011, R-012, R-013, R-014, R-015. **R-010 is deliberately out** — see *Not in this pass*.
**Branches:** api `p8b-revisions` (cut from `main` at `528dc23`), web v2 `p8b-revisions` (cut from its `main` at `90e9379`).
**Exit check:** both repos' checks green; Playwright at 1440/390/360 green; a gallery example saved as a draft from `/admin` with only a title typed; screenshots at three widths reviewed by Doston.

Most of this is web v2. The api is touched once, in Part 3, and that touch changes a public contract.

---

## The hazard that shapes this plan

**web v2 is the live site.** pm2 `jas-web` runs `pnpm dev` out of that working tree on 3042, and the tunnel serves it at https://jas.kitobnarxi.uz. Every saved file reaches a real visitor on the next hot reload (`jas-ad-studio-web-v2/CLAUDE.md`).

So, exactly as phase 6f did: **build in a git worktree with its own dev server on a free port** (3043), leave pm2 and the live tree untouched, and merge only after Doston has seen it. No part of this plan edits the tree pm2 is serving.

---

## Parts, in order (each ends with a short report; Doston says when to commit)

### Part 1 · The landing's shape — R-011, R-012, R-014 · web only

| # | Change | Where |
|---|---|---|
| 1.1 | Hero headline leading `0.98` → `1.06`, tracking `-0.045em` → `-0.04em` | `src/app/page.tsx:34` (`HeroCopy`) |
| 1.2 | Gallery container `max-w-[1320px]` → `max-w-[1600px]`, grid gains a `2xl:grid-cols-5` step | `src/components/gallery/explorer.tsx:88,145` |
| 1.3 | Remove the "Reklama misollari" heading, its lead paragraph and the visible count; close the gap above the chips | `src/components/gallery/explorer.tsx:89-99` |

**1.3 is the one with a catch.** The `<section>` is `aria-labelledby="galereya-title"`, so the `<h2>` becomes `sr-only` rather than deleted — removing it outright leaves the gallery an unnamed region for a screen reader. The result count (`t.gallery.count`) is `aria-live` and is the only feedback that filtering did anything, so it moves into the chip row as small muted text on the right. The empty-state and no-match blocks stay.

- [x] 1.1 · 1.2 · 1.3 built
- [x] `tests/layout.spec.ts` still green at 360 (no horizontal overflow at the wider container)
- [x] Screenshots at 1440, 390, 360 (in the worktree's `shots/`). **The shots changed the plan:** at 1600 the three cards left a hole where a fourth would be, so a row never has more columns than it has cards and a short row is centred

### Part 2 · Videos play by themselves — R-013 · web only

Autoplay, but the honest version:

- **muted** (`muted` + `playsInline`), or the browser blocks it and the card looks broken;
- **only while on screen**: an `IntersectionObserver` starts a clip when it enters the viewport and pauses it when it leaves;
- **`preload="none"` stays** — the `src` is only attached when a card first intersects, so a visitor who never scrolls downloads one or two clips, not all of them;
- **off under `prefers-reduced-motion: reduce`**, where the poster and the play button stay as they are today;
- the existing play/pause button becomes the manual override, and a manual pause wins over the observer.

Why the care: the clips are served off Doston's machine through the tunnel. With 3 examples naive autoplay costs nothing; the gallery is designed to grow, and at 30 examples "play everything on arrival" is every visitor pulling every megabyte.

`tests/gallery.spec.ts:14` currently asserts *"videos never preloaded"* — `autoplay === false`. That assertion is now wrong by decision, and gets rewritten to the new contract: no `src` until intersecting, `muted` true, and a clip off screen is paused.

- [x] Built in `src/components/gallery/gallery-card.tsx` (+ the shared "only one plays at a time" state in `explorer.tsx` — decide whether that rule survives; the recommendation is that it does **not** apply to autoplay, only to manual play)
- [x] `gallery.spec.ts` rewritten and green at three widths: no `src` before a card is seen, muted and playing once it is, paused again off screen
- [~] **Not** checked in a browser network panel. The e2e test asserts the same property from the DOM (no `src` attribute until the card intersects), which is what decides whether bytes are fetched, but nobody watched the requests

### Part 3 · Adding an example stops fighting the owner — R-015 · api + web

**Two separate defects. The first one is ours and is the reason he is stuck.**

**3a · The error names the field (web only, no contract change).**
The API already returns `details.fields[] = { path, message }` for every validation failure (`src/common/filters/api-error.filter.ts:77`), and `ApiError.details` already carries it into the browser (`src/lib/api/errors.ts:49`). `ErrorNotice` throws it away and prints *"Ma'lumotlarda xatolik bor"* plus a request id — which is exactly the screenshot. `ErrorNotice` grows an optional field list, and the gallery sheet marks the named inputs as invalid and scrolls to the first one.

**3b · A draft requires almost nothing (api contract change — needs Doston's explicit go).**
Today `galleryExampleInputSchema` demands 14 non-empty fields before anything can be saved, including five creative-preset phrases of ≥3 characters. Proposed split — **the full set is still required to publish; nothing an honesty rule depends on is relaxed**:

| Field | Draft | Publish |
|---|---|---|
| `slug`, `titleUz`, `category`, `style`, `aspectRatio`, `sortOrder`, `isPublished` | required | required |
| `videoPath`, `posterPath`, `promptEn`, `conceptUz`, `sourceNote`, `creativePreset.*` | optional (`''`) | required, as today |
| `durationSeconds` | may be `0` | `> 0`, as today |
| `flowModel`, `flowMode` | `null` allowed (unchanged) | required — D-011, D-089, unchanged |

Mechanism: the lenient shape plus a `superRefine` that enforces the full set when `isPublished === true`. The two existing publish refines (provenance, source note) stay exactly where they are.

**The trap to avoid:** `gallery.repo.ts:53` parses every row back through `galleryExampleSchema` on read, which has the same `min(3)` preset rules. Relax the input schema alone and the owner list throws the moment a draft exists. **Both schemas move together, and a test asserts a saved draft round-trips.**

**3c · The form fills in what it can (web only).**
`slug` derived from `titleUz` (still editable); `durationSeconds` and `aspectRatio` read off the uploaded file's `loadedmetadata`; `sortOrder` defaults to `max + 1`. Fields that only matter on publish are grouped under a clearly marked "required to publish" section, so the sheet reads as two short steps rather than one wall.

- [x] 3a built; a Playwright test drives the real sheet against a 400 shaped exactly like the API's and asserts the Uzbek field names appear and the input is `aria-invalid`
- [x] 3b built in `src/gallery/public/gallery.port.ts` and `src/gallery/example.schema.ts`, with tests for: a draft with only a title saves; publishing that draft is refused and says which fields; a draft round-trips through the repo
- [x] `pnpm openapi:generate` run, `openapi:check` clean, web `pnpm api:generate` run
- [x] 3c built
- [ ] **Owed by Doston.** Driving the live `/admin` needs an owner Google sign-in, which a session here cannot do; every screen below it was proved another way (a real HTTP round trip in `money.e2e.spec.ts`, the sheet in Playwright). Steps: `/admin#gallery` → **Yangi namuna** → type only a title → **Saqlash** → it saves as a draft → reopen, tick **Saytda koʻrsatish**, **Saqlash** → it is refused and the missing fields are named

---

## Exit check

- [x] api: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm openapi:check` — 670+ tests green
- [x] web: `pnpm lint && pnpm typecheck && pnpm test && pnpm api:check`, `pnpm test:e2e` at 1440/390/360
- [x] Screenshots at three widths, reviewed by Doston
- [x] `docs/PROGRESS.md` **Resume here** rewritten (it still claims P8 is in progress on `p8-hardening`; P8 closed and merged at `528dc23`/`D-098`)
- [x] R-011 … R-015 marked `done` in `docs/REQUESTS.md` with the branch
- [x] One `D-099` entry recording the two decisions this pass makes: gallery clips now autoplay in view (superseding D-087/D-088's play-on-demand card), and a gallery example may be saved as a draft before it is complete

---

## Not in this pass

- **R-010 (PRO badge, Bepul/Pullik filter).** It overturns D-007 (the gallery and its prompts are free, no sign-in), it was already declined once for this reason in D-092, and what "Pullik" costs is undecided while **Q-17 / D-082 is open and `GET /api/packs` returns `[]`**. A paid badge over a shop that cannot sell is worse than no badge. Needs Jakhongir, then a decision entry, then its own plan.
- **The "PROMPTLY" rename.** Jakhongir's page is titled *Revisions on PROMPTLY*. If the product is being renamed, that is a domain, a source note under every gallery card and a pass over the Uzbek copy — not a task to slip into a revisions pass. Unanswered as of 2026-09-21.
- **R-003, R-007** stay open; this pass is five named items, not the full front-end review.
