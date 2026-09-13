# JAS Ad Studio web v2: design spec

**Date:** 2026-09-13 · **Repo:** `../jas-ad-studio-web-v2` (port 3046) · **Brief:** `docs/prompts/2026-09-13-frontend-rebuild.md`

Doston asked for the build to run end to end without stopping for questions. So this spec records the decisions made, and the open items are listed at the end rather than asked one at a time.

## 1. What the references measured (2026-09-13, Chrome, 1440/390/360)

| | motionsites.ai | Jakhongir's build | v2 takes |
|---|---|---|---|
| Background | `#121212` | `#0F0F0F` | `#0F0F0F` |
| Text / muted | `#F5F5F5` / `#ABABAB` | `#FAFAFA` / `#A1A1A1` | `#FAFAFA` / `#A1A1A1` |
| Border / raised | `#303030` | `#292929` / `#171717` | `#292929` / `#171717` |
| Headline | system sans 900, uppercase, 56px, −1.68px | Sora 600, 60px, −1.5px | **Onest 900**, sentence case, up to 84px, −0.045em |
| Primary CTA | pill 56px, `#FAFAFA→#CFDEF6` | 8px radius, 40px, white | pill 56px, the gradient, on the one main action per screen |
| Chips | pill, active `#202020` | pill, active white + dark text | pill, active white + dark text |
| Cards | 20px radius, image-led, dense | image top, meta line, tags, `Prompt →` | 20px poster, 9:16, dense grid, meta + title + `Prompt` |

**Structure (from Jakhongir's build):** hero with badge, headline, subline, two CTAs and search. Then the gallery with category and style chips, 3 steps, Moslashtirish with an upload box, a final CTA band, and the footer. **Feel (from motionsites):** heavy type, a big poster grid that makes the product look premium, pill controls, almost no chrome.

**Not adopted:** PRO/BEPUL badges, the 99 000 soʻm plan, subscription copy, tag pills on cards, the peach→orange accent from v1.

## 2. Font: Onest, with the glyph proof

Every candidate was rendered at 54–64px with `Oʻzbekiston gʻoya eʼlon`, and a monospace fallback made any substitution visible.

| Passes (native `ʻ` and `ʼ`) | Fails (fallback glyph, spaced gap) |
|---|---|
| **Onest**, Inter Tight, Inter, Unbounded | **Sora**, Manrope, Geist, Golos Text, Hanken Grotesk, Bricolage Grotesque, Instrument Sans, Figtree, Archivo |

- **Sora fails U+02BB.** Jakhongir's build only looks right because its copy uses U+2018 (`‘`), which is the wrong character and breaks search.
- **Onest** (variable 100–900) is the only face for the whole app. At 900 it has motionsites' weight, it reads more distinctly than Inter (v1's face), and its long Uzbek words stay legible. In uppercase the headline stacked four lines deep, so headlines stay in sentence case. The only uppercase is the hero badge, set via CSS as the brief asks.
- The prompt block uses the system monospace stack. It holds English only, so no extra font download is needed.

## 3. Tokens

| Token | Value | Use |
|---|---|---|
| `bg` | `#0F0F0F` | page |
| `raised` | `#171717` | cards, drawers, inputs, panels |
| `raised-2` | `#1F1F1F` | hover, pressed, skeletons |
| `line` | `#292929` | every border |
| `line-strong` | `#3D3D3D` | hover border |
| `ink` | `#FAFAFA` | text, solid buttons |
| `muted` | `#A1A1A1` | secondary text (7.4:1 on bg) |
| `danger` | `#F26D6D` | errors, destructive only |
| `success` | `#4CC38A` | confirmed, copied, saved only |
| CTA gradient | `linear-gradient(to top, #CFDEF6 20%, #FAFAFA)` | the one main action per screen |

- **Type scale (Onest):** display `clamp(40px, 6.2vw, 84px)`/0.98/900/−0.045em · h2 `clamp(30px, 3.4vw, 46px)`/1.05/800/−0.035em · h3 20/1.25/700 · lead 18/1.55 · body 16/1.55 · small 14/1.45 · label 13/600 · badge 11 uppercase, 0.16em tracking.
- **Shape:** buttons and chips are pills · cards, panels and drawers 20px · inputs and thumbnails 12px.
- **Buttons:** `primary` is the gradient pill, 56px on the hero and 52px elsewhere. `solid` is a white pill. `outline` is transparent with a 1px line. `ghost` is muted text. `danger` is an outline with red text. All are at least 44px tall.
- **Focus:** a 2px `#FAFAFA` outline, offset 3px. The dark gap between button and ring keeps it visible on white buttons.
- **Icons:** `@phosphor-icons/react`, regular weight, 18–20px. Server components import from `/ssr`. Icon-only buttons carry an `sr-only` label.
- **Motion:** 160ms for hover and colour, 240ms for sheets and drawers, with a cubic-bezier(.2,.8,.2,1) ease-out. The card hover lift is 2px. Copying shows an inline check. There is no scroll-triggered animation. `prefers-reduced-motion` sets every duration to 0.

## 4. Component inventory

