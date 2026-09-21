# P8c — PRO access (plan, not approved)

**Status:** written 2026-09-21, awaiting Doston. Nothing built.
**Source:** R-010, Jakhongir's Notion list. Doston chose **a PRO subscription** as what "Pullik" means.
**Supersedes, if approved:** D-007 ("the example gallery, videos and their prompts, is free and needs no sign-in") and D-092's refusal of PRO badges. That needs its own `DECISIONS.md` entry; this plan does not get to change D-007 by being built.

---

## The shape of it

R-010 is two layers, and only the second one is blocked.

**Layer 1 — marking and locking.** Which examples are PRO, how that reads on the page, and the prompt genuinely not being served to someone without access. Identical under every unlock model, so nothing here is wasted whatever Jakhongir decides.

**Layer 2 — the subscription.** Who has PRO, for how long, and how they pay. Needs answers this plan cannot invent (Q-18).

**Recommendation: build Layer 1 now, with an owner grant as the only way in.** Jakhongir can then hand PRO to a pilot seller by hand and both of you can see the real thing on the real site this week. Layer 2 follows when its questions are answered. The alternative — waiting — means launching a gallery whose badges promise something nobody can buy.

---

## Layer 1 · Marking and locking

| # | What | Where |
|---|---|---|
| 1.1 | `gallery_examples.prompt_access` — `'free'` or `'pro'`, default `'free'`. One nullable-free column, one migration | `src/gallery/db/schema.ts` |
| 1.2 | The owner sets it per example: a two-way switch in the gallery sheet, beside "Saytda koʻrsatish" | `admin/gallery.tsx` |
| 1.3 | **`GET /api/gallery/:slug` stops returning `promptEn` for a `pro` example to a caller without access** and answers `PROMPT_LOCKED`. The card list never carried the prompt (`gallery.port.ts:42`), so only the detail route changes | `gallery.service.ts`, `gallery.controller.ts` |
| 1.4 | The card shows a **PRO** badge instead of the **Prompt** button; opening it offers the way in rather than the text | `gallery-card.tsx`, `prompt-sheet.tsx` |
| 1.5 | **Bepul / Pullik** filter, right-hand side above the gallery, beside the format chips | `explorer.tsx` |
| 1.6 | Owner grant: `POST /api/owner/pro` gives a seller PRO until a date, audited like every other owner write (D-037) | `owner.controller.ts` |

**1.3 is the whole point.** A badge over a prompt the API still sends is decoration — the text is one devtools tab away, and we would have told Jakhongir his paid content was protected when it was not. The test that matters asserts on the **response body**, not the page: a signed-out caller and a signed-in caller without PRO both get no `promptEn` for a pro example.

Free examples stay exactly as they are: no sign-in, no gate. **D-007 is narrowed, not deleted**, and the gallery's free half is still the shop window.

---

## Layer 2 · The subscription (blocked on Q-18)

Sketch only, so the questions are concrete. Nothing here gets built before its answers land.

- `subscriptions`: `userId`, `status`, `startsAt`, `endsAt`, `source` (`order` | `owner_grant`). A seller has PRO while `now < endsAt`. No second table for history — the ledger lesson (D-070's money rules) applies: rows are appended, never edited.
- Payment mirrors **D-008**: the seller places an order, Jakhongir confirms it by hand, and confirming extends `endsAt`. **One order extends exactly once** — the same idempotency rule as `confirm_credit_order`, and the same reason.
- Automatic Payme/Click stays deferred, as it was for credits.
- A lapse re-locks the PRO prompts. Anything already copied is the seller's; we take nothing back.

---

## Q-18 · What PRO is, exactly (for Jakhongir)

1. **Price and period.** How much, and for how long — 30 days, or a calendar month?
2. **Does PRO include generating?** ⚠️ **Answer this one first.** If PRO means unlimited prompt *generation*, every generation costs about **4,414 som** (D-082, Q-17) and an active subscriber has no ceiling: one seller generating daily costs ~132,000 som a month against a flat fee. **Recommendation: PRO unlocks gallery prompts only. Generating stays on credits.** If it must include generation, it needs a monthly cap, and the cap is part of the price.
3. **Payment:** manual confirmation like credits (D-008), or automatic checkout?
4. **Who picks the PRO examples,** and roughly what share of the gallery is paid? A gallery that is mostly locked stops being a shop window.
5. **Does PRO change the credit price** for a subscriber, or are they independent?

Q-17 is still open underneath all of this: nothing in the app is priced, and `GET /api/packs` returns `[]` by design (D-072). A PRO price is the same conversation.

---

## Exit check

- [ ] A `pro` example's prompt is absent from the API response for a caller without access — asserted on the body, at three widths in the UI
- [ ] A free example is unchanged signed out (D-007's surviving half)
- [ ] The owner can mark an example PRO and grant a seller PRO, both audited
- [ ] Bepul / Pullik filter works with the category and format chips
- [ ] A `DECISIONS.md` entry superseding D-007 and D-092 on this point
- [ ] Both repos' checks green; screenshots at 1440/390/360

## Roadmap

This is a new phase and `docs/PLAN.md` has no row for it. Where it sits — before P9 launch, or after — is Doston's call and goes in the same decision entry.
