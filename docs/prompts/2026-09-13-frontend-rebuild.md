# Prompt: rebuild the JAS Ad Studio frontend from scratch

> Paste everything below the line into a fresh Claude Code session started in `/home/doston-sulaymon/projects`. It is self-contained. Written 2026-09-13 from the verified state of both repos.

---

## Who you are working for, and how

You are building a **new frontend from scratch** for **JAS Ad Studio** for Doston (owner) and Jakhongir (co-owner). Doston is not a designer and does not read frontend code: **he reviews the rendered site**. Every time you stop for review, show screenshots at 1440, 390 and 360 px, never a diff.

Work in this order and do not skip ahead: **study the references → write a short design spec → get Doston's yes → write a plan → build one part at a time → stop with screenshots after each part.** One question at a time when you genuinely need a decision; otherwise decide and say what you decided.

## The one hard boundary

- **Build in a brand-new directory: `/home/doston-sulaymon/projects/jas-ad-studio-web-v2`**, its own git repo (`git init`), its own `node_modules`, dev server on **port 3046**.
- **Do not modify anything in `jas-ad-studio-web`** (the current frontend, v1). It is served live at https://jas.kitobnarxi.uz by pm2 process `jas-web`. You may **read** it for copy, API usage and lessons — never edit, build, restart or run `next build` in it.
- **Do not modify `jas-ad-studio-api`** (the NestJS backend). It stays exactly as it is; the new frontend is a client of the existing API. The one exception is in "Local sign-in and origins" below, and it needs Doston's yes first.
- Do not touch Cloudflare, the tunnels (`jas-tunnel`, and **never** `kitobnarx`, which serves a different live site), pm2 processes, Google OAuth, or the api `.env`, unless Doston explicitly asks.
- Nothing becomes public until Doston approves the finished v2. Replacing v1 is a separate, later decision.

## Why v1 is being replaced (so you do not repeat it)

v1 was restyled from a light design into a dark one by recolouring existing components. Doston's verdict: *the colours mismatch and the design is old*. Concretely:
- It kept the old layout skeleton (form-first studio patterns, old spacing and hierarchy) under new colours.
- It added a **peach→orange accent** that exists in neither reference. Both references are **monochrome**: near-black, white, greys. Do not reintroduce a warm accent.
- It looked "reskinned", not designed. v2 must be designed from the references outward, not ported from v1's components.

## The references — study them live before writing any code

1. **https://motionsites.ai/** — the target look.
2. **https://bold-prompt-vibe-studio.base44.app/** — Jakhongir's own build of this very product. It is the **pattern**: same audience, Uzbek copy, same flow. Treat its structure as the default answer to "what goes where".

