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
**Note, 2026-09-13:** v1 was replaced by v2 (D-093), so this review now runs on `jas-ad-studio-web-v2`.
**Outcome:**

### R-008 · 2026-09-13 · Refreshing `/admin` throws the owner back to its first screen
**Area:** web · **Status:** done on `p6d-requests` (web `fix(admin)… (R-008)`), not yet merged. Only the tab survives a refresh; an open edit form inside a tab does not (Q-4 in the p6d plan)
**Ask:** In the admin panel, refreshing the page goes back to the main screen instead of staying where the owner was. Doston: the admin panel "has lots of problems" — this is one; look at each part.
**Outcome:**

### R-009 · 2026-09-13 · Rebuild the frontend from scratch, looking like motionsites.ai and Jakhongir's build
**Area:** web, admin · **Status:** done — phase 6f, D-093
**Ask:** "We will build the front from scratch later… so it will build it differently while not touching the existing one, should look like the one I gave you and Jahongir's own one. The one you built is more like shit because of the colors mismatch and old design."
**Note:** the dark redesign (D-092) recoloured v1's components and added an orange accent that neither reference has; the result read as reskinned, not designed. The rebuild is a new app in `jas-ad-studio-web-v2`, monochrome, designed from the references outward, with the API unchanged and v1 left running until Doston approves a switch. The ready-to-paste prompt is `docs/prompts/2026-09-13-frontend-rebuild.md`. R-003 (the projects experience) should be decided inside that rebuild.
**Outcome:** Built 2026-09-13 as `jas-ad-studio-web-v2` and switched live the same day: pm2 `jas-web` serves it on 3042, and v1 is stopped (D-093). R-003 was not decided inside the rebuild; projects stay a drawer and R-003 stays open.

### R-010 · 2026-09-21 · A PRO badge on some examples, and a Bepul / Pullik filter
**Area:** web, api, admin · **Status:** Layer 1 built on `p8c-pro-access` 2026-09-21 (D-100), uncommitted. Layer 2 (the subscription) blocked on Q-18
**Ask:** "Some content needs a **PRO** badge instead of the prompt below the videos; admins need the option to make the prompt free or paid. (Above the gallery section's right-hand side, there will be a Bepul & Pullik filter button)"
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 2026-09-21.
**Outcome:** Not built in P8b (D-099); taken up as its own phase on 2026-09-21 after Doston reaffirmed it. He chose **a subscription** as what "Pullik" means, which makes it a phase rather than a task: plan in `docs/superpowers/plans/2026-09-21-p8c-pro-access.md`, open questions in **Q-18**. **The deferral in P8b was too wide** — only the unlock step needed Jakhongir; the badge, the owner switch, the Bepul/Pullik filter and the server-side lock are the same under every model and could have been built. Original reasoning kept below because it still holds for the subscription half: not built in P8b (D-099). It overturns D-007 (the gallery and its prompts are free and need no sign-in) and was already declined once in D-092 for the same reason: what "Pullik" costs is undecided while Q-17/D-082 is open and `GET /api/packs` returns `[]`. Needs Jakhongir's answer on what a paid prompt means (credits, a subscription, or marketing only), then its own decision entry and plan.

### R-011 · 2026-09-21 · The gallery wastes the left and right edges of a wide screen
**Area:** web · **Status:** done on `p8b-revisions` (D-099), not yet merged
**Ask:** "When the site is open, it has too much free space on the left and right sides of the gallery. We don't need this extra space when we have more content."
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 2026-09-21.
**Outcome:** Built. The gallery measure is 1600px with a fifth column at `2xl`. With three published examples no width removes the space, so a row never has more columns than it has cards and a short row is centred: the gap is symmetric rather than a hole where the fourth card should be. It closes when Q-04 is answered and more examples exist.

### R-012 · 2026-09-21 · Remove the gallery's section header to close the gap under the headline
**Area:** web · **Status:** done on `p8b-revisions` (D-099), not yet merged
**Ask:** "We have to remove this part completely so that we can have less space between the main headline and the gallery." (the *Reklama misollari* title, its lead paragraph and the count)
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 2026-09-21.
**Outcome:** Built. The heading, its lead paragraph and the visible count are gone; the `<h2>` stays `sr-only` because the section is `aria-labelledby` it, and the live result count moved into the filter row, where it is still the only feedback filtering gives.

### R-013 · 2026-09-21 · Gallery videos play by themselves
**Area:** web · **Status:** done on `p8b-revisions` (D-099), not yet merged
**Ask:** "Videos have to play automatically when a user visits the website."
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 2026-09-21.
**Outcome:** Built, muted and in view only (D-099). The `src` attaches on a card's first intersection, the clip loops while on screen and pauses when it leaves, and `prefers-reduced-motion` keeps the old play-on-demand behaviour. The e2e assertion `autoplay === false` was replaced by three that state the new contract. **Live 2026-09-21.** Seeing it, Doston asked why the play buttons are still there: the control stays (WCAG 2.2.2, and it is the only way to start a clip under reduced motion) but now fades while the clip plays and returns on hover or focus, on pointer devices only.

### R-014 · 2026-09-21 · The hero headline's line height is too tight
**Area:** web · **Status:** done on `p8b-revisions` (D-099), not yet merged
**Ask:** "The leading of the headline text is so small; it has to be a bit bigger so that it'll be much easier to read."
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 2026-09-21.
**Outcome:** Built. Hero headline leading `0.98` → `1.06`, tracking `-0.045em` → `-0.04em`.

