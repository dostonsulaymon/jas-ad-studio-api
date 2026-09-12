# Phase 5 — Studio UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This plan lives in the api repo because that is where all planning docs live. Every file it creates is in `../jas-ad-studio-web`.** Session B never edits the api repo except for this one file (spec §13, D-025).

**Goal:** An Uzbek seller opens the studio, signs in with Google, fills in the brief, uploads product photos, and sees their own projects. Every screen works at 360 px and is comfortable at 390 px.

**Scope warning, read this before anything else:** the PLAN.md P5 row describes the *whole* studio including credits, order screens, the inline result, the Flow handoff and the `/admin` panel. **None of those is buildable today.** This plan covers only the slice the merged API supports. The rest is listed in [Blocked work](#blocked-work-and-what-unblocks-it) with the phase that unblocks each. Do not invent an endpoint that is not in the contract; if a task seems to need one, stop and ask.

**Design direction:** **A — "Ish stoli" (the worktable)**, chosen by Doston on 2026-09-12 from three directions.

- Static artboards, committed: `../jas-ad-studio-web/docs/design/direction-a.html` with its photos in `docs/design/img/`. Open it in a browser; it is the source of truth for layout, spacing and copy.
- Published board with all three directions and the font evidence: <https://claude.ai/code/artifact/e9fd63e1-2529-479e-87ca-4563f0cb1e7a>
- The two structural ideas that must survive implementation:
  1. **The hero's main visual is a tray of product photos bleeding off both edges, with one empty slot cut into it.** The slot is the file input. The seller's photo is the missing piece of the tray, not a button below a headline.
  2. **The studio is a two-pane workbench: controls left, the seller's product pinned right.** The product is visible for all three steps and never scrolls away. On a phone the right pane becomes a sticky strip under the step bar.

**Spec:** `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` (§8 Web, §9 Errors, §13 Coordination) and source 01 §4, §5, §6, §8, §20, §38–§40, §47, §48.

---

## The contract boundary — read this before Task 1

**On 2026-09-12 the api repo's working tree on branch `p3-credits-orders` contains uncommitted P3 routes** (`/api/packs`, `/api/credits/balance`, `/api/orders`, `/api/owner/*`) **and a regenerated `openapi.json` carrying them.** They are not committed, not reviewed, and not merged. A web client generated from that file would be built against shapes that can still change.

**Therefore the generated client is pinned to `main`, not to the api working tree.** `main` is a line of closed phases (D-070), so pinning to it means the web app only ever compiles against contracts that passed their phase exit check.

What `main` actually holds today, verified:

| | |
|---|---|
| Paths | 11 (15 operations) |
| Component schemas | `CurrentUserDto`, `BriefDto`, `ProjectSummaryDto`, `StoredAssetDto` |
| Commit | `1b28172 feat(openapi): Swagger UI, and a contract with shapes in it` |

The 15 operations, and whether P5 uses them:

| Operation | Used by | Task |
|---|---|---|
| `GET /health/live`, `GET /health/ready` | not used by the web app | — |
| `GET /api/auth/google` | "Kirish" — a full-page navigation, never `fetch` | 8 |
| `GET /api/auth/google/callback` | Google calls this, never the web app | — |
| `POST /api/auth/logout` | "Chiqish" | 8 |
| `GET /api/me` | session state, owner role | 8 |
| `POST /api/projects` | step 3 saves the brief | 13 |
| `GET /api/projects` | the history drawer | 14 |
| `GET /api/projects/{id}` | reopening a project | 14 |
| `PATCH /api/projects/{id}` | editing a saved brief | 13 |
| `DELETE /api/projects/{id}` | deleting a project | 14 |
| `POST /api/projects/{projectId}/assets` | photo upload, multipart, `photo` field | 11 |
| `GET /api/projects/{projectId}/assets` | the project's photos | 11 |
| `GET /api/assets/{id}/reference` | rendering a photo, cookie-authenticated | 11 |
| `DELETE /api/assets/{id}` | removing a photo | 11 |

`BriefDto` is the whole brief and it is **11 fields, all required in the request body** (nullable where optional to the seller):

| Field | Type | Wizard step |
|---|---|---|
| `productName` | string 1–200 | 1 |
| `description` | string 1–2000 | 1 |
| `goal` | `awareness \| sales \| launch \| trust` | 2 |
| `formatId` | `product-film \| high-energy \| lifestyle-story \| ugc-authentic` | 2 |
| `platform` | `instagram \| telegram \| tiktok \| youtube-shorts` | 2 |
| `aspectRatio` | `9:16 \| 16:9 \| 1:1` | 2 |
| `durationSeconds` | number > 0, default 10 | 2 |
| `audience` | string 1–200, nullable | 2 |
| `confirmedClaims` | array ≤ 10 of `{ claim: string, verified: boolean }` | 2 |
| `offer` | `{ description, priceUzs: int\|null, validUntil: date\|null }`, nullable | 2 |
| `galleryInspirationId` | string, nullable | blocked, P6 |

**Every field is required in the JSON body.** A seller who skips the optional ones still sends `"audience": null`, `"offer": null`, `"confirmedClaims": []`, `"galleryInspirationId": null`. The form must build a complete object, not a sparse one.

**Two contract gaps that are not bugs, just missing:**

1. **There is no endpoint listing the four formats or the four goals**, and D-065 says each format needs a seller-facing Uzbek label and one line of description. Those strings do not exist anywhere yet, in either repo. Task 12 hard-codes them in the web i18n catalogue and Doston approves the wording. See proposed decision **W-003**.
2. **`GET /api/assets/{id}/reference` is the only way to render a photo** and it is cookie-authenticated with `Cache-Control: private, no-store`. It works in a plain `<img src>` because the cookie rides along on a same-origin request. It does **not** work with `next/image` optimisation, and it is never a public URL (spec §7.4).

---

## Global Constraints

- **Never hand-write an API type (D-031).** Everything under `src/lib/api/generated/` is produced by a script and is git-ignored except the generated file itself, which is committed so CI does not need the api repo.
- **The generated client is pinned to `main` of the api repo.** `pnpm api:generate` reads `git -C ../jas-ad-studio-api show main:openapi.json`, never the working file. `pnpm api:check` fails if the committed client is out of date. There is one escape hatch, `pnpm api:generate --from-worktree`, for testing against an unmerged branch locally; its output must never be committed.
- **One branch: `p5-studio-ui`, cut from `main` of the web repo before Task 1 (D-070).**
- **Requests go to same-origin `/api`.** Next rewrites `/api/*` to the NestJS port in dev (D-032). No CORS, no absolute URLs, no API host in client code.
- **Every state-changing request sends `X-Requested-With`** and is same-origin, or the API returns `CROSS_ORIGIN_REFUSED`. This is enforced in one fetch wrapper; no component calls `fetch` directly.
- **Uzbek Latin uses U+02BB (`ʻ`) for `oʻ`/`gʻ` and U+02BC (`ʼ`) for the tutuq belgisi.** This is what the API already emits. Never U+2018, never ASCII `'`. Task 2 adds a lint rule that fails the build on the wrong codepoint.
- **Never imply the app makes videos.** The primary action is **"Reklama promptini tayyorlash"**. The word "video" appears only next to "Google Flow".
- **No prices, no counts, no testimonials, no examples** that are not real and configured. There are no free prompts (D-007), so source 01 §4's CTA "3 ta bepul promptdan boshlash" and §41's FAQ entry about free prompts are both dead. Do not use them.
- **All API text renders as plain text**, never `dangerouslySetInnerHTML`.
- **Money is out of scope.** P5-as-planned writes no order and reads no balance. If a task seems to need one, stop and ask.
- **Accessibility floors, not aspirations:** semantic HTML, real `<button>`, a visible focus ring on every interactive element, labels tied to controls by `id`, icon-only buttons labelled, dialogs that trap and restore focus, status changes announced with `aria-live`, and `prefers-reduced-motion` honoured everywhere.
- **Mobile floors:** usable at 360 px, comfortable at 390 px, tap targets ≥ 44 px, form controls ≥ 16 px so iOS does not zoom, no horizontal page overflow at any width.
- **Motion is 160–280 ms** and purposeful. No scroll hijacking, no custom cursor, no WebGL, no constant background animation.
- **Node 24.** `nvm use` before any command in this plan. Task 1 commits `.nvmrc`.
- **Verification is by real output.** A task is done when its command is run and its output pasted, not when it looks right.

---

## File Structure

| File | Responsibility |
|---|---|
| `.nvmrc` | `24.19.0` |
| `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs` | Scaffold, mirroring kitobnarx-web (D-035) |
| `scripts/generate-api-client.mjs` | Reads `main:openapi.json` from the api repo, writes the typed client |
| `src/lib/api/generated/schema.ts` | **Generated. Never edited by hand.** |
| `src/lib/api/client.ts` | The one fetch wrapper: same-origin `/api`, CSRF header, typed error envelope |
| `src/lib/api/errors.ts` | `ApiError` with `code`, `messageKey`, `requestId`; `isApiError` |
| `src/lib/i18n/uz-Latn.ts` | Every visible string, including `errors.*` |
| `src/lib/i18n/index.ts` | `t(key, vars?)`; throws in dev on a missing key |
| `src/lib/brief.ts` | Client-side brief shape, defaults, and the mapper to `BriefDto` |
| `src/app/globals.css` | Design tokens from the locked palette, Inter, the type scale |
| `src/app/layout.tsx` | `<html lang="uz-Latn">`, fonts, skip link |
| `src/app/page.tsx` | The one page: hero, studio, how it works, FAQ, footer |
| `src/components/site-header.tsx` | Nav, "Kirish" / account, "Loyihalarim" |
| `src/components/site-footer.tsx` | Footer |
| `src/components/hero-tray.tsx` | The tray: photos bleeding both edges with the drop slot cut in |
| `src/components/studio/workbench.tsx` | The two-pane shell; product pinned right |
| `src/components/studio/step-rail.tsx` | 1–2–3 with state |
| `src/components/studio/step-product.tsx` | Step 1: photos, `productName`, `description` |
| `src/components/studio/step-direction.tsx` | Step 2: goal, format, platform, ratio, duration, audience, claims, offer |
| `src/components/studio/step-review.tsx` | Step 3: review and save |
| `src/components/studio/photo-rail.tsx` | Thumbnails, primary selection, remove, add |
| `src/components/studio/upload-list.tsx` | Per-file upload state: queued, uploading, done, refused |
| `src/components/projects-drawer.tsx` | History drawer with focus management and the empty state |
| `src/components/error-notice.tsx` | One Uzbek error component: message plus a recovery action |
| `src/hooks/use-session.ts` | `GET /api/me`, signed-in state |
| `src/hooks/use-draft.ts` | Wizard state, restored from `sessionStorage` |
| `tests/*.spec.ts` | Playwright at 390 px and desktop |

---

## Standing-gate approvals needed before starting

Ask Doston, one at a time, and do not install anything until he answers.

1. **Runtime dependencies: none beyond `next`, `react`, `react-dom`.** Confirm that is still acceptable; everything in this plan is hand-written on top of the framework.
2. **Dev dependencies to add, beyond the kitobnarx-web set:**
   - `openapi-typescript` — generates `src/lib/api/generated/schema.ts` from `openapi.json`. This is the D-031 tool and was flagged in D-031 as a dependency to pick here.
   - `@playwright/test` — the P5 exit check in `docs/PLAN.md` requires Playwright.
3. **The font changes from Manrope to Inter.** See proposed decision **W-001** below. This supersedes half of D-035 and needs Doston's approval before Task 2.

---

## Proposed DECISIONS entries

**Do not write these into `DECISIONS.md` yourself.** `DECISIONS.md`, `docs/PROGRESS.md` and `docs/PLAN.md` are being edited right now by the P3 session and will conflict. Hand these to Doston to add once P3 planning lands.

### W-001 · Uzbek Latin uses U+02BB, and the display face changes from Manrope to Inter

**Measured, 2026-09-12.** Manrope has no glyph at U+02BB (MODIFIER LETTER TURNED COMMA) or U+02BC (MODIFIER LETTER APOSTROPHE) — the two characters standard Uzbek Latin uses for `oʻ`, `gʻ` and the tutuq belgisi. The API **already emits U+02BB 657 times and U+02BC 14 times** across the Uzbek shot plans in `out/pack`, so every shot plan the seller reads would render with a substituted fallback face mid-word. The planning documents separately use U+2018 (27 times), a quotation mark rather than a letter, which breaks line breaking, double-click word selection and search.

Checked for both codepoints: **Inter ✓, IBM Plex Sans ✓, Noto Sans ✓. Manrope ✗, Figtree ✗, Outfit ✗ (U+02BB), DM Sans ✗, Plus Jakarta Sans ✗.**

**Decision:** U+02BB and U+02BC are canonical everywhere — API, database, web app, source documents. The web app normalises U+2018, U+2019 and ASCII `'` to U+02BB on input, and stores the canonical form. The display and body face becomes **Inter**.

**Supersedes:** the "Manrope" half of D-035. The rest of D-035 (Tailwind v4 via `@tailwindcss/postcss`, tokens in one file, 12–18 px radius, no component library) is unchanged. Source 01 §5 already permits "Manrope **or a suitable equivalent supporting Uzbek characters**", so this is the source document's own escape hatch, not a departure from it.

**Cost, accepted:** Inter is a more neutral face than Manrope. Legibility in the actual language beats character.

**Owed by the api session:** the planning documents and any Uzbek string in the api repo should be normalised to U+02BB in a separate pass. Not blocking P5.

### W-002 · The web client is generated from `main`, never from the api working tree

`pnpm api:generate` reads `git -C ../jas-ad-studio-api show main:openapi.json`. The web app therefore only compiles against contracts that have passed a phase exit check and merged (D-070). On 2026-09-12 the api working tree held uncommitted P3 routes; generating from it would have pinned the web app to unreviewed shapes.

`pnpm api:generate --from-worktree` exists for local integration testing against an unmerged branch. Its output is never committed; `pnpm api:check` fails if it is.

**Extends D-031**, which said the client is generated but did not say from which revision.

### W-003 · Seller-facing Uzbek labels for `goal` and `formatId` live in the web i18n catalogue

The contract exposes no endpoint listing the four goals or the four formats, and D-065 requires each format to have a seller-facing Uzbek label and one line of description. Until the owner needs to edit them without a deploy, they are hard-coded in `src/lib/i18n/uz-Latn.ts`, keyed by the enum value. The generated client's union types mean a contract change breaks the web build loudly, which is the guarantee D-031 exists for.

If the owner ever needs to edit this copy, it becomes a `GET /api/formats` endpoint and an owner-panel screen, in P6 or later.

### W-004 · Project history is a drawer, not a page

Confirms spec §8 and source 01 §20 against direction A: `/` stays the only route for the seller-facing app. Reopening a project loads it back into the studio rather than navigating.

---

## Task 1: Branch, scaffold, and a green gate on an empty app

Nothing exists in `jas-ad-studio-web` but `CLAUDE.md` and `README.md`. This task produces a Next.js 16 App Router app that lints, typechecks and builds, mirroring kitobnarx-web (D-035), and nothing else. Resist adding UI here.

**Files:**
- Create: `.nvmrc`, `.gitignore`, `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: Cut the branch**

```bash
cd ~/projects/jas-ad-studio-web
git checkout main && git pull --ff-only 2>/dev/null || true
git checkout -b p5-studio-ui
git branch --show-current
```

Expected: `p5-studio-ui`.

- [ ] **Step 2: Pin Node and scaffold**

```bash
echo "24.19.0" > .nvmrc
nvm use
node -v
```

Expected: `v24.19.0`.

Create `package.json`. Mirror kitobnarx-web's dependency set exactly; only the name, the ports and the extra scripts differ. Ports: dev on **3042**, start on **3041** — kitobnarx-web already holds 3032 and 3030, and the api holds 3040 and 3041 for its own containers, so check nothing is listening before committing to these.

```json
{
  "name": "jas-ad-studio-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3042",
    "build": "next build",
    "start": "next start -p 3041",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "api:generate": "node scripts/generate-api-client.mjs",
    "api:check": "node scripts/generate-api-client.mjs --check",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "next": "16.3.0",
    "react": "19.2.8",
    "react-dom": "19.2.8"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.3.0",
    "tailwindcss": "^4",
    "typescript": "^5"
  },
  "packageManager": "pnpm@11.20.0"
}
```

`postcss.config.mjs` — **`@tailwindcss/postcss`, not `tailwindcss`.** The v3 plugin name silently produces no CSS under v4:

```js
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
```

`tsconfig.json`: `"paths": { "@/*": ["./src/*"] }`, matching kitobnarx-web.

`eslint.config.mjs`: copy kitobnarx-web's, which composes `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`.

- [ ] **Step 3: The dev proxy to the API (D-032)**

`next.config.ts`:

```ts
import type { NextConfig } from 'next';