Open both in a real browser (Playwright is installed in v1; use `createRequire` against v1's `package.json` or install your own). Capture full-page screenshots at 1440, 390, 360, and **measure computed styles** (font family/size/weight/letter-spacing, colours, radii, borders, paddings, heights of buttons/chips/cards, grid gaps). Then write a one-page style board in your spec. Measurements taken on 2026-09-13, to check against:

| | motionsites.ai | Jakhongir's build |
|---|---|---|
| Page background | `#121212` | `#0F0F0F` |
| Text | `#F5F5F5`; secondary white at 60–72% | `#FAFAFA`; muted `#A1A1A1` |
| Borders | `#303030` | `#292929`; raised surface `#171717` |
| Headline | system sans, **900**, uppercase, 56px, tracking −1.68px | **Sora 600**, 60px, tracking −1.5px; body Inter |
| Badge above headline | small plain text | pill, 11px uppercase, tracking 1.76px, muted text on `#171717`, 1px border |
| Primary CTA | pill (full radius), 56px, dark text on a **white→pale-blue vertical gradient** (`#FAFAFA`→`#CFDEF6`) | 8px radius, 40px, `#FAFAFA` bg, dark text |
| Secondary CTA | white pill, 36px | 8px radius, transparent, 1px border |
| Category chips | pill; active `#202020` bg + white; inactive transparent + white 72% | pill; **active white bg + dark text**; inactive bordered |
| Cards | 20px radius, no border, image-led, dense grid | rounded, image top, uppercase meta line (`KATEGORIYA · USLUB`), title, small tag pills, `Prompt →` link |
| Nav | 14px/500, white 60%, pill hover | logo left, links centre, sign-in + white CTA right |

**What to take from each:** motionsites for the *feel* — confident heavy typography, big visual grid that makes the product look premium, pill controls, almost no chrome. Jakhongir's build for the *structure and copy tone* — hero with badge / headline / subline / two CTAs / search, gallery with category and style chips directly under the hero, 3 step cards, a "Moslashtirish" section with an upload box, a final CTA band, a quiet footer.

**Explicitly not adopted from Jakhongir's build:** PRO/BEPUL badges, the "PRO tarif 99 000 soʻm / oy" section, subscription copy. Pricing is an open business decision (D-082 / Q-17). No prices anywhere until the owner configures packs through the API.

## Design system — decide it in the spec, inside these rails

- **Palette: monochrome dark, single theme, no toggle.** Background in the `#0F0F0F`–`#121212` range, one raised surface, one border grey, white text, one muted grey (≥ 4.5:1 on the background). **No hue accent.** Emphasis comes from white vs grey, weight, size and the photography. If you want one special moment, borrow motionsites' **white→pale-blue gradient on the primary CTA only** — and nothing else gets colour.
- **Status colours are the only exception:** a restrained red for errors/destructive, a restrained green for success/confirmed, used only in those states (forms, order status, toasts).
- **Typography:** Uzbek Latin uses **U+02BB** for `oʻ`/`gʻ` and **U+02BC** for `ʼ`. **Any font you choose must render both glyphs** — Manrope does not, which is why v1 used Inter (decision W-001). Before choosing a display face (Sora, Geist, Inter Tight, Satoshi…), render `Oʻzbekiston gʻoya eʼlon` in it and zoom the screenshot; if the glyph is missing or substituted, reject the font. Load fonts with `next/font`.
- **Shape:** pills for buttons and chips, ~20px for cards and panels, ~12px for inputs. One system, used everywhere including the admin panel.
- **Icons:** one library, one stroke weight, used throughout (`@phosphor-icons/react` or `lucide-react`). Never hand-draw SVG icons. Icon-only buttons need an accessible label.
- **Density and rhythm:** image-led and airy on the landing; compact but calm in the studio and admin.
- **Motion:** 160–280 ms, purposeful (hover lift on cards, sheet/drawer slide, copy confirmation). Respect `prefers-reduced-motion`. No scroll hijacking, no custom cursor, no WebGL, no glow orbs.
- **Mobile is first-class:** fully usable at **360px**, comfortable at 390. Tap targets ≥ 44px, form controls ≥ 16px, **zero horizontal page overflow** — including when signed in.
- **Accessibility:** semantic HTML, visible focus on every control (a focus ring that is visible against white buttons), dialogs that trap and return focus, status messages announced.

## Product rules that must never be broken

- **The app writes prompts; Google Flow makes the video.** Never imply the app makes videos. The main studio action is **"Reklama promptini tayyorlash"**, never "Video tayyorlash".
- **Copy puts only the clean English prompt on the clipboard** — no headings, JSON, credit counts or notes. If the Clipboard API fails (common in in-app browsers), show a selectable text block.
- **The gallery and copying its prompts work signed out and never cost credits** (D-007).
- **No fake content:** no invented examples, testimonials, user counts, ratings or prices. An empty gallery says it is empty. Category chips list only categories that have a published example.
- **"Shu uslubdan foydalanish" (use this style) carries only the example's id** into the brief (`galleryInspirationId`). It never pastes the example's prompt into the seller's brief.
- **Render all text from the API as plain text**, never as HTML.
- **Uzbek Latin everywhere**, with correct U+02BB/U+02BC. Prefer "tayyorlash" over "yaratish".

## Copy

- **Hero (from Jakhongir, 2026-09-13).** Note it arrived with `‘` (U+2018); store it with `ʻ` (U+02BB):
  - Badge: `Yangi promptlar doimiy qoʻshiladi` (displayed uppercase via CSS)
  - Headline: `Mahsulotingizni reklama darajasiga olib chiqing.`
  - Subline: `Professional AI reklama videolarini koʻring, promptini oling va oʻz mahsulotingiz uchun moslashtiring.`
  - Primary CTA: `Videolarni koʻrish →` (scrolls to the gallery)
  - Secondary CTA: `Mahsulotim uchun prompt olish` (goes to the studio)
- **Everything else:** v1's catalogue `jas-ad-studio-web/src/lib/i18n/uz-Latn.ts` (942 lines) holds the reviewed Uzbek copy for the studio steps, goal/format/platform/aspect labels, review, generation states, result, projects, credits and orders, every API error message and its recovery action, and the admin panel. **Copy the strings you need into v2's own catalogue** (do not import across repos) and keep them in one file.
- **Add a guard test** that fails if `'`, `‘`, `’`, `´` or `` ` `` appears between `o`/`g` and a letter in the catalogue (v1's `src/lib/uzbek-source.test.ts` is the reference).

## Information architecture

| Route | Contents |
|---|---|
| `/` | Header · hero (badge, headline, subline, 2 CTAs, a **search box that filters the gallery client-side** by title/category — the API has no search) · **gallery** (category chips, style chips if useful, dense card grid, play on demand, `Prompt` opens a sheet) · 3 step cards (Rasm va qisqa tavsif → Reklama yoʻnalishi → Ssenariy va prompt) · "Moslashtirish" (short pitch, CTA to `/studiya`, a visual upload box or the owner's hero photos from `GET /api/settings/public` → `heroPhotos`) · FAQ (4 questions from v1's catalogue) · final CTA band · footer (support contacts from settings, privacy link) |
| `/studiya` | The 3-step studio: **1 Mahsulot** (up to 4 photos, name, short description) → **2 Reklama yoʻnalishi** (goal, format, platform, aspect ratio, optional audience/offer/claims, the chosen gallery style shown as a removable chip) → **3 Tekshirish** (summary + "Reklama promptini tayyorlash") → generation progress → **result** (concept, Uzbek shot plan, the English prompt with Copy, TXT download, "Open Google Flow" link-out) with **version switching** across the project's saved prompts. `?loyiha=<id>` opens a saved project |
| `/maxfiylik` | Privacy page. v1's `src/app/maxfiylik/page.tsx` and catalogue `privacy` block have the current interim text (Jakhongir's final text is pending) |
| `/admin` | Owner panel (role `owner` only; the API enforces it, the UI only hides it). Tabs: Buyurtmalar (order queue: confirm/reject), Limit berish (grant credits), Sozlamalar (payment instructions, support contacts, packs), Galereya (examples CRUD + clip/poster upload, publish toggle), Bosh sahifa rasmlari (7 hero photo slots, replace one), Foydalanuvchilar, Hisobot (generations and daily spend). **The open tab lives in the URL** so a refresh keeps it |
| Header, every page | Signed out: sign-in. Signed in: prompt balance (opens credits drawer), projects (opens projects drawer), sign out. Owner: link to `/admin`. **Must fit at 360px** — icon-only with labels for screen readers on small screens |
| Drawers | **Projects** (list, open, delete with in-row confirmation) · **Prompt limiti / credits** (balance, packs if any, order form with payment instructions, own orders with cancel) |

Open question to raise with Doston in the spec, not to decide alone: whether the project list stays a drawer or becomes a page (request **R-003** in `jas-ad-studio-api/docs/REQUESTS.md`).

## The API contract (unchanged; verified 2026-09-13)

**Source of truth:** `/home/doston-sulaymon/projects/jas-ad-studio-api/openapi.json` (35 paths). **Generate TypeScript types from it** (e.g. `openapi-typescript`) into v2 and never hand-write API shapes. Read the api repo's `CLAUDE.md` and `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` §3 and §9 for behaviour.

**Transport rules — every one is enforced server-side:**
- **Same origin.** In dev, Next rewrites `/api/:path*` → `http://127.0.0.1:3040/api/:path*` (see v1's `next.config.ts`). The browser never calls port 3040 directly.
- `credentials: 'include'`: the session is an httpOnly cookie (30 days).
- **Every write** (`POST`/`PATCH`/`DELETE`) sends `X-Requested-With: XMLHttpRequest` and must come from an allowed origin, or the CSRF guard answers `403 CROSS_ORIGIN_REFUSED`.
- **One fetch wrapper** does all of this; components never call `fetch` directly. v1's `src/lib/api/client.ts` is the reference.
- **Errors** are `{ code, messageKey, details?, requestId }`. Map `code` to Uzbek copy (message + what to do next) — v1's `src/lib/api/errors.ts` and the catalogue's `errors` block. `401 SESSION_EXPIRED` means signed out.
- **Sign-in is a full-page navigation** to `/api/auth/google` (never fetch it). Sign-out is `POST /api/auth/logout`.

**Routes by screen:**
- Session: `GET /api/me` → `{ id, email, role: 'seller'|'owner' }`
- Public settings (signed out): `GET /api/settings/public` → `paymentInstructions`, `supportContacts { telegramUser, telegramBot, email }` (any may be `null` — render only what is set), `heroPhotos`
- Gallery (signed out): `GET /api/gallery` (cards, no prompt) · `GET /api/gallery/{slug}` (one example **with** `promptEn`, fetch when the sheet opens) · `GET /api/gallery/media/{path}` (clips/posters, supports Range). Example fields: `id, slug, titleUz, category (kiyim|poyabzal|parfyum|kosmetika|uy-rozgor|elektronika|oziq-ovqat|aksessuar), style, videoUrl, posterUrl, aspectRatio, durationSeconds, conceptUz, sourceType, sourceNote`. **Always show `sourceNote`** (provenance, §42). Videos: `preload="none"` behind the poster, no autoplay, explicit play control.
- Projects: `POST /api/projects` (brief) · `GET /api/projects` · `GET /api/projects/{id}` (summary + full `brief`) · `PATCH /api/projects/{id}` (**full brief, every field required**) · `DELETE /api/projects/{id}`
- **Brief** (`BriefDto`, strict — no extra keys): `productName` (1–200) · `description` (1–2000) · `goal` `awareness|sales|launch|trust` · `formatId` `product-film|high-energy|lifestyle-story|ugc-authentic` · `platform` `instagram|telegram|tiktok|youtube-shorts` · `aspectRatio` `9:16|16:9|1:1` · `durationSeconds` (default 10) · `audience` (≤200 or null) · `confirmedClaims` `[{ claim ≤200, verified: boolean }]` max 10 · `offer` `{ description ≤200, priceUzs int|null, validUntil date|null }` or null · `galleryInspirationId` string or null (an unknown/unpublished id is refused with `GALLERY_EXAMPLE_NOT_FOUND`).
- Photos: `POST /api/projects/{projectId}/assets` multipart field **`photo`**, one file per request, **max 4 per project, 10 MB each**, JPEG/PNG/WebP · `GET /api/projects/{projectId}/assets` · `GET /api/assets/{id}/reference` (image) · `DELETE /api/assets/{id}`. The API needs a project to attach photos to, so create the project from step 1 before the first upload (v1's `src/components/studio/studio.tsx` shows the ordering). Use XHR for upload progress.
- Generation: `POST /api/projects/{id}/generations` with header **`Idempotency-Key`** — one key per attempt, **reused on retry**, replaced only when that attempt reaches a final state (a fresh key on retry can charge twice) → `202 { generationId, status, fromCache, questionsUz }`. `fromCache: true` is already final (needs_input, no credit spent, do not poll). Otherwise poll `GET /api/generations/{id}` with backoff until the job is `ready|needs_input|refused|failed` (it takes about a minute). **Save the brief (PATCH) before generating** — the worker reads the brief from the project. `GET /api/projects/{id}/generations` lists every generation newest first; show the `ready` ones as **Versiya 1, 2…** numbered oldest-first.
- Package on a ready generation: `{ generationId, promptEn, createdAt, result }` where `result` has `concept { titleUz, rationaleUz, formatId, hookUz, ctaUz } | null`, `shots [{ startSeconds, endSeconds, descriptionUz, cameraUz }]`, `product { category, observedDetails[], confirmedClaims[], unknownDetails[], referenceConflicts[], fidelityConstraints[] }`, `target`, `assumptionsUz[]`, `reviewNotesUz[]`. `needs_input` carries `questionsUz`; `refused` carries `messageUz`; `failed` carries `errorCode`.
- Credits and orders: `GET /api/credits/balance` → `{ available, reserved }` · `GET /api/packs` (**empty until the owner prices packs — show "Paketlar hali sozlanmagan", never a placeholder price**) · `POST /api/orders` `{ packId, paymentMethod: card_transfer|payme|click|other, payerReference? }` · `GET /api/orders` · `POST /api/orders/{id}/cancel`
- Owner (`/admin`): `GET /api/owner/orders?status=` · `POST /api/owner/orders/{id}/confirm` · `POST /api/owner/orders/{id}/reject` · `POST /api/owner/grants` (note required) · `PATCH /api/owner/packs/{id}` · `PATCH /api/owner/settings/payment-instructions` · `PATCH /api/owner/settings/support-contacts` · `GET|POST /api/owner/gallery` · `PATCH|DELETE /api/owner/gallery/{id}` · `POST /api/owner/gallery/media` (multipart) · `PATCH /api/owner/settings/hero-photos` (overrides keyed by `slot`) · `GET /api/owner/generations` · `GET /api/owner/spend` · `GET /api/owner/users`

**The api and its worker must be running** (`pm2` processes `jas-api`, `jas-worker`; already up). A generation with no worker stays queued forever and looks like a slow one.

## Local sign-in and origins

- The api's CSRF guard accepts `WEB_ORIGIN=https://jas.kitobnarxi.uz` plus `EXTRA_WEB_ORIGINS=http://localhost:3042,http://127.0.0.1:3042` (comma-separated, in `jas-ad-studio-api/.env`). **v2 on port 3046 is not allowed yet**, so every write from it will be refused. **Ask Doston before** appending `http://localhost:3046,http://127.0.0.1:3046` and restarting `jas-api`/`jas-worker` with pm2 (pm2 lives under Node 22: `~/.nvm/versions/node/v22.17.1/bin/pm2`).
- **Google sign-in always returns to the public host**, so a real signed-in session cannot be created on localhost:3046. Build and test signed-in screens against **stubbed API responses** in Playwright (v1's `tests/flow.spec.ts` shows the pattern, with shapes copied from the live API). A real end-to-end walk needs v2 on a public preview hostname — that involves Cloudflare, the tunnel and Google OAuth, so propose it to Doston; do not do it yourself.

## Lessons from v1 — each cost real time

- **Next.js 16 is not the Next you know.** Read `node_modules/next/dist/docs/` for anything version-sensitive (metadata, routing, config, `devIndicators`).
- **React StrictMode runs mount effects twice in dev.** A "restore draft from storage" effect paired with a "save draft" effect will overwrite the stored draft with the empty initial state unless the save waits until the restore has run. Test restore-on-mount explicitly.
- **Signed-in layouts overflow where signed-out ones do not.** v1's header pushed the page 139px sideways at 360 only when signed in, because every layout test ran signed out. Test overflow and 44px targets **signed in, at 360**.
- **A `fixed` mobile action bar covers everything below it** unless it is scoped to its own section.
- **The public site sits behind Cloudflare,** and dev chunk filenames do not change with content; a browser that cached assets can show stale JS/CSS. When something "looks broken" on a deployed page, compare the cached and fresh asset before debugging code.
- **Never run `next build` in a directory another dev server serves.** It rewrites `.next` underneath it.
- **Uzbek glyph bugs are silent.** A `‘` renders fine and still breaks search and line-breaking; guard the catalogue with a test.
- **Hero decoration that overlaps copy reads as a bug.** v1's hand-drawn annotation collided with the text at desktop widths and was removed.

## Stack (suggested; justify any deviation in the spec)

Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4 (`@tailwindcss/postcss`), pnpm, Node 24 (`nvm use 24`), `openapi-typescript` for API types, one icon library, `next/font`. Unit tests with `node --test` or Vitest; Playwright with three projects at **1440, 390, 360**. Server-render the landing and gallery; keep client islands small (header session controls, gallery interactions, studio, drawers, admin).

## Process

1. **Study** both references live (screenshots + measured styles). Also walk v1 at http://127.0.0.1:3042 to understand every flow and state you must support — as a functional reference only, not a visual one.
2. **Design spec** (save to `jas-ad-studio-api/docs/superpowers/specs/<date>-web-v2-design.md`): the style board, tokens, type scale with the chosen font's glyph proof, component inventory (buttons, chips, cards, sheet, drawer, form fields, step rail, toasts, empty/loading/error states), each page's layout at 1440 and 390, and the open questions. **Stop for Doston's approval.**
3. **Plan** in parts, each independently reviewable: (a) scaffold + tokens + fonts + API client + i18n guard; (b) header + landing + gallery + prompt sheet; (c) studio steps + uploads; (d) generation, result, versions; (e) projects + credits drawers; (f) admin; (g) privacy page, polish, full test pass.
4. **Build each part**, then stop with screenshots at 1440/390/360 (signed out, and signed in via stubs where relevant) plus the test output. Commit per part on a branch in the v2 repo.

## Definition of done

- Every route, drawer and state above works against the real API (or stubs where sign-in makes that impossible locally), in Uzbek, with correct U+02BB/U+02BC.
- It visibly belongs with motionsites.ai and Jakhongir's build: monochrome, image-led, heavy confident type, pill controls — and **no orange or other stray accent**.
- Zero horizontal overflow and ≥ 44px targets at 360/390/1440, signed out **and** signed in. Form controls ≥ 16px. Focus visible everywhere. Reduced motion respected.
- Lint and typecheck clean; unit tests (including the Uzbek glyph guard and the draft-restore case) and Playwright at three widths all green, with real output shown.
- No product rule broken: prompt-only clipboard, no video claims, no fake content, no prices while packs are empty, gallery free and signed out.
- `jas-ad-studio-web` and `jas-ad-studio-api` untouched (`git status` clean in both, apart from anything Doston approved).
- A `CLAUDE.md` in v2 recording the stack, the design system, how to run and test it, and the gotchas you hit.
