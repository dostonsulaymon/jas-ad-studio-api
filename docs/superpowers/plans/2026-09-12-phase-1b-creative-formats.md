# P1b — Creative formats

**Status:** BUILT and verified 2026-09-12 (D-057, D-058). 253 tests passing.
**Why:** ten real videos came out in one shape (D-056). Five styles exist but produce near-identical prompts.

---

## The two problems

**1. The seventeen sections are mandatory in a fixed order.** I did that in D-048 to force depth. It worked and it flattened everything. 8 of 9 prompts had the identical section list in identical order.

**2. C-6, an unrecorded source conflict.** Source 01 §25 states *"one dominant camera move per beat"* and *"do not stack whip pans, barrel rolls, crash zooms"* as unconditional **rules**. Source 02's HIGH-ENERGY COMMERCIAL MODE allows exactly those as a **permission**. Prohibitions beat permissions, so `energetic-social` produced almost the same car ad as `premium-cinematic`.

## The resolution of C-6

§25 is protecting two different things with one sentence, and they need separating:

| §25 is protecting | Status |
|---|---|
| **Product legibility** — don't reveal unseen surfaces, don't break physics, keep the product recognisable, don't crop into macro detail the reference lacks | **Unconditional.** Never relaxed by any format. This is what kept the sneakers intact. |
| **Pacing and transition vocabulary** — one move per beat, no whips, no crash zooms, no speed ramps | **Format-dependent.** This is taste, not safety, and source 02 explicitly allows the opposite. |

A whip pan does not endanger a product; revealing an invented sole does. Conflating them is why every ad looks the same.

## The design

A **creative format** is a first-class config entry, like a video target. It defines:

- which sections the prompt carries, **and in what order** — a fast social ad does not need the same seventeen as a luxury product film
- beat count and shot-duration guidance
- the camera vocabulary the format may draw on
- its energy level, which is what unlocks §25's pacing rules

The system prompt stops naming seventeen sections. It says: *use the sections the FORMAT block lists, in that order.* Same principle as D-012 — no numbers, no fixed lists in the prompt; everything from config, so a new format is a config entry rather than a prompt rewrite.

## Parts

### Part 1 — The format config
- [x] `src/ai/formats/` — a zod-validated, versioned format registry, same shape as `targets/`.
- [x] Four formats: `product-film` (today's behaviour, the safe default), `high-energy` (Doston's reference prompt), `lifestyle-story`, `ugc-authentic`.
- [x] Each maps from the existing `style` values so no brief changes are needed.
- [x] Tests: every format parses; sections are non-empty and unique; the energy level is valid.

### Part 2 — The prompt
- [x] `PROMPT ARCHITECTURE` stops listing seventeen sections; it reads them from the FORMAT block.
- [x] `EXECUTABLE CINEMATOGRAPHY` splits: the fidelity half stays unconditional, the pacing half defers to the format.
- [x] The FORMAT block is assembled and injected next to the TARGET block.
- [x] Tests: no section list survives in the prompt constant; a format change changes the assembled prompt; the fidelity rules appear regardless of format.

### Part 3 — Prove it
- [x] Generate the same product in all four formats.
- [x] Compare section lists and camera vocabulary — they must actually differ.
- [x] Record the result.

## The risk, stated plainly

**Format variety trades against product fidelity.** The calm structure is why the sneakers survived. Faster cuts and more camera movement give a video model more room to drift — which is exactly how `gpt-5.6-terra` invented a strap that did not exist.

So the fidelity half of §25 stays unconditional in every format, and the seven §49 safety fixtures must still pass. If they do not, the format is wrong, not the fixtures.

**The real test is Flow, not word counts.** One high-energy prompt through Flow, judged against the reference photo, before this direction is trusted.