Button · Chip (radio-like, `aria-pressed`) · Sheet (one dialog primitive: right panel ≥640px, bottom sheet below; focus trap, Escape, return focus, scroll lock) · Field (label above, help and error below) · TextInput / TextArea / Select · OptionCard (real radio in a 12px card) · StepRail (3 real buttons, `aria-current="step"`) · Toast (one polite live region) · ErrorNotice (message, detail, action, request id) · Skeleton (matches the final shape) · Empty state (one sentence plus one action) · GalleryCard · PromptBlock (selectable `<pre>` plus Copy with a manual fallback) · StatusPanel (queued, running, needs_input, refused, failed).

## 5. Pages

**Header (every page).** 64px, sticky, solid `bg` with a bottom line. The logo sits left: a white 28px tile with **J**, plus "JAS Ad Studio" from `sm` up. On desktop the landing's section links sit in the centre. Signed out, the right side has a white "Kirish" pill. Signed in it has a balance pill, projects, admin (owner only) and sign out; below `sm` these become 44px icon buttons with sr-only labels. It is tested at 360 signed in.

**`/` at 1440:**
```
[header]
            ( YANGI PROMPTLAR DOIMIY QOʻSHILADI )
        Mahsulotingizni reklama darajasiga
               olib chiqing.
     subline, 2 lines, muted
     [ Videolarni koʻrish → ] ( Mahsulotim uchun prompt olish )
     [ search: title / category ................ ]
Reklama misollari                                  3 ta video
(Barchasi)(Uy-roʻzgʻor)(Aksessuar)   (Barcha formatlar)(Studiya filmi)(Hayotiy hikoya)
[poster 9:16][poster][poster][poster]      4 columns, 20px gap
 meta · title · provenance · (Prompt)
Qanday ishlaydi     1 ── 2 ── 3   one panel, three columns, big numerals
Moslashtirish       left: pitch + CTA   right: 4×2 plates (7 owner photos + 1 upload tile)
Savollar            left heading, right 4 disclosure rows
[ final band: headline + primary CTA ]
[footer: brand line · support contacts that are set · privacy]
```
**At 390/360:** the hero stacks and the CTAs go full width. The chip rows scroll sideways with no wrap. The grid has 2 columns with 12px gaps. Steps stack. Plates become 4×2 small tiles. The FAQ runs full width.

**`/studiya` at 1440:** intro (h1 and sub) · the StepRail · a two-column layout. The form is on the left (max 640px); a sticky product panel on the right shows the primary photo, name, photo count and the chosen style. On phones the product becomes a compact row above the form. The step actions sit in a **`sticky bottom-0` bar scoped to the studio section**, never `fixed`.
- Step 1: sign-in prompt when signed out · name · description with counter · photos. The upload area stays locked until the name and description exist, because the project is created on the first upload.
- Step 2: goal and format as option cards · platform and aspect as chips · the inspiration chip · "Qoʻshimcha sozlamalar" disclosure (audience, claims, offer).
- Step 3: summary with per-section "Oʻzgartirish" · credit cost and balance · the gradient "Reklama promptini tayyorlash".
- Generation: an indeterminate status panel, announced to screen readers.
- Result: version pills · PromptBlock first (Copy, TXT, "Google Flow’ni ochish") · concept · shot timeline · product rules · assumptions and review notes.

**Drawers:** Projects (list, open, delete confirmed in the row, empty state) and Prompt limiti (balance, "Paketlar hali sozlanmagan", the order form with payment instructions when packs exist, own orders with cancel).

**`/admin`:** the same header · "Egasi paneli" · tab pills that scroll sideways, with the tab in the URL hash · one column (max 1080px) per tab. The v1 flows are rebuilt in the v2 system: in-row confirmations replace `window.confirm`, and spend bars have no background track.

**`/maxfiylik`:** the interim text in a narrow 68ch column.

## 6. Decisions made without stopping (Doston: "don't ask me questions")

1. **Onest** instead of Sora, because Sora fails U+02BB (§2).
2. **The gradient** appears only on the single main action of each screen.
3. **The projects list stays a drawer** for now. It is what the brief's IA specifies; see open item 1.
4. **No animation library.** CSS transitions cover 160–280ms purposeful motion, and one dependency fewer.
5. **Search and chips filter the same list.** Search matches title, category label and format label, all normalised (`'`/`‘` → `ʻ`).
6. **Card meta** is sentence case, `Uy-roʻzgʻor · Studiya filmi`, not an uppercase eyebrow.
7. **Sign-in lives only in the header and inside studio step 1.** No modal.

## 7. Open items for Doston

1. **R-003:** should projects become a page with filters? The API has no status or generation count on the list, so a page would mostly be a bigger drawer until the API adds them.
2. **Local writes:** v2 on 3046 is not in `EXTRA_WEB_ORIGINS`, so every write from it is refused (`CROSS_ORIGIN_REFUSED`). Signed-in screens were built and tested on stubs. Appending `http://localhost:3046,http://127.0.0.1:3046` needs your yes plus a `jas-api`/`jas-worker` restart.
3. **A public preview host** for a real end-to-end walk (Cloudflare, the tunnel and OAuth) is your call.
