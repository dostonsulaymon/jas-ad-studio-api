# Dark redesign — design

**Date:** 2026-09-13 · **Branch:** `p6e-dark-redesign` (web) · **Owner of the call:** Doston, who handed the design decisions over: *"learn its style and apply where needed… use icons… you can remove some things for now and make it ready, don't ask me, be creative."*

**References:** https://motionsites.ai/ (the target look) and Jakhongir's own build, https://bold-prompt-vibe-studio.base44.app/ (the pattern). Both measured from their computed styles on 2026-09-13.

**What this changes and what it does not.** The look, the landing page structure, the hero copy, and where the studio lives. **Not** the product: credits stay, examples stay real (§42), no prices are shown (D-082), no search box, no PRO/BEPUL. The api is untouched.

## Decisions Doston made (2026-09-13)

| # | Decision |
|---|---|
| 1 | Scope: look + layout + new copy. Jakhongir's PRO subscription and search are **not** adopted — pricing is still D-082/Q-17 |
| 2 | Fully dark, every surface: landing, `/studiya`, drawers, `/admin`, `/maxfiylik` |
| 3 | The studio moves to its own route, **`/studiya`**. This supersedes W-004's "`/` is the only route" |
| 4 | The hero photo tray moves out of the hero into a "Moslashtirish" section lower on the landing |
| 5 | A new accent: a **peach → orange** gradient on one headline word; solid orange for the badge and focus rings |
| 6 | Build approach: retheme through tokens, hand-fix the hard-coded spots, rebuild only the landing structure and add `/studiya` |

These supersede source 01 §5's palette and "avoid AI gradients" line for this product. Record as a D-entry in `DECISIONS.md` with the merge.

## Visual system

Synthesised from the two references, with the project's hard rules kept (Inter for `oʻ`/`gʻ`, W-001; 44px tap targets; 16px form controls; no horizontal overflow at 360).

| Token | Value | From |
|---|---|---|
| `bg` | `#0F0F0F` | Jakhongir |
| `stone-1` (surface: cards, drawers) | `#171717` | Jakhongir |
| `stone-2` (raised / hover / chips) | `#1F1F1F` | motionsites `#202020` |
| `border` | `#292929` | Jakhongir |
| `ink` (text) | `#FAFAFA` | both |
| `muted` | `#A1A1A1` — 7.8:1 on bg | Jakhongir |
| `primary` (main buttons, links) | `#FAFAFA` with `bg` text | both use white primary |
| `accent` (badge, focus) | `#FF8A4C` — 8.4:1 on bg | Doston's pick |
| `accent-soft` (gradient start) | `#FFD3B0` | Doston's pick |

- **Type:** Inter throughout. Headlines 800, tracking −0.04em, as heavy as motionsites' 900 reads without leaving Inter.
- **Shape:** pill buttons and chips (both references); cards and panels 20px (motionsites); inputs 12px.
- **Buttons:** primary = white pill, dark text, 48px. Secondary = transparent pill with a `border` hairline. Header actions = 40px-tall-visual / 44px-hit pills with a Phosphor icon.
- **Chips:** pill; active = white fill, dark text (Jakhongir); inactive = transparent, muted text.
- **Badge:** pill, 11px uppercase, tracking 0.14em, orange text on an orange 8% tint with a 40% orange hairline.
- **Gradient:** one word per page at most, the hero's last words. Nowhere else.
- **Icons:** `@phosphor-icons/react` 2.1.10 (new dependency, one family, regular weight). Server components import from `@phosphor-icons/react/ssr`. Replaces the hand-drawn SVG contact marks from R-006.
- **Shadows:** the light theme's green-tinted `rgba(23,33,29,…)` shadows become black shadows or are dropped; on dark, borders carry elevation.

## Landing `/`

1. **Header** — wordmark; `Misollar`, `Studiya`, `Savollar` at `lg`; right side: signed out → white "Kirish" pill with a sign-in icon; signed in → prompt-limit button, projects button, sign-out button. **Below `sm` the three signed-in actions are icon-only 44px buttons with `aria-label`s**, which fixes the 109/139px phone overflow found in the R-007 audit.
2. **Hero** — centred: badge *YANGI PROMPTLAR DOIMIY QOʻSHILADI*, headline *Mahsulotingizni reklama darajasiga **olib chiqing.*** (gradient on the last two words), subline *Professional AI reklama videolarini koʻring, promptini oling va oʻz mahsulotingiz uchun moslashtiring.*, CTAs *Videolarni koʻrish →* (→ `#misollar`) and *Mahsulotim uchun prompt olish* (→ `/studiya`). The hand-drawn Google Flow annotation is **removed** (R-007 taste finding; it collided with the copy).
3. **Gallery `#misollar`** — directly under the hero (gallery-first, both references). Dark cards, 20px, category chips.
4. **Qanday ishlaydi** — three numbered step cards on `stone-1` (Jakhongir's pattern).
5. **Moslashtirish** — two columns: heading, body, CTA to `/studiya` | the photo tray (owner-editable, R-005). The tray's upload slot becomes a **link to `/studiya`**: a dropped `File` cannot survive a navigation.
6. **Savollar** — the FAQ, restyled.
7. **Footer** — wordmark, the two notes, support cards with Phosphor marks, privacy link.

## `/studiya`

The existing workbench, restyled, as the only content under the header. The page reads `?loyiha=<id>` on mount and opens that project; otherwise it restores the session draft as today.

## Cross-page handoffs (the only logic change)

| From | Today (same page) | After |
|---|---|---|
| Gallery "Shu uslubdan foydalanish" | `USE_INSPIRATION_EVENT` to the workbench | writes `inspiration` into the session draft (`jas.draft.v1`), then `location.assign('/studiya')`; the workbench already restores that draft |
| Projects drawer "Ochish" | `OPEN_PROJECT_EVENT` + scroll | on `/studiya`: unchanged; elsewhere: go to `/studiya?loyiha=<id>` |
| Drawer empty state "start" | scroll to the studio | go to `/studiya` |
| Tray upload slot | `HERO_FILES_EVENT` with the files | link to `/studiya` |

## Removed for now

The Google Flow hand-drawn annotation; the tray's in-place upload from the landing; the landing "draft saved" rail text outside the studio. Nothing server-side.

## Testing

- `pnpm lint`, `typecheck`, unit tests.
- Playwright at 1440/390/360: `flow.spec.ts` moves to `/studiya`; `gallery.spec.ts`'s inspiration test follows the navigation to `/studiya`; `layout.spec.ts` gains a **signed-in** overflow check (the gap that let the header bug through).
- The R-007 capture scripts re-run against the worktree dev server, screenshots at all widths.
- Built and verified in a separate worktree on port 3044, so the public dev server (`jas-web`, which serves the main tree) never shows a half-migrated page. Merged into the served tree only when green.