// One origin, API under /api (D-032). In dev, Next forwards to the NestJS port so the
// browser only ever sees same-origin requests: no CORS, and the session cookie is a
// plain httpOnly cookie on one host. In production the tunnel does this instead, so
// the rewrite is dev-only and must not shadow the tunnel's own routing.
const API_ORIGIN = process.env.API_ORIGIN ?? 'http://127.0.0.1:3040';

const nextConfig: NextConfig = {
  async rewrites() {
    if (process.env.NODE_ENV === 'production') return [];
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
};

export default nextConfig;
```

- [ ] **Step 4: Install and prove the gate**

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm build
```

Expected: `lint` silent, `typecheck` silent, `build` completes with a route list containing `/`. Paste the real output.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: Next.js 16 App Router scaffold, Tailwind v4, dev proxy to /api (D-032, D-035)"
```

---

## Task 2: Design tokens, Inter, and the Uzbek codepoint rule

The palette is locked by `jas-ad-studio-web/CLAUDE.md` and is not open for reinterpretation. This task puts it in one file and makes the wrong apostrophe a build failure.

**Blocked on:** Doston approving **W-001** (Inter). Do not start until he has.

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/lib/uzbek.ts`, `src/lib/uzbek.spec.ts`, `eslint-rules/uzbek-apostrophe.mjs`
- Modify: `eslint.config.mjs`

- [ ] **Step 1: Tokens**

`src/app/globals.css`. Every value comes from `CLAUDE.md`; the two stone tints are the only additions and they are the background mixed toward the border, nothing new.

```css
@import "tailwindcss";

/**
 * The palette is fixed by jas-ad-studio-web/CLAUDE.md and source 01 §5. Changing any
 * value here needs a DECISIONS.md entry and Doston's approval. Product photography
 * supplies the rest of the colour; the interface never recolours a seller's product.
 */
@theme {
  --color-bg:      #F6F5F1;
  --color-ink:     #17211D;
  --color-muted:   #56625C;
  --color-primary: #163D32;
  --color-accent:  #D9F36A;
  --color-border:  #DEDFD7;
  --color-stone-1: #EDECE6;
  --color-stone-2: #E6E5DE;

  --radius-sm: 12px;
  --radius-md: 14px;
  --radius-lg: 18px;

  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
}
```

**Single theme, deliberately.** The palette is one warm off-white ground; there is no dark mode and no theme toggle. Paint `background` and `color` on `body` explicitly so the page does not borrow a host ground.

**Motion:** one `--duration` scale of 160/220/280 ms, and a global `prefers-reduced-motion: reduce` block that collapses every transition and animation to `0.01ms`.

- [ ] **Step 2: Inter, self-hosted through `next/font`**

In `src/app/layout.tsx`, `import { Inter } from 'next/font/google'` with `subsets: ['latin', 'latin-ext']` and `variable: '--font-inter'`. `latin-ext` is what carries U+02BB; without it the font loads and the Uzbek marks still fall back. Set `<html lang="uz-Latn">`.

- [ ] **Step 3: Write the failing test for input normalisation**

```ts
// src/lib/uzbek.spec.ts
import { expect, it } from 'vitest';
import { normalizeUzbek } from './uzbek';

it('normalises every apostrophe a seller can type to U+02BB', () => {
  expect(normalizeUzbek("o'zbek")).toBe('oʻzbek');   // ASCII
  expect(normalizeUzbek('o‘zbek')).toBe('oʻzbek'); // left single quote
  expect(normalizeUzbek('o’zbek')).toBe('oʻzbek'); // right single quote
  expect(normalizeUzbek('oʻzbek')).toBe('oʻzbek'); // already canonical
});

it('leaves a real apostrophe in a Latin loanword alone', () => {
  // Only o' and g' are Uzbek marks. Nothing else is rewritten.
  expect(normalizeUzbek("L'Oreal")).toBe("L'Oreal");
});
```

The second case is the one that makes this non-trivial: normalise the mark only when it follows `o`, `O`, `g` or `G`. Ask Doston before widening that rule.

- [ ] **Step 4: The lint rule**

A custom ESLint rule that fails on U+2018, U+2019 or a bare `'` between two letters inside any string literal or JSX text in `src/lib/i18n/` and `src/components/`. This is the rule that stops the wrong codepoint creeping back in six months from now.

- [ ] **Step 5: Prove it**

```bash
pnpm lint && pnpm typecheck && pnpm vitest run src/lib/uzbek.spec.ts
```

Then **look at it**: run `pnpm dev`, open the hero headline, and confirm `gʻoyasi` renders in one face with no weight change at the mark. Screenshot it into `docs/PROGRESS.md` (web repo).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(design): locked palette as Tailwind v4 tokens, Inter, U+02BB enforced by lint (W-001)"
```

---

## Task 3: The generated API client, pinned to `main`

**Files:**
- Create: `scripts/generate-api-client.mjs`
- Create: `src/lib/api/generated/schema.ts` *(generated, committed)*

- [ ] **Step 1: The script**

`scripts/generate-api-client.mjs`:

- Default: `git -C ../jas-ad-studio-api show main:openapi.json` piped to `openapi-typescript`, output `src/lib/api/generated/schema.ts`.
- `--from-worktree`: read `../jas-ad-studio-api/openapi.json` instead, and print a loud banner saying the output must not be committed.
- `--check`: regenerate to a temp file and `diff` against the committed one; exit non-zero on drift, printing the command to fix it.
- Write a header comment into the generated file recording the api commit SHA it came from, so a future reader can tell which contract this is.

- [ ] **Step 2: Generate and read what came out**

```bash
pnpm api:generate
grep -c '"/api/' src/lib/api/generated/schema.ts
```

Expected: the four schemas and the 15 operations from [The contract boundary](#the-contract-boundary--read-this-before-task-1). **If `/api/packs`, `/api/orders` or `/api/owner/` appear, the script read the working tree instead of `main` — fix the script, do not proceed.**

- [ ] **Step 3: Prove the drift check works**

Edit one character in the generated file, run `pnpm api:check`, confirm it fails and names the fix. Restore it, run again, confirm it passes. Paste both outputs.

- [ ] **Step 4: Commit**

```bash
git add scripts/ src/lib/api/generated/ package.json
git commit -m "feat(api): typed client generated from main's openapi.json, with a drift check (D-031, W-002)"
```

---

## Task 4: The one fetch wrapper

Nothing else in the app calls `fetch`. This is where same-origin, CSRF and the error envelope live.

**Files:**
- Create: `src/lib/api/client.ts`, `src/lib/api/errors.ts`, `src/lib/api/client.spec.ts`

**Interfaces:**
- Produces: `api.get/post/patch/delete(path, init?)`, typed against `generated/schema.ts`
- Produces: `class ApiError extends Error { code: string; messageKey: string; status: number; requestId?: string }`
- Produces: `isApiError(e): e is ApiError`

- [ ] **Step 1: Write the failing tests**

Against a mocked `fetch`:

| Case | Expected |
|---|---|
| `POST` | sends `X-Requested-With: XMLHttpRequest` and `credentials: 'same-origin'` |
| `GET` | sends no `X-Requested-With` (safe method, the API does not require it) |
| 401 `{ code: 'SESSION_EXPIRED', messageKey: 'errors.session_expired', requestId }` | throws `ApiError` carrying all three |
| 404 `{ code: 'PROJECT_NOT_FOUND' }` | throws `ApiError`, `status` 404 |
| 413 with an empty body | throws `ApiError` with `code: 'UPLOAD_TOO_LARGE'` derived from the status, never "Something went wrong" |
| a network failure | throws `ApiError` with `code: 'NETWORK_OFFLINE'` |
| a 500 with an HTML body | throws `ApiError` with `code: 'INTERNAL_ERROR'`, and **never** puts the HTML in the message |
| `204` | resolves to `undefined`, does not try to parse JSON |

The last two matter: the seller must never see a raw provider or framework error (spec §9).

- [ ] **Step 2: Implement, run, paste the output**

```bash
pnpm vitest run src/lib/api/client.spec.ts
```

- [ ] **Step 3: Commit**

---

## Task 5: The Uzbek catalogue and the error map

Every visible string lives here (spec §8, D-014). Only `uz-Latn`.

**Files:**
- Create: `src/lib/i18n/uz-Latn.ts`, `src/lib/i18n/index.ts`, `src/lib/i18n/errors.spec.ts`

- [ ] **Step 1: The error map, driven by the codes the API actually emits**

The API's convention is `messageKey = 'errors.' + code.toLowerCase()`, so the keys are mechanical. Every entry is a message **plus a recovery action** — source 01 §47 forbids a bare "Something went wrong".

The codes `main` emits today, all of which need an entry:

| Code | Uzbek message | Recovery |
|---|---|---|
| `SESSION_EXPIRED` | Kirish muddati tugadi. | "Qaytadan kirish" — restarts Google sign-in, keeps the draft |
| `CROSS_ORIGIN_REFUSED` | Soʻrov qabul qilinmadi. | "Sahifani yangilash" |
| `VALIDATION_FAILED` | Maʼlumotlarda xatolik bor. | focus the first bad field, message inline |
| `PROJECT_NOT_FOUND` | Loyiha topilmadi. | "Loyihalarim"ni ochish |
| `ASSET_NOT_FOUND` | Rasm topilmadi. | "Qaytadan yuklash" |
| `PROJECT_OWNERSHIP` | Loyiha topilmadi. | same as `PROJECT_NOT_FOUND`; never reveal that it exists |
| `TOO_MANY_PHOTOS` | 4 tadan ortiq rasm yuklab boʻlmaydi. | "Bittasini olib tashlang" |
| `UPLOAD_TYPE` | Bu rasm emas. | "JPG, PNG yoki WebP yuboring" |
| `UPLOAD_TOO_LARGE` | Rasm juda katta. | "10 MB gacha rasm yuboring" |
| `UPLOAD_DAMAGED` | Rasm ochilmadi. | "Boshqa rasm tanlang" |
| `OAUTH_STATE_INVALID` | Kirish sahifasi eskirgan. | "Qaytadan kirish" |
| `AUTH_PROVIDER_FAILED` | Google javob bermadi. | "Bir ozdan soʻng urinib koʻring" |
| `GOOGLE_CONFIG` / `CONFIG_MISSING` | Xizmat hozircha sozlanmagan. | support contact, once P3 exposes one |
| `NOT_FOUND`, `HTTP_ERROR`, `INTERNAL_ERROR` | Kutilmagan xatolik. | "Qaytadan urinish", plus the `requestId` in small type so Doston can find it in the logs |
| `NETWORK_OFFLINE` *(client-side)* | Internet aloqasi uzildi. | "Qaytadan urinish"; the draft is kept |

**Also in the catalogue but unreachable today** — add them so the map is complete and the components are already wired, but do not build screens for them: `NO_CREDITS`, `ORDER_PENDING`, `AI_TIMEOUT`, `AI_REFUSED`, `AI_MALFORMED`, `AI_TRUNCATED`, `REFERENCE_CONFLICT`, `RATE_LIMITED`, `SPEND_CAP_REACHED`.

- [ ] **Step 2: Write the failing test**

A test that imports the union of error codes from the generated client plus the client-side additions, and asserts every one has a catalogue entry with a non-empty message **and** a non-empty action. This is what stops a future contract change shipping an untranslated code.

- [ ] **Step 3: `t()` throws on a missing key in development**, returns the key in production. Run, paste output, commit.

---

## Task 6: The app shell

**Files:**
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`
- Create: `src/components/site-header.tsx`, `src/components/site-footer.tsx`

- [ ] **Step 1:** Header per the artboard: wordmark, `Studiya · Misollar · Qanday ishlaydi · Savollar`, and `Kirish` on the right. **One line at desktop, 72 px tall.** Below `lg`, the section links collapse; the wordmark and the account control stay.
- [ ] **Step 2:** A skip link as the first focusable element. A visible focus ring, evergreen, 2 px, offset 2 px, on every interactive element — `:focus-visible`, never `outline: none`.
- [ ] **Step 3:** The page is server-rendered; only the wizard is a client island (spec §8). Keep `'use client'` at the leaves.
- [ ] **Step 4:** Prove no horizontal overflow at 360 px:

```bash
pnpm dev
# then, in the browser console at 360px width:
document.documentElement.scrollWidth <= document.documentElement.clientWidth
```

Expected: `true`. Paste it.

- [ ] **Step 5:** Commit.

---

## Task 7: The hero and its tray

This is the direction's first structural idea. Build it from `docs/design/direction-a.html`.

**Files:**
- Create: `src/components/hero-tray.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Copy, exactly**

- Headline: `Mahsulot rasmi bor.` / `Reklama gʻoyasi-chi?` (source 01 §4, owner's own words)
- Sub: `Rasmni yuklang. Mahsulotingizga mos ssenariy va tayyor prompt oling. Videoni Google Flowʼda tayyorlaysiz.`
- Primary: **`Reklama promptini tayyorlash`**. Not the source's free-prompt CTA (D-007).
- Secondary: `Misollarni koʻrish` — **anchors to the gallery section, which does not exist until P6.** Until then it scrolls to "Qanday ishlaydi". Do not build a stub gallery.

- [ ] **Step 2: The tray**

A horizontal row of rounded plates (radius 18 px) bleeding off both edges, at mixed sizes with rotations under 2.5°, with **one dashed evergreen slot cut into the middle of the run**. The slot is a real `<label>` wrapping a visually-hidden `<input type="file" multiple accept="image/jpeg,image/png,image/webp">`, so it is keyboard reachable and announced as a file input, not a decorative div.

At 390 px the tray shows two plates and the slot and scrolls horizontally **inside its own container** — `overflow-x: auto`, never the page.

- [ ] **Step 3: The photos**

`docs/design/img/` holds the prepared plates. **Two constraints, both real:**
- These are the owner's sample photos, not customer work. The tray needs no caption in direction A, but they must never be presented as generated video stills (source 01 §4).
- **`phones.jpg` is a Google Pixel press photo with visible G logos. Keep it out of the hero.** It is fine inside the studio where it reads as a seller's own upload. Ask Doston before putting any branded third-party product in JAS's own marketing surface.

- [ ] **Step 4: The annotation**

One hand-drawn mark, inline SVG, circling `Google Flow` in the sub with the note `videoni Google Flow tayyorlaydi, biz emas`. This is the never-imply-video rule drawn rather than stated. `aria-hidden` on the SVG; the note is real text.

- [ ] **Step 5:** Check at 1440, 390 and 360. Paste the overflow assertion at each. Commit.

---

## Task 8: Sign-in, session, and sign-out

**Files:**
- Create: `src/hooks/use-session.ts`, `src/components/account-menu.tsx`
- Modify: `src/components/site-header.tsx`

- [ ] **Step 1:** `GET /api/auth/google` is a **full-page navigation** (`window.location.assign`), never `fetch` — it 302s to Google and a fetch would follow it into an opaque cross-origin response.
- [ ] **Step 2:** `useSession` calls `GET /api/me`. Three states, all rendered: loading (skeleton in the header, not a spinner), signed out, signed in. A 401 is **not** an error here — it is the signed-out state, and must not surface an error notice.
- [ ] **Step 3:** `POST /api/auth/logout` → 204 → clear local state → reload. Sends `X-Requested-With` via the wrapper.
- [ ] **Step 4:** `role === 'owner'` from `CurrentUserDto` is read and stored but **renders nothing yet** — the `/admin` panel is blocked on P3. Do not add an admin link.
- [ ] **Step 5:** Verify by hand against the running api (`pnpm dev` in both repos, api on 3040). Paste the `GET /api/me` response body for a signed-in session. Commit.

---

## Task 9: The workbench shell and draft state

The direction's second structural idea: the product never leaves the screen.

**Files:**
- Create: `src/components/studio/workbench.tsx`, `src/components/studio/step-rail.tsx`, `src/hooks/use-draft.ts`, `src/lib/brief.ts`

- [ ] **Step 1:** Two-pane grid, `1fr 470px`, hairline between. Below `lg` it collapses to one column and the right pane becomes a **sticky 74 px strip under the step rail** carrying the primary photo, the product name and a "Koʻrish" control — per the mobile artboard. Never a hidden pane.
- [ ] **Step 2:** `src/lib/brief.ts` holds the draft shape and `toBriefDto(draft): BriefDto`, which fills `audience: null`, `offer: null`, `confirmedClaims: []`, `galleryInspirationId: null` and `durationSeconds: 10`. Test it: a draft with only step 1 filled must still produce a body that satisfies every required key.
- [ ] **Step 3:** Draft state in `sessionStorage`, restored on load, cleared on successful save. It survives a sign-in round trip through Google — that is the point, and it is the reason `SESSION_EXPIRED` keeps the draft.
- [ ] **Step 4:** The step rail is three real `<button>`s with `aria-current`. Steps ahead of the furthest-reached one are `disabled`, not merely styled grey. Step changes announce through `aria-live="polite"`.
- [ ] **Step 5:** Commit.

---

## Task 10: Step 1 — Mahsulot

**Files:**
- Create: `src/components/studio/step-product.tsx`

- [ ] **Step 1:** Heading `Mahsulotingizni tanishtiring`, sub `Rasm va ikki qator matn yetarli. Qolganini biz soʻraymiz.`
- [ ] **Step 2:** `Mahsulot nomi` → `productName`, maxLength 200. `Qisqa tavsif` → `description`, textarea, maxLength 2000, with a live counter. Both **label above the input**, helper text below, error text below that. Never placeholder-as-label. Font size ≥ 16 px.
- [ ] **Step 3:** Helper on the description: `Faqat aniq narsani yozing. Oʻylab topilgan daʼvo promptga tushmaydi.` This is the product-lock rule stated to the seller, and it is the cheapest place to prevent invented claims.
- [ ] **Step 4:** The image guide, verbatim from source 01 §8:

> **Yaxshi natija uchun:** mahsulot aniq koʻrinsin · rasm juda xira boʻlmasin · bir xil model va variant yuborilsin · yorliq muhim boʻlsa, oʻqiladigan rasm qoʻshilsin

- [ ] **Step 5:** Both fields run through `normalizeUzbek` on blur. Client-side length validation mirrors the contract's bounds so the seller is not round-tripped for a 201-character name, but the server is still the authority — a `VALIDATION_FAILED` must render inline on the right field.
- [ ] **Step 6:** Commit.

---

## Task 11: Photo upload, and its four states

The neglected state in the artboard, and the one the exit check should exercise hardest.

**Files:**
- Create: `src/components/studio/photo-rail.tsx`, `src/components/studio/upload-list.tsx`

**Ordering problem, solve it here:** `POST /api/projects/{projectId}/assets` needs a project id, but the seller uploads a photo on step 1 before the brief exists. The contract offers no draft-project route. **Create the project on the first upload** with whatever the seller has typed, using the contract's own defaults for the rest, then `PATCH` it at step 3. `productName` and `description` are `minLength: 1`, so if both are empty at first upload, hold the file in memory and prompt for the name first. Do not invent placeholder text to satisfy the schema — that is a fabricated claim in the seller's own project.

- [ ] **Step 1:** Rail of up to four thumbnails plus dashed add-slots. First photo is primary, marked with the citron `Asosiy` badge; clicking another makes it primary. `object-fit: contain` so the seller's original framing is never cropped (source 01 §8). Photos render from `GET /api/assets/{id}/reference` in a plain `<img>` — **not** `next/image`, which cannot carry the cookie or respect `no-store`.
- [ ] **Step 2: All four states at once, as drawn.** One file done, one at 68 %, one queued, one refused, each readable simultaneously:

| State | Shown |
|---|---|
| queued | shimmering placeholder plate, filename, size, `navbatda` |
| uploading | real progress from an `XMLHttpRequest` `upload.onprogress`, percentage as text as well as bar width |
| done | the actual thumbnail, a check, `tayyor` |
| refused | no thumbnail, the reason, and a `Olib tashlash` button; the specific `UPLOAD_TYPE` / `UPLOAD_TOO_LARGE` / `UPLOAD_DAMAGED` message with its recovery action below the list |

`fetch` cannot report upload progress; use `XMLHttpRequest` for this one call and keep it behind the same wrapper's header and error conventions.

- [ ] **Step 3:** `Davom etish` is disabled while any upload is in flight, with the reason in text beside it (`1 ta rasm tayyor, 2 tasi yuklanmoqda`) — never state by colour alone.
- [ ] **Step 4:** Progress and completion announce through `aria-live="polite"`; refusals through `role="alert"`.
- [ ] **Step 5: Verify against the real API, with real files.** Upload a real JPG, a 12 MB file, a PDF renamed `.jpg`, and a fifth photo. Expected, from P2's measured behaviour: 201, 413 `UPLOAD_TOO_LARGE`, 400 `UPLOAD_DAMAGED`, and `TOO_MANY_PHOTOS`. Paste all four.
- [ ] **Step 6:** Commit.

---

## Task 12: Step 2 — Reklama yoʻnalishi

**Blocked on:** Doston approving the Uzbek enum labels (**W-003**). Present the table below and get his wording before building the component.

**Files:**
- Create: `src/components/studio/step-direction.tsx`
- Modify: `src/lib/i18n/uz-Latn.ts`

- [ ] **Step 1: Propose the labels, then wait**

These are **proposals, not decisions.** Source 01 §9's four Uzbek goal options do not map one-to-one onto the contract's four `goal` values, and D-065 says the format descriptions are still English and written for the model, not the seller.

`goal`:

| Contract value | Proposed label | Proposed line |
|---|---|---|
| `awareness` | Tanishtirish | Mahsulotni birinchi marta koʻrsatish |
| `sales` | Sotuvni oshirish | Xaridorni harakatga undash |
| `launch` | Yangi mahsulot eʼloni | Yangi kelgan mahsulotni eʼlon qilish |
| `trust` | Ishonch uygʻotish | Sifat va kafolatni koʻrsatish |

`formatId`:

| Contract value | Proposed label | Proposed line |
|---|---|---|
| `product-film` | Studiya filmi | Toza fon, sekin kamera, mahsulot markazda |
| `high-energy` | Tezkor va energiyali | Qisqa kadrlar, tez ritm, ijtimoiy tarmoq uchun |
| `lifestyle-story` | Hayotiy hikoya | Mahsulot kundalik vaziyatda koʻrsatiladi |
| `ugc-authentic` | Tabiiy UGC | Telefonda olingandek, sodda va ishonarli |

`platform`: Instagram / Reels · Telegram · TikTok · YouTube Shorts. `aspectRatio`: `9:16` (default) · `16:9` · `1:1`.

**There is no style picker.** D-065 removed it; format carries the look. Source 01 §9's "Style" section is dead.

- [ ] **Step 2:** Radio groups as real `<fieldset>`/`<legend>` with `<input type="radio">`, not divs with click handlers. Each option shows its label and its one line.
- [ ] **Step 3:** `audience` optional text, `durationSeconds` with default 10, `confirmedClaims` as up to 10 rows each with a `verified` checkbox, and `offer` behind a `Qoʻshimcha sozlamalar` disclosure (source 01 §9). **Never invent a discount, a delivery promise, a price or a stock claim** — every one of these comes from the seller or is absent.
- [ ] **Step 4:** `aspectRatio` is **never inferred from the uploaded photo's orientation** (source 01 §9). Default `9:16` regardless.
- [ ] **Step 5:** Commit.

---

## Task 13: Step 3 — Tekshirish, and saving the brief

- [ ] **Step 1:** A read-only summary of every field with an `Oʻzgartirish` link that returns to the owning step with focus on that field.
- [ ] **Step 2:** `POST /api/projects` for a new project, `PATCH /api/projects/{id}` when one already exists from the first upload. Render `VALIDATION_FAILED` inline against the named field.
- [ ] **Step 3: The generate action is blocked and the screen must say so honestly.**

The step is called `Tekshirish va tayyorlash`, but "tayyorlash" calls a generation endpoint that does not exist until P4. Ship step 3 as **`Tekshirish va saqlash`** with a `Saqlash` action, and no disabled `Tayyorlash` button — a permanently greyed primary action that never becomes available is worse than an honest one. **Do not build:** the result panel, the copy-with-fallback, TXT export, or the Flow handoff. They are P4's screens and are listed in [Blocked work](#blocked-work-and-what-unblocks-it).

Confirm this wording with Doston; it is the one place where the plan's scope is visible to the seller.

- [ ] **Step 4:** On success, clear the draft and open the project in the history drawer. Commit.

---

## Task 14: The history drawer and its empty state

**Files:**
- Create: `src/components/projects-drawer.tsx`

- [ ] **Step 1:** A drawer, not a page (W-004, spec §8, source 01 §20). `GET /api/projects` returns `ProjectSummaryDto[]`, newest first, deleted ones already omitted. Each row shows the primary photo, `name`, `formatId` as its Uzbek label, `aspectRatio` and `createdAt` formatted for uz-Latn.

  **Note the shape:** `ProjectSummaryDto` carries no photo, so each row's thumbnail needs `GET /api/projects/{id}/assets`. Fetch them for the visible rows only; do not fan out over the whole list.

- [ ] **Step 2:** Focus management, properly: `role="dialog"`, `aria-modal`, focus moves to the drawer heading on open, is trapped inside, returns to the trigger on close, and Escape closes.
- [ ] **Step 3: The empty state, which is a designed screen, not a shrug.** A ghost row, one sentence saying what will appear there, the single action `Birinchi loyihani boshlash`, and a line noting the example gallery is free and needs no sign-in (D-007) — with the gallery link inert until P6.
- [ ] **Step 4:** Delete calls `DELETE /api/projects/{id}` behind a confirmation that names the project. Soft-delete on the server also stops its photos serving (D-068), so remove the row and any cached thumbnail.
- [ ] **Step 5:** Reopening loads the project back into the studio (source 01 §20). Commit.

---

## Task 15: Every reachable error state, seen

Not a code task — a walk. Source 01 §47 requires a useful recovery for each, and the only way to know is to cause them.

- [ ] **Step 1:** With the api running, cause each of these for real and screenshot the result:

| How | Expected |
|---|---|
| delete the session row in Postgres mid-session, then save | `SESSION_EXPIRED`, "Qaytadan kirish", **draft survives** |
| stop the api, then save | `NETWORK_OFFLINE`, "Qaytadan urinish", draft survives |
| upload a PDF renamed `.jpg` | `UPLOAD_DAMAGED` with its recovery |
| upload a 12 MB photo | `UPLOAD_TOO_LARGE` |
| upload a fifth photo | `TOO_MANY_PHOTOS` |
| open another user's project id | `PROJECT_NOT_FOUND` — and confirm the UI never suggests it exists |
| send a 201-character `productName` past the client check | `VALIDATION_FAILED` inline on that field |

- [ ] **Step 2:** Confirm no screen anywhere shows a bare "Something went wrong", and no raw provider or framework text reaches the seller.
- [ ] **Step 3:** Paste the list with a pass mark against each into the web repo's `docs/PROGRESS.md`. Commit.

---

## Task 16: The exit gate

`docs/PLAN.md`'s P5 exit check: *"Full flow at 390 px and desktop checked in Playwright; keyboard and focus OK; no horizontal overflow."* Scoped to what this plan built.

**Files:**
- Create: `playwright.config.ts`, `tests/studio.spec.ts`, `tests/a11y.spec.ts`

- [ ] **Step 1:** Two projects: desktop 1440×900 and mobile 390×844. Add a third at **360×740** — `CLAUDE.md` sets 360 as the usability floor and only 390 as comfortable, so 360 is the one that must not break.
- [ ] **Step 2:** The flow test: land → sign in (stub `/api/me` and the session cookie; do not drive real Google in CI) → upload a real fixture photo → fill step 1 → step 2 → step 3 → save → open the drawer → see the project → delete it.
- [ ] **Step 3:** The keyboard test: Tab from the top of the page through the whole wizard without a mouse. Every stop has a visible focus ring; the drawer traps and restores focus; Escape closes it.
- [ ] **Step 4:** The overflow test, at all three widths, on every screen state including the drawer open and the upload list mid-flight:

```ts
expect(await page.evaluate(() =>
  document.documentElement.scrollWidth <= document.documentElement.clientWidth
)).toBe(true);
```

- [ ] **Step 5:** A tap-target test asserting every interactive element's bounding box is ≥ 44 px on its short side at 390 px.
- [ ] **Step 6: Run the full gate and record it**

```bash
pnpm lint && pnpm typecheck && pnpm api:check && pnpm build && pnpm test:e2e
```

Paste the real counts into the web repo's `docs/PROGRESS.md`. **Do not mark P5 complete in `docs/PLAN.md`** — this plan covers a slice of that row, and the row also names credits, orders, the result, the Flow handoff and `/admin`. Ask Doston how he wants the row split before touching it.

- [ ] **Step 7:** Commit, then stop for Doston's review before merging `p5-studio-ui` to `main` (D-070).

---

## Blocked work, and what unblocks it

Everything in the PLAN.md P5 row that this plan does **not** build, and why. None of it can be started by guessing an endpoint.

| Blocked | Needs | Unblocked by |
|---|---|---|
| Credit balance in the header | `GET /api/credits/balance` | **P3** |
| Pack list and prices | `GET /api/packs`; and prices stay hidden until the owner configures real ones | **P3** |
| Order screens: create, cancel, pending state | `POST /api/orders`, `GET /api/orders`, `POST /api/orders/{id}/cancel` | **P3** |
| Payment instructions and support contacts | `GET /api/settings/public` | **P3** |
| `NO_CREDITS` and `ORDER_PENDING` screens | the credit flow they belong to | **P3** |
| The owner `/admin` panel (D-037) | all of `/api/owner/*` | **P3** for the endpoints, then a follow-up plan for the screens |
| The generate action on step 3 | a generation endpoint; none exists | **P4** |
| Job polling, `queued/running/ready/needs_input/refused/failed` | the job state machine and its polling route | **P4** |
| The inline result: concept, Uzbek shot plan, prompt | the result shape | **P4** |
| Copy-with-fallback and TXT export (source 01 §48) | a prompt to copy | **P4** |
| The Google Flow handoff (source 01 §18) | a prompt to hand off | **P4** |
| `AI_*`, `RATE_LIMITED`, `SPEND_CAP_REACHED` screens | the pipeline that raises them | **P4** |
| The example gallery, and `galleryInspirationId` | gallery content and hosting | **P6** |
| "Misollarni koʻrish" as a real destination | the gallery | **P6** |

**Two P3 shapes already exist in the api working tree and must not be used yet.** On 2026-09-12 `p3-credits-orders` carried `/api/packs`, `/api/credits/balance`, `/api/orders`, `/api/orders/{id}/cancel` and seven `/api/owner/*` routes, uncommitted. They may change before they merge. W-002's pinning is what keeps this plan honest about that.

---

## Self-review against the spec

| Requirement | Source | Task |
|---|---|---|
| Next.js 16 App Router, React 19, TypeScript | spec §8, D-035 | 1 |
| Tailwind v4 via `@tailwindcss/postcss`, mirroring kitobnarx-web | D-035 | 1 |
| One page `/`, server-rendered, wizard client-side | spec §8 | 1, 6, 9 |
| Same-origin `/api`, dev rewrite to the NestJS port | spec §8, D-032 | 1, 4 |
| Typed client generated, never hand-written | spec §8, D-031 | 3 |
| Generated from a merged contract only | new, **W-002** | 3 |
| Design tokens in one file, from source 01 §5 | spec §8, D-016, D-035 | 2 |
| Uzbek renders correctly at hero size | source 01 §5, **W-001** | 2 |
| Every string in a translation file, `uz-Latn` only | spec §8, D-014 | 5 |
| `messageKey` → Uzbek message **plus a recovery action** | spec §9, source 01 §47 | 5, 15 |
| No raw provider errors reach sellers | spec §9 | 4, 5 |
| `HttpOnly` cookie session; `X-Requested-With` on writes | spec §10 | 4, 8 |
| Google sign-in as a full-page navigation | spec §3 | 8 |
| Hero per source 01 §4, minus the free-prompt CTA | source 01 §4, D-007 | 7 |
| Never imply the app makes videos | `CLAUDE.md`, api `CLAUDE.md` | 7, 13 |
| Three compact steps, product never out of sight | source 01 §6 | 9, 10, 11 |
| Step 1: photos, name, description, image guide | source 01 §8 | 10, 11 |
| One primary plus three optional photos, `object-fit: contain` | source 01 §8 | 11 |
| Step 2 fields, no style picker | source 01 §9, D-065 | 12 |
| Format carries the look; seller answers one question | D-065 | 12 |
| Never invent prices, discounts, delivery or stock | source 01 §9, §25 | 10, 12 |
| History as a drawer, reopen and delete | source 01 §20, **W-004** | 14 |
| The empty project list is a designed screen | brief | 14 |
| The upload-in-progress state shows all four fates | brief | 11 |
| Motion 160–280 ms, `prefers-reduced-motion` | source 01 §38 | 2 |
| 360 px usable, 390 px comfortable, ≥ 44 px targets, ≥ 16 px controls, no overflow | source 01 §39 | 6, 16 |
| Semantic HTML, real buttons, labels, visible focus, live regions, dialog focus | source 01 §40 | 6, 9, 11, 14, 16 |
| No state communicated by colour alone | source 01 §40 | 11 |
| Playwright at 390 px and desktop | spec §11, PLAN.md P5 | 16 |
| Gallery free and signed out | D-007 | 14 (the note), **P6** (the gallery) |
| One branch per phase | D-070 | 1, 16 |
| Session B never edits the api repo | spec §13, D-025 | throughout |

**Not in this plan, on purpose:** everything in [Blocked work](#blocked-work-and-what-unblocks-it). The `/admin` panel, the credit and order screens, the generation result, the copy and export behaviour, the Flow handoff and the gallery are named in the PLAN.md P5 row but cannot be built against the contract that exists. They need P3 and P4 merged, and then their own plan.