### R-015 · 2026-09-21 · Adding a gallery example asks for too much, and says only that something is wrong
**Area:** admin, web, api · **Status:** done on `p8b-revisions` (api + web, D-099), not yet merged
**Ask:** "It became so tough to upload a resource to the gallery. No need for all the sections to be filled." Screenshot shows the save failing with *"Ma'lumotlarda xatolik bor. Belgilangan maydonni to'g'rilang."* and a request id, with no indication of which field.
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 2026-09-21.
**Outcome:** Built, in three parts (D-099). The API already returned `details.fields[]`; the panel now names those fields in Uzbek and marks the inputs. A draft needs only slug, title, category, format, ratio and sort order; publishing still requires everything, with one issue per missing field. The sheet derives the slug from the title, reads duration and ratio off the uploaded clip, and groups the publish-only fields under their own heading.

### R-016 · 2026-09-21 · The PRO badge should be gold
**Area:** web · **Status:** accepted → P8e, built 2026-09-21
**Ask:** "I just saw that you put PRO there… please change the color of it, like some golden colour, maybe." Reference: a gold `🔒 PRO` pill, with `BEPUL` on the free ones.
**Note:** the design system is monochrome with **no hue accent** (D-092, web CLAUDE.md). Gold is a deliberate exception to that rule, not an oversight — see D-104.
**Outcome:** Built on `p8e-pro-badge`. `--color-pro: #e3b341` with dark text and a filled lock, and the locked card's button carries the same gold in its icon.

### R-017 · 2026-09-21 · A raw product photo on the top left of each gallery video
**Area:** web, api, admin · **Status:** new
**Ask:** "On the top left-hand side of the video, there has to be a raw photo of a product like in the reference below." The reference shows a small square thumbnail of the original product photo sitting over the top-left corner of each card's video.
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, entry dated 21.09.26.
**Note:** we do not have this photo. A gallery example stores `videoPath` and `posterPath` and nothing else; the seller's original reference image is not kept with an example. It needs a new nullable column, an upload in `/admin`, and somebody to supply one photo per example.
**Outcome:** Built on `p8f-reference-photo` (D-105). `reference_photo_path` (migration `0013`, nullable), an upload-and-remove slot in the `/admin` gallery sheet, and a rounded thumbnail over the top-left of the card. **Every example was seeded with a photo at Doston's instruction** — *"this is dev, we can update anything, just use random photos"* — of which three are the genuine product (rotary phone, notebook, wipes) and the rest are placeholders to be replaced in `/admin`.

### R-018 · 2026-09-22 · Smaller headline, so the gallery peeks above the fold
**Area:** web · **Status:** declined for now — Jakhongir struck it through himself
**Ask:** "Headline text on this part has to be a little bit smaller and also placed a bit above so that a part of the gallery can be seen when a visitor enters the website."
**Outcome:** Marked **(Not for now)** on the Notion page by Jakhongir. Not built. Note that R-014 moved the hero leading the other way (1.06) two days earlier at Doston's request, so these two pull against each other and whoever revives this should read D-104 first.

### R-019 · 2026-09-22 · No way to regenerate a prompt in a different format
**Area:** web · **Status:** accepted → P8i
**Ask:** "Once, after generating a prompt, there is no option to regenerate the prompt in a different format (reklama formati) for an ad video." Two suggestions: on step 2 the bottom button becomes **Tayyorlash** instead of **Davom etish** and generates straight away, **OR** **Yangi versiya tayyorlash** is placed above **Promptni nusxalash**.
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 21.09.26 section.
**Outcome:** Built his first option, which is the one that fixes the actual problem: on step 2, once the project already has a prompt, the bottom button is **Tayyorlash** and pressing it jumps to step 3 and generates. His second option — moving **Yangi versiya tayyorlash** above **Promptni nusxalash** — was not needed; that button already exists and only makes a new version of the *same* brief, which is not what "a different format" means.

### R-020 · 2026-09-22 · A Telegram username for sending the payment receipt
**Area:** web, admin · **Status:** accepted → P8i
**Ask:** "For making a payment and sending it for approval, there has to be a Telegram username '@username' to send the transaction screenshot. There has to be a message below the card number." The Uzbek line: *"Tasdiqlash uchun toʻlov chekini telegram orqali yuboring → @username"*.
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 21.09.26 section.
**Outcome:** Built, in **both** places a card number is shown — the credits drawer and the PRO panel — because a transfer means nothing until somebody sees the receipt. No API change was needed: `supportContacts.telegramUser` already existed and is already public, so the handle is whatever the owner has set in `/admin` (`@dostonsulaymon_wk` today) and the line disappears if it is cleared.

### R-021 · 2026-09-22 · PRO includes a capped number of generations
**Area:** api, web · **Status:** new — **changes D-102**
**Ask:** "When a user buys a pro plan, the user gets access to a limited number of prompt generation options (the exact number and the price of the PRO plan will be determined soon after calculating the expenses for generating one prompt approximately) and full access to pro prompts as well. We have to consider this while preparing the payment method."
**Note:** D-102 answered Q-18 with "PRO unlocks gallery prompts only; generating stays on credits", chosen because a flat fee against an uncapped ~4,414 soʻm cost has no ceiling (D-082). Jakhongir is now asking for the **capped** variant, which is safe *because* it is capped — the cap is part of the price. **The number is the blocker**, and he says it comes after his cost maths.
**Source:** Jakhongir's Notion page *Revisions on PROMPTLY*, 21.09.26 section.
**Outcome:**
