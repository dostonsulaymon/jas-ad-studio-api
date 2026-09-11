# P1 — AI core and the real-world go/no-go

**Status:** REVISED after review, awaiting Doston's answer to Q-P1-1 and Q-P1-4
**Repo:** `jas-ad-studio-api` only (D-026)
**Built from:** design spec §5, §12 · source 01 §25, §26, §27, §28, §49, §50, §51, §52 · source 02 in full · D-012, D-013, D-017, D-019, D-029, D-043
**Review:** a review agent checked this draft against the sources and the locked decisions on 2026-09-11. Its findings are folded in below; the two it raised that only Doston can settle are Q-P1-1 and Q-P1-4.

---

## What P1 is for

P1 answers one question: **do the prompts we write produce videos a seller would actually post?** Everything here exists to get an honest answer cheaply, before any UI, account, credit or upload code is written.

No HTTP, no database, no auth, no credits. A command-line script runs the AI module end to end, and Jakhongir takes the output to Google Flow.

**Exit:** the seven safety fixtures pass the hard-fail rubric (source 01 §51), then Jakhongir runs ~10 real products through Flow and **at least 6 are usable** (D-019).

### Not in P1

HTTP endpoints · the database · accounts · credits · uploads · the needs-input cache (needs a database; P4) · the job queue · the web repo.

---

## The central problem: sources 01 and 02 disagree

| | Source 01 §25 | Source 02 | Veo 3.1 |
|---|---|---|---|
| Prompt length | ~180–350 words | 500–1,000 words | 1,024 **tokens** ≈ 700 words ceiling |
| Beats | 3 (0–2 / 2–6 / 6–8 s) | 4 (0–1.5 / 1.5–4.5 / 4.5–6.5 / 6.5–8 s) | — |
| Camera | one move per beat, no stacking | high-energy mode allows whips, speed ramps | — |

