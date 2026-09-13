# REQUESTS

Things Doston wants added to the product — web, API or the owner `/admin` panel — written down the moment he asks, so none are forgotten. **A request is not a decision and not a plan.** Nothing here gets built just because it is listed.

## How this file works

1. **Doston asks → a session appends it** at the end of [Requests](#requests) with the next free number, status `new`, the date, the area, and his ask in his own words. Add *why* only if he said it. Do not design the solution here.
2. **When a phase plan is about to be written**, the session reads every `new` request with Doston, one at a time, and they decide together:
   - `accepted → P<n>`: it goes into that phase's plan. If the choice is a real product decision, it also gets a `D-0xx` entry in `DECISIONS.md`, linked here.
   - `declined`: with the reason on the **Outcome** line. Declined requests stay in the file, so the same idea is not re-litigated from zero.
   - `later`: still wanted, but not this phase. Reviewed again at the next plan.
3. **When an accepted request is built and merged**, mark it `done` with the phase.

Never delete an entry. Never renumber.

| Status | Meaning |
|---|---|
| `new` | Recorded, not yet discussed |
| `accepted → P<n>` | Agreed, scheduled into that phase's plan |
| `later` | Wanted, deferred; review at the next plan |
| `declined` | Discussed and not doing it; reason on **Outcome** |
| `done` | Built and merged |

Area is one or more of `web`, `api`, `admin`.

Template:

```
### R-0xx · YYYY-MM-DD · <short title>
**Area:** web · **Status:** new
**Ask:** what Doston said he wants.
**Outcome:** (filled in when discussed)
```

---

## Requests

### R-001 · 2026-09-13 · "Use this style" skips step 1
**Area:** web · **Status:** done on `p6d-requests` (web `fix(studio)… (R-001)`), not yet merged
**Ask:** In the example gallery, the **Prompt** button opens a side panel with **"Shu uslubdan foydalanish"**. Clicking it takes the seller straight to **step 2** of the studio, even when step 1 is empty — no photo, no product name. The seller ends up in step 2 with nothing entered. It should not skip step 1.
**Note:** found while P6 (gallery) was still being built, so it may belong in P6's own fixes rather than a later phase. The P6 plan (Task 12) has step 2 *show* the selected style; it does not say the studio should jump there.

**A first attempt was made and reverted on 2026-09-13**, so the next session does not rediscover this: routing to step 1 when the brief is incomplete works, but it makes the button look broken — the "Ilhom: …" chip lives inside step 2, so landing on step 1 gives the seller no sign that anything happened. **The fix needs the chip moved up to the workbench so it shows on every step**, and `tests/gallery.spec.ts`'s "choosing a style shows the inspiration in step 2" updated with it. Reverted rather than half-shipped.
**Outcome:**

### R-002 · 2026-09-13 · A seller's generated prompts are lost once they leave the result
**Area:** web, api · **Status:** done on `p6d-requests` — api route merged to `main` 2026-09-13; web reopens a project on its newest prompt with Versiya buttons (confirmed by Doston on the real Pixel 9a project)
**Ask:** After a prompt is generated, the seller cannot find it again. Reopening a project should show its prompts, including earlier ones — version 1, version 2 and so on. Losing a prompt the seller already paid a credit for is bad.
**Note (checked 2026-09-13, not assumed):** the prompts *are* stored — the `packages` table holds `prompt_en` and `result`, and the one test project has 2 generations with 2 packages. What is missing is any way to reach them: `GET /api/projects/{id}` returns no generation ids, there is no route listing a project's generations, and `GET /api/generations/{id}` needs an id the web no longer has. Reopening the project in the browser restores step 1 (photo, name) and shows no prompt at all.
**Outcome:**

### R-003 · 2026-09-13 · Projects list does not scale past a few projects
**Area:** web, api · **Status:** new
**Ask:** "Loyihalarim" is hard to work with once a seller has many projects — fifteen would already be difficult. Doston wants to think about how projects are shown, and to be able to filter them.
**Scope, widened 2026-09-13:** this is not "add a filter". The whole projects experience has no real design yet — the site is essentially one landing page, and where a seller's projects live, how they are browsed, and how a project and its prompts (R-002) are shown are all undecided. Doston wants to discuss it with his friends first. **Deal with it after P6 closes**, as part of R-007's review, not as a quick patch.
**Note (checked 2026-09-13):** the drawer is a flat list; each row has only **Ochish** and **Oʻchirish**. No search, filter or sort. `GET /api/projects` takes no query parameters and returns `id, name, formatId, durationSeconds, aspectRatio, createdAt` — no status, no generation count, no last-generated date to sort or filter by. Pairs naturally with R-002: a project row that shows its latest prompt is half of both.
**Outcome:**

### R-004 · 2026-09-13 · Everything shown as an example should be editable in `/admin`
**Area:** web, api · **Status:** accepted → P6b (built 2026-09-13)
**Ask:** "Make the gallery updateable from admin panel… everything which is being shown on website, main website, as example, the pictures and other parts should be editable in admin panel." Also: why are the support contacts not appearing anywhere on the website, and will the card number appear once entered?
**Outcome:** Built as phase 6b (D-090, D-091). The gallery moved from a committed JSON file to a table with full CRUD and media upload in `/admin`; the hero photos became a settings key with their own tab; the support contacts now render in the footer signed out. The card number already worked — it appears in the credits drawer when a seller places an order (Addendum A §A4), verified by driving the real screen. **Product copy (FAQ, how-it-works, hero headline) deliberately stays in code** — see D-091 for the argument; overturn it with a new request if you disagree.

### R-005 · 2026-09-13 · The hero photo editor is unusable as built
**Area:** web · **Status:** done — `p6c-hero-editor`, merged 2026-09-13
**Ask:** "I wanna see all of them there… if it's empty, the default pictures will be shown. How can I edit a picture like the third picture, I don't like it? How can I edit it? You are not thinking about this."
**Note (this is a defect in what 6b shipped, not a new feature).** The screen says *"Standart rasmlar ishlatilmoqda"* and then shows none of them. It cannot do the one thing an owner actually wants: look at the seven plates that are on the page right now and replace the third. As built it is all-or-nothing — either upload a whole set or keep the defaults — and the empty `—` placeholder says nothing. What it should be: the seven plates rendered as they appear on the page, in position, each with its own **replace** control, the committed image shown until one is overridden.
**Outcome:**

### R-006 · 2026-09-13 · The support contact cards need icons
**Area:** web · **Status:** done on `p6d-requests` (web `feat(footer)… (R-006)`), not yet merged
**Ask:** "The contact panel, add the stickers. Find sticker, please. Like, this is shit."
**Note:** the footer cards are label + handle in plain text. A Telegram mark and a mail glyph would make the three channels scannable at a glance instead of read word by word. Needs an icon source that does not add a dependency — inline SVG, sized to the text.
**Outcome:**

### R-007 · 2026-09-13 · A full design and front-end review of the site, part by part
**Area:** web, admin · **Status:** later — starts only when Doston says so, after P6 closes
**Ask:** Once P6 is finished, go through the site one part at a time, acting as UX designer, UI designer, QA and senior front-end developer: layout shifts, icons, colours, spacing, interaction, and anything that feels broken. Use the design and front-end skills available in Claude Code. Doston: "there are many problems with the front end" — he will point them out as the review goes.
**Note:** Doston started it on 2026-09-13, after P6/6b. Go part by part. Fold R-003 (projects experience), R-005 (hero photo editor) and R-006 (contact icons) into it when their parts come up. Doston reviews the rendered site, not code — show screenshots at 360, 390 and 1440.
**Outcome:**

### R-008 · 2026-09-13 · Refreshing `/admin` throws the owner back to its first screen
**Area:** web · **Status:** done on `p6d-requests` (web `fix(admin)… (R-008)`), not yet merged. Only the tab survives a refresh; an open edit form inside a tab does not (Q-4 in the p6d plan)
**Ask:** In the admin panel, refreshing the page goes back to the main screen instead of staying where the owner was. Doston: the admin panel "has lots of problems" — this is one; look at each part.
**Outcome:**