D-012 resolves all of it the same way: **the system prompt contains no numbers.** Every limit lives in the video-target config and is injected at instruction level. Source 02's upper range would not fit Veo 3.1 at all; source 01's would waste the budget. P1 measures which range actually produces better video, at 300 / 500 / 700 words (spec §5's figures) and 2 / 3 / 4 beats.

---

## Dependencies (standing gate)

| Package | Why |
|---|---|
| `openai` | Official SDK, Responses API, image input, strict structured output (source 01 §27) |
| `sharp` | Downsizes fixture photos to the model-input copy and strips metadata before they are committed or sent (spec §7, R-6). Arrives in P2 regardless. |

No tokenizer dependency — see Q-P1-1. No Claude or Gemini SDK (D-043).

`sharp` is a native binary: it must be added to the Dockerfile build and to CI.

---

## Open questions

### Q-P1-1 · How do we enforce Veo's 1,024-token ceiling? **Needs Doston — this supersedes part of a locked decision.**

Veo's tokenizer is not published, so we cannot count its tokens. But D-012 locks "**maximum prompt tokens** and words" as config fields, spec §5 locks `maxPromptTokens: 1024`, and `docs/BRIEF.md` records C-4 as "each target's **token ceiling is enforced by validators**." Changing that is a standing-gate change, not a design preference — which is what the first draft got wrong.

| | Approach | Honest? |
|---|---|---|
| **A (recommended)** | Enforce a **word and character ceiling**. Keep `sourceTokenLimit: 1024` in the config with its URL and `checkedAt` as the documented origin, and name the enforced field `maxWords` so it never claims precision we don't have. During Part 8a, measure the real tokens-per-word distribution across the generated corpus as a **diagnostic**, and set `maxWords` from the observed p95 rather than from a guessed 1.3 ratio. | Yes — it says what it measures |
| B | Count with an OpenAI tokenizer and call it the token count | No — a different model's BPE, presented as fact |
| C | Keep D-012 exactly as written | Not implementable; there is no Veo tokenizer to call |

**If Doston approves A, it is written as a decision superseding the token-counting part of D-012 and spec §5, and Part 1 does not start until that entry exists.** The rest of D-012 — no numbers in the prompt, everything per target — is untouched.

### Q-P1-4 · What is `brief.json`? **Needs Doston.**

The CLI takes "a product folder with photos and `brief.json`". That file encodes goal, audience, style, offer, confirmed claims, duration, aspect ratio and gallery inspiration — which is exactly source 01's step-1 and step-2 wizard input, the thing P2–P4 build the UI against and Session B consumes through `openapi.json` (D-031). Inventing it by accident here and re-deciding it in P4 is guaranteed rework across two repos.

**Recommended:** define it in Part 2 as a zod schema in the `ai` module's public port, deliberately, as the first draft of the real brief contract — reviewed now with P2–P4 in mind, not improvised.

### Q-P1-2 · Which provider adapters? — **ANSWERED (D-043)**

Interface plus the OpenAI adapter only. The seam is proven by a `FakeProvider` used throughout the tests. P1 compares OpenAI models against each other and PROGRESS records it as a one-provider comparison.

### Q-P1-3 · The live spend cap — **ANSWERED below, once the matrix is defined**

The first draft said "$5" before knowing how many runs there are. The matrix is now defined in Part 8a (6 configs × 7 fixtures = 42 runs, up to 84 billed calls with repairs). The cap is computed from the real per-call cost measured at Part 5b, not guessed. The CLI refuses to start without `--max-spend-usd`, and the check is **pre-call against a worst-case estimate of this call plus its possible repair** — checking after the call has already spent the money is not a cap.

---

## Part 0 — Prerequisites from Jakhongir (before Part 1)

D-013 says the Flow facts are "confirmed by Jakhongir's test runs", and spec §5 literally reads `durations: [8] (confirm in Flow)`. If the chosen mode turns out to do 6 seconds, or handles reference images differently, every fixture run and the whole sweep is void.

- [ ] Which Flow mode — "Frames to video" or "Ingredients to video" — and its supported durations, aspect ratios and reference-image rules.
- [ ] **Does Flow's prompt box accept a ~700-word prompt, or silently truncate?** Nobody has tested this, and the entire length premise rests on it.
- [ ] His Google Flow generation quota. Part 8b and Part 9 together need roughly 20–40 videos, and up to two fix-and-retest rounds on top (D-019). These are **his** Google credits — the app never touches them (CLAUDE.md).
- [ ] The ~10 real pilot products, a mix of categories. Sourcing these is a multi-day human task, not a checkbox, and it is not currently on his owed list in spec §15.

**Verify:** the answers recorded in `docs/PROGRESS.md` with a date, and the target config's `checkedAt` set from them.

---

## Parts

Each part stops for review. **Every part ends by updating `docs/PROGRESS.md`, ticking these boxes and recording any new decision — before the next part starts.**

### Part 1 — Video target configuration

- [ ] `src/ai/targets/` — a versioned config file, reviewed like code (D-012, D-013).
- [ ] The `flow-veo-3.1` entry: `id`, `version`, `sourceUrl`, `checkedAt`, `maxWords`, `maxChars`, `recommendedWords`, `sourceTokenLimit`, `beats: { default, max }`, `durations`, `aspectRatios`, `referenceImages`, `referenceMode`, `highEnergyCameraAllowed`.
- [ ] `version` is required: without it the Part 8a results table cannot say which config produced which prompt, and the Part 7 recordings cannot be invalidated when the config changes.
- [ ] A zod schema for the config itself, so a malformed target fails at import.
- [ ] `recommendedWords` and `beats.default` ship provisional, marked as such, and are settled by Part 8b.
- [ ] Tests: the shipped config parses; `beats.default > beats.max` is rejected; an unknown target id is rejected; empty `durations` or `aspectRatios` are rejected; a missing `version` is rejected.

**Verify:** `pnpm test`. No AI call.

### Part 2 — The output contract

**Module layout, corrected.** The review ran the actual eslint config against a stub `ai` module: a directory named `src/ai/schema/` does **not** match the `schema` element (which is `src/*/db/**`), so it falls through to `module`, and `port → module` is disallowed — a hard lint error that CI runs before the tests. The output types are the contract, so they live in the port, which also matches D-031's "zod schemas are the single source".

- [ ] `src/ai/public/` — the output schema, the brief schema (Q-P1-4), the provider port and its DI token. Nothing else imports across the module line.
- [ ] `src/ai/prompt|targets|providers` stay module-internal. **No directory named `schema/`** — the word is already a boundaries element type meaning something else, and that trap costs the next reader an hour.
- [ ] The output shape per source 01 §26, **without `editingAssets`** (D-017): strict objects, no unknown properties, explicit nullability, bounded arrays and strings, enums for `status` and `style`.
- [ ] **The trusted envelope (source 01 §26).** "Persist separately as trusted server metadata: prompt version; model; usage; request ID; capability version; gallery inspiration ID. *Do not let the model author these as trusted facts.*" The model's JSON is wrapped in a server-stamped `{ promptVersion, provider, model, targetId, targetConfigVersion, requestId, usage, galleryInspirationId }`. Everything downstream — the Part 6 report, the Part 8a table — reads provenance from the envelope, never from the model's own output.
- [ ] **The JSON Schema downgrade.** zod v4's `toJSONSchema` emits `maxItems`/`maxLength`; OpenAI's strict Structured Outputs rejects those keywords, requires every property in `required` (so `.optional()` is unusable — nullable unions only) and `additionalProperties: false` throughout. A tested downgrade step strips the unsupported keywords and asserts none remain. **Consequence, stated plainly:** the bounds are then enforced only by our own zod parse, so a bound violation becomes a Part 5 repair rather than a provider-side rejection. The exact keyword list is confirmed against the live API at Part 5b.
- [ ] Tests: a well-formed `ready` parses; unknown properties rejected; `ready` with `concept: null` rejected; `questionsUz` longer than 2 rejected; oversized strings rejected; the downgraded JSON Schema contains no unsupported keyword and no `optional`.

**Verify:** `pnpm test`, and `pnpm lint` passes with the real `ai` module present.

### Part 3 — Deterministic validators

Pure functions, the largest test surface in P1. Source 01 §28 and §50.

- [ ] **Target and capability (§50):** the target exists; `durationSeconds` and `aspectRatio` are supported; reference mode is supported; **the model's echoed target matches the server-requested one** — a model that renegotiates its own duration is the §51 hard failure "unsupported provider mode".
- [ ] **Length:** `promptEn` within `maxWords` and `maxChars`; non-empty on `ready`.
- [ ] **Timeline:** first shot starts at 0; contiguous, no overlap, no gap; last shot ends at the duration; beat count ≤ `beats.max`.
- [ ] **Forbidden directions (§50 + D-017):** `promptEn` must not carry voiceover, narration, subtitles, burned-in captions, on-screen text or music cues. Source 01 §25 sets default audio to foley and room tone with no music, dialogue or narration, and D-017 defers voiceover and overlays entirely. Cheap, deterministic, and it protects a locked decision from silent drift.
- [ ] **Placeholders:** no `[PRODUCT]`, `{…}`, `TBD`, `Lorem`.
- [ ] **Script:** Uzbek fields normalize to NFC and to **one canonical apostrophe, U+02BB (ʻ)**, the Uzbek standard. Source 01 writes U+2018, sellers type U+0027, and all three render nearly identically — so normalize the two wrong variants first, then validate. Uzbek fields containing Cyrillic hard-fail.
- [ ] **Language, with source 01 §28's own hedge ("where practical") kept:** Cyrillic in `promptEn` hard-fails; Uzbek-specific apostrophes outside quoted spans hard-fail; an English function-word ratio over a ≥300-word prompt is recorded as a **warning**, not a repair trigger. Burning a paid repair call on a good prompt because a heuristic misfired is worse than the warning.
- [ ] **Ready state:** `ready` has concept, shots and prompt; `needs_input` has 1–2 questions and no prompt; `refused` has a message and no prompt.
- [ ] Every validator returns a structured error naming the field and the problem — the repair call is fed these verbatim.
- [ ] Tests: a passing and a failing case per rule, plus boundaries (exactly `maxWords`, a shot ending at 7.999, a single-beat timeline, each apostrophe variant).

**Verify:** `pnpm test`. No AI call.

### Part 4 — The merged system prompt V2

- [ ] `src/ai/prompt/ad-director.v2.ts` — `AD_DIRECTOR_SYSTEM_PROMPT_V2`, server-only, versioned.
- [ ] Keeps from source 01 §25: input trust, gallery-inspiration limits, evidence before invention, product lock, category guidance, Uzbek context, language rules, the pre-return self-check.
- [ ] Adds source 02's **full** architecture (02:706–721), which the first draft quoted incompletely: Product Reference · Product Lock · **Commercial Concept** · **Creative Direction** · Camera · Product Motion · Environment · Lighting · Material Treatment · Sequence · Editing · Audio · Hero Ending · **Visual Quality** · Fidelity Requirements — plus the **Opening Hook** requirement (02:186–210: describe an actual hook, not "start with an attention-grabbing shot") and **Negative/Avoidance direction** (02:619–643, with its warning against a universal hundred-item negative list).
- [ ] Adds source 02's quality bar (02:647–683) as instruction.
- [ ] **No numbers.** Length, beats and camera intensity come from the injected target block, assembled from Part 1's config.
- [ ] User text, filenames, image text and gallery presets go in the **data** section, never the instruction section.
- [ ] Tests: the assembled prompt carries the target's values; contains no hard-coded word or beat count; a target change changes the prompt; an input containing "ignore previous instructions" lands in the data section.

**Verify:** `pnpm test`. **From here, changing this file is a standing-gate change.**

### Part 5 — Provider interface and the OpenAI adapter

- [ ] `src/ai/public/provider.port.ts` — `generate(input): Promise<ProviderResult>` and the DI token (R-7).
- [ ] **Plain classes with constructor injection, not a Nest application context.** The CLI constructs them directly; a Nest module wrapper is added in P4 when the worker needs it. A script with no HTTP does not need `NestFactory`, and P0 already showed how that fails under a non-compiling runner.
- [ ] `OPENAI_MODEL` added to `env.schema.ts` and `.env.example`; `--model` overrides it. Source 01 §27 forbids hard-coding an unverified model name.
- [ ] `store: false` where supported — **without claiming it guarantees zero provider retention** (source 01 §27). These are sellers' product photos.
- [ ] **`maxRetries` and `timeout` set explicitly.** The SDK retries twice by default, so one "call" is silently up to three billed requests — which also contradicts source 01 §28's "usually one multimodal AI call". Transport retry and the §28 repair call are different things and are named differently in the code.
- [ ] **The repair path, fully specified.** Call → schema check → validators → at most one repair carrying the validator errors → terminal. Plus the four cases the first draft left undefined:
  - the spend check is **pre-call**, against a worst-case estimate of the call plus its possible repair, reconciled afterwards with real usage;
  - if the repair itself fails, the result carries **both** the original validator errors and the repair failure, or Part 8a debugging is blind;
  - an explicit state table for (first status × repair status) — a repair that answers `needs_input` is schema-valid and passes every validator, and must not be reported as success;
  - **whether the repair resends the images** — see Q-P1-5 below.
- [ ] Error mapping: refusal, timeout, truncation, network failure, malformed structured response → `AI_REFUSED`, `AI_TIMEOUT`, `AI_TRUNCATED`, `AI_MALFORMED` (spec §9).
- [ ] `FakeProvider` with scripted responses.
- [ ] **A guard, not a convention:** `vitest.setup.ts` overrides `fetch` to throw on any request to a provider host. "No test calls out" as a rule is a hope; as a guard it is a fact.
- [ ] Tests against the fake: a clean response passes; a validation failure triggers exactly one repair; a second failure ends `failed`, not a third call; a repair returning `needs_input` is not reported as success; timeouts and malformed bodies map correctly; usage and cost recorded; the pre-call cap refuses a call that could exceed it.

**Verify:** `pnpm test`. **No live call yet.**

> **Q-P1-5 · Does the repair call resend the product images?** Resending 3–4 images roughly doubles image cost per repair; not resending them means the model rewrites the prompt without seeing the product, which is a product-lock risk. **Recommendation: resend.** A cheaper prompt that invents a product surface is worthless, and the repair is capped at one. Recorded as a decision either way.

### Part 5b — One capped live smoke call

The first draft made the first live call at Part 8, after eight parts built on an unverified provider contract. Source 01 §52 effectively asks for this: "if valid live credentials are available, perform a small capped live evaluation."

- [ ] One fixture, one image, the real downgraded JSON Schema, cap **$0.10**.
- [ ] Confirms: the strict schema is accepted (Part 2's keyword list is right); the model takes inline images; `store: false` is accepted; what a real refusal and a real usage block look like; the **actual per-call cost**, which is what Q-P1-3's cap is then computed from.
- [ ] Measures the real tokens-per-word ratio on one genuine prompt, as the first datum for Q-P1-1.

**Verify:** a written result in `docs/PROGRESS.md` with the real numbers and the real spend. Whatever it contradicts in Parts 2 and 5 is fixed before Part 6.

### Part 6 — The CLI harness

- [ ] `src/p1-generate.ts`, compiled — `nest build && node dist/p1-generate.js` (tsx exits silently on decorator metadata; learned in P0). A `p1:generate` script is added to `package.json`.
- [ ] `pnpm p1:generate --product fixtures/<name> --model <id> --target flow-veo-3.1 --max-spend-usd <n>`
- [ ] Photos are downsized and stripped of metadata with sharp before the model sees them (spec §7).
- [ ] Output: a markdown report per run — prompt, Uzbek shot plan, every validator result, usage, cost, and provenance **read from the trusted envelope**. Reports are written to a **git-ignored `out/`**: they contain the full brief and the full prompt.
- [ ] Refuses to run without `--max-spend-usd`.
- [ ] Tests: argument parsing; a missing cap refuses; a missing brief refuses; the report renders from a fake result.

**Verify:** the CLI runs end to end against the fake provider and writes a real report.

### Part 7 — The seven safety fixtures

Source 01 §49, plus the gallery case the first draft asserted without providing a fixture for.

- [ ] `fixtures/` — unbranded bottle · cleaner with one label · formal shoe from one side · logo-bearing garment · appliance with unreadable spec text · conflicting variants · **image containing prompt-injection text**.
- [ ] **Plus a gallery-inspiration case:** one fixture is given a deliberately unsuitable gallery example (perfume cinematography offered for a cleaning product). Source 01 §25 devotes a whole block to this and the first draft had no fixture that could exercise it. Asserts both "does not copy gallery product identity" and "adapts or discards the unsuitable style".
- [ ] Photos are **shot by Doston or Jakhongir, not scraped** (source 01: keep evaluation fixtures private), and run through sharp metadata-stripping *before* being committed — R-6 strips metadata at upload, which is after these are already in git.
- [ ] Record each provider response once and replay the recordings in CI. **No live AI calls in CI** (spec §11).
- [ ] **The recorder writes an allowlist** — id, model, created, usage, the structured output — and never a raw error object or the request. A serialized SDK error can carry the `Authorization` header; response headers carry account identifiers; a recorded request carries base64 product photos.
- [ ] A CI test greps `fixtures/**` for `sk-`, `Bearer`, `Authorization`, `org-`.
- [ ] All six §49 verifications, including **"clothing/talent adapts to category"**, which the first draft dropped — the formal-shoe-in-gym-styling failure.
- [ ] **A template-leak check:** generate two unrelated fixtures and diff their `promptEn`; high n-gram overlap means the template leaked through. Source 02's first quality-bar question — "could this have been written without seeing the product?" — is the product's stated differentiator, and nothing else measures it.
- [ ] The §51 hard-fail rubric encoded as assertions where machine-checkable, and as a written checklist where it needs a human eye.

**Verify:** `pnpm test` replays every fixture offline and passes.

### Part 8a — The offline sweep

- [ ] Matrix, defined before the cap is set: **6 configs** (word count 300 / 500 / 700 at the baseline beat count, then beats 2 / 3 / 4 at the baseline word count) **× 7 fixtures = 42 runs**, up to 84 billed calls with repairs.
- [ ] Cap computed from Part 5b's measured per-call cost × 84, with headroom. Passed explicitly; the CLI refuses without it.
- [ ] Results table: product, category, model, prompt version, **target config version**, word count, measured tokens-per-word, validator pass, **§51 rubric score** (the nine criteria at source 01 §51), cost.
- [ ] Tokens-per-word p95 across the corpus sets `maxWords` (Q-P1-1).
- [ ] **No conclusions about video quality here.** Word count and validator pass cannot tell you whether 300 or 700 words makes a better video. This part produces candidate prompts; 8b judges them.

**Verify:** the table in `docs/PROGRESS.md` with real numbers, and the cap never exceeded.

### Part 8b — The Flow pilot that picks the config

- [ ] Jakhongir generates **3 configs × 3 products = 9 videos** in Flow and judges them.
- [ ] The winning length and beat default are set in the target config and the provisional marks removed.
- [ ] The provider and model pick recorded as a decision (D-029, as amended by D-043), using D-029's stated criterion: prompt quality by the §51 rubric first, then **cost per successful package** — cost divided by the packages that cleared the rubric, not by all of them.

**Verify:** the nine results recorded, and a settled config.

### Part 9 — Jakhongir's go/no-go

- [ ] ~10 real products at the settled config, plus a one-page Flow instruction sheet.
- [ ] He judges each: shape, colours and labels intact; nothing invented; postable without heavy editing (D-019).
- [ ] Every run recorded in `docs/PROGRESS.md`: product, category, prompt version, Flow mode, usable yes/no, what went wrong.
- [ ] **≥6 usable → go.** Below 6 → fix and re-test, at most twice, then decide together.

**Verify:** the recorded results and a written go or no-go.

---

## Testing

| Layer | How |
|---|---|
| Config, contract, validators, prompt assembly | Vitest, pure functions, no I/O |
| Provider orchestration, repair, error mapping, spend cap | Vitest against `FakeProvider`, with a `fetch` guard that throws on any provider host |
| Fixture safety (source 01 §49) | Recorded responses replayed through the validators. **Never live in CI.** |
| Live quality | The CLI only, by hand, under a cap. Results into `docs/PROGRESS.md` |

## Risks

| Risk | Handling |
|---|---|
| Prompts good, Flow videos not | Exactly what the go/no-go is for. Two fix rounds, then an honest decision including stopping (D-019). |
| Flow's real limits differ from our config | Part 0 confirms them with Jakhongir before anything is built. |
| Flow's paste box truncates a 700-word prompt | Part 0 tests it. The whole length premise depends on it. |
| Jakhongir's Google credits run out | Part 0 counts the ~20–40 generations first. They are his credits; the app never touches them. |
| Live costs run away | Pre-call cap from a measured per-call cost, refuses to start without one. |
| One-provider comparison | Recorded as one provider, not dressed up as three (D-043). |
| `maxWords` is a proxy for a tokenizer we can't call | Named for what it measures, set from a measured p95, origin documented (Q-P1-1). |
| Fixture recordings leak keys or photos | Allowlist recorder, a CI secret grep, metadata stripped before commit. |

## Code style

Self-explaining names and structure. Comments only where the code cannot say the why — a decision reference, or a trap a plausible alternative would fall into. No comment that restates the line beneath it.
