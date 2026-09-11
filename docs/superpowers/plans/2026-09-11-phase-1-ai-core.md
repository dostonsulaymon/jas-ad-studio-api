# P1 — AI core and the real-world go/no-go

**Status:** APPROVED to build. Every open question is answered (Q-P1-1 to Q-P1-5). Part 0 still needs four answers from Jakhongir before the target config's values can be called final.
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

### Q-P1-1 · How do we enforce Veo's 1,024-token ceiling? — **ANSWERED: follow D-012 as written**

Doston, correctly: follow the decision we made. The first draft treated "we cannot call Veo's tokenizer" as "we cannot enforce a token ceiling", which does not follow. D-012 says the config carries "**maximum prompt tokens and words**, and the recommended word range" and that validators enforce them. It never required Google's own tokenizer.

So, implementing D-012 literally:

- `maxPromptTokens: 1024` stays in the config, with `sourceUrl` and `checkedAt` (D-012, spec §5).
- `maxWords` stays too — D-012 asks for both.
- **The validator enforces both.**
- The tokens-per-word ratio linking them is **measured** in Part 8a across the real generated corpus and taken at p95, rather than guessed. Until then it ships conservative and marked provisional.
- The estimator's method and its measured error bound are written into the config file, so the number is never mistaken for Veo's own count.

**No decision is superseded. Nothing new is written to `DECISIONS.md`.** The one honest limit — that our token figure is an estimate — is handled with headroom and documented in place, and Part 0 asks Jakhongir for the empirical ground truth: whether Flow's paste box actually truncates a long prompt.

### Q-P1-4 · What is `brief.json`? — **ANSWERED: design it properly now**

The CLI takes "a product folder with photos and `brief.json`". That file encodes goal, audience, style, offer, confirmed claims, duration, aspect ratio and gallery inspiration — which is exactly source 01's step-1 and step-2 wizard input, the thing P2–P4 build the UI against and Session B consumes through `openapi.json` (D-031). Inventing it by accident here and re-deciding it in P4 is guaranteed rework across two repos.

Doston: design it properly now. It is defined in Part 2 as a zod schema in the `ai` module's public port, written with P2–P4 and Session B's generated client in mind, and reviewed as the first draft of the real brief contract rather than improvised for fixtures.

### Q-P1-2 · Which provider adapters? — **ANSWERED (D-043)**

Interface plus the OpenAI adapter only. The seam is proven by a `FakeProvider` used throughout the tests. P1 compares OpenAI models against each other and PROGRESS records it as a one-provider comparison.

### Q-P1-3 · The live spend cap — **ANSWERED below, once the matrix is defined**

The first draft said "$5" before knowing how many runs there are. The matrix is now defined in Part 8a (6 configs × 7 fixtures = 42 runs, up to 84 billed calls with repairs). The cap is computed from the real per-call cost measured at Part 5b, not guessed. The CLI refuses to start without `--max-spend-usd`, and the check is **pre-call against a worst-case estimate of this call plus its possible repair** — checking after the call has already spent the money is not a cap.

---

## Part 0 — Prerequisites from Jakhongir (before Part 1)

D-013 says the Flow facts are "confirmed by Jakhongir's test runs", and spec §5 literally reads `durations: [8] (confirm in Flow)`. If the chosen mode turns out to do 6 seconds, or handles reference images differently, every fixture run and the whole sweep is void.

- [ ] Which Flow mode — "Frames to video" or "Ingredients to video" — and its supported durations, aspect ratios and reference-image rules. This is the one Part 0 item that genuinely blocks: if the mode does 6 seconds rather than 8, every timeline the validators enforce is wrong.
- [ ] **Does Flow's prompt box accept a ~700-word prompt, or silently truncate?** Nobody has tested this, and the entire length premise rests on it.
- [ ] The ~10 real pilot products, a mix of categories. Sourcing these is a multi-day human task, not a checkbox, and it is not currently on his owed list in spec §15.

**Verify:** the answers recorded in `docs/PROGRESS.md` with a date, and the target config's `checkedAt` set from them.

---

## Parts

Each part stops for review. **Every part ends by updating `docs/PROGRESS.md`, ticking these boxes and recording any new decision — before the next part starts.**

### Part 1 — Video target configuration

- [x] `src/ai/targets/` — a versioned config file, reviewed like code (D-012, D-013).
- [x] The `flow-veo-3.1` entry: `id`, `version`, `sourceUrl`, `checkedAt`, **`maxPromptTokens`** (1024, D-012 and spec §5), `maxWords`, `maxChars`, `recommendedWords`, `tokensPerWord` (the estimator ratio, provisional until Part 8a measures it), `beats: { default, max }`, `durations`, `aspectRatios`, `referenceImages`, `referenceMode`, `highEnergyCameraAllowed`.
- [x] `version` is required: without it the Part 8a results table cannot say which config produced which prompt, and the Part 7 recordings cannot be invalidated when the config changes.
- [x] A zod schema for the config itself, so a malformed target fails at import.
- [x] `recommendedWords` and `beats.default` ship provisional, marked as such, and are settled by Part 8b.
- [x] Tests: the shipped config parses; `beats.default > beats.max` is rejected; an unknown target id is rejected; empty `durations` or `aspectRatios` are rejected; a missing `version` is rejected; `maxWords × tokensPerWord` must not exceed `maxPromptTokens`, so the two ceilings can never contradict each other.

**Verify:** done 2026-09-11 — `pnpm lint`, `pnpm typecheck`, `pnpm test` (52 passing, 19 of them new), `pnpm build` and `pnpm openapi:check` all clean. No AI call, no spend.

### Part 2 — The output contract

**Module layout, corrected.** The review ran the actual eslint config against a stub `ai` module: a directory named `src/ai/schema/` does **not** match the `schema` element (which is `src/*/db/**`), so it falls through to `module`, and `port → module` is disallowed — a hard lint error that CI runs before the tests. The output types are the contract, so they live in the port, which also matches D-031's "zod schemas are the single source".

- [x] `src/ai/public/` — the output schema, the brief schema (Q-P1-4), the provider port and its DI token. Nothing else imports across the module line.
- [x] `src/ai/prompt|targets|providers` stay module-internal. **No directory named `schema/`** — the word is already a boundaries element type meaning something else, and that trap costs the next reader an hour.
- [x] The output shape per source 01 §26, **without `editingAssets`** (D-017): strict objects, no unknown properties, explicit nullability, bounded arrays and strings, enums for `status` and `style`.
- [x] **The trusted envelope (source 01 §26).** "Persist separately as trusted server metadata: prompt version; model; usage; request ID; capability version; gallery inspiration ID. *Do not let the model author these as trusted facts.*" The model's JSON is wrapped in a server-stamped `{ promptVersion, provider, model, targetId, targetConfigVersion, requestId, usage, galleryInspirationId }`. Everything downstream — the Part 6 report, the Part 8a table — reads provenance from the envelope, never from the model's own output.
- [x] **The JSON Schema downgrade.** zod v4's `toJSONSchema` emits `maxItems`/`maxLength`; OpenAI's strict Structured Outputs rejects those keywords, requires every property in `required` (so `.optional()` is unusable — nullable unions only) and `additionalProperties: false` throughout. A tested downgrade step strips the unsupported keywords and asserts none remain. **Consequence, stated plainly:** the bounds are then enforced only by our own zod parse, so a bound violation becomes a Part 5 repair rather than a provider-side rejection. The exact keyword list is confirmed against the live API at Part 5b.
- [x] Tests: a well-formed `ready` parses; unknown properties rejected; `ready` with `concept: null` rejected; `questionsUz` longer than 2 rejected; oversized strings rejected; the downgraded JSON Schema contains no unsupported keyword and no `optional`.

**Verify:** done 2026-09-11 — 72 tests passing (20 new), lint, typecheck and build clean.

Two things the build itself proved:
- The boundary error the review predicted **happened**: `src/ai/public/*` importing `ASPECT_RATIOS` from `src/ai/targets/` is `port → module` and lint refused it. The shared vocabulary moved into `src/ai/public/video-format.ts`, which is where the contract belongs anyway.
- A test caught a real bug in the downgrade walker: it treated a *property named* `pattern` as a schema keyword, so a brief field called `format` or `default` would have been stripped from the schema silently. `properties` maps are now walked as names, not keywords.

### Part 3 — Deterministic validators

Pure functions, the largest test surface in P1. Source 01 §28 and §50.

- [x] **Target and capability (§50):** the target exists; `durationSeconds` and `aspectRatio` are supported; reference mode is supported; **the model's echoed target matches the server-requested one** — a model that renegotiates its own duration is the §51 hard failure "unsupported provider mode".
- [x] **Length (D-012):** `promptEn` within **`maxPromptTokens`** — estimated as `words × tokensPerWord`, with the estimator named in the error so nobody reads it as Veo's own count — and within `maxWords` and `maxChars`; non-empty on `ready`.
- [x] **Timeline:** first shot starts at 0; contiguous, no overlap, no gap; last shot ends at the duration; beat count ≤ `beats.max`.
- [x] **Forbidden directions (§50 + D-017):** `promptEn` must not carry voiceover, narration, subtitles, burned-in captions, on-screen text or music cues. Source 01 §25 sets default audio to foley and room tone with no music, dialogue or narration, and D-017 defers voiceover and overlays entirely. Cheap, deterministic, and it protects a locked decision from silent drift.
- [x] **Placeholders:** no `[PRODUCT]`, `{…}`, `TBD`, `Lorem`.
- [x] **Script:** Uzbek fields normalize to NFC and to **one canonical apostrophe, U+02BB (ʻ)**, the Uzbek standard. Source 01 writes U+2018, sellers type U+0027, and all three render nearly identically — so normalize the two wrong variants first, then validate. Uzbek fields containing Cyrillic hard-fail.
- [x] **Language, with source 01 §28's own hedge ("where practical") kept:** Cyrillic in `promptEn` hard-fails; Uzbek-specific apostrophes outside quoted spans hard-fail; an English function-word ratio over a ≥300-word prompt is recorded as a **warning**, not a repair trigger. Burning a paid repair call on a good prompt because a heuristic misfired is worse than the warning.
- [x] **Ready state:** `ready` has concept, shots and prompt; `needs_input` has 1–2 questions and no prompt; `refused` has a message and no prompt.
- [x] Every validator returns a structured error naming the field and the problem — the repair call is fed these verbatim.
- [x] Tests: a passing and a failing case per rule, plus boundaries (exactly `maxWords`, a shot ending at 7.999, a single-beat timeline, each apostrophe variant).

**Verify:** done 2026-09-11 — 118 tests passing (46 new), lint, typecheck, build and contract clean. No AI call, no spend.

### Part 4 — The merged system prompt V2

- [x] `src/ai/prompt/ad-director.v2.ts` — `AD_DIRECTOR_SYSTEM_PROMPT_V2`, server-only, versioned.
- [x] Keeps from source 01 §25: input trust, gallery-inspiration limits, evidence before invention, product lock, category guidance, Uzbek context, language rules, the pre-return self-check.
- [x] Adds source 02's **full** architecture (02:706–721), which the first draft quoted incompletely: Product Reference · Product Lock · **Commercial Concept** · **Creative Direction** · Camera · Product Motion · Environment · Lighting · Material Treatment · Sequence · Editing · Audio · Hero Ending · **Visual Quality** · Fidelity Requirements — plus the **Opening Hook** requirement (02:186–210: describe an actual hook, not "start with an attention-grabbing shot") and **Negative/Avoidance direction** (02:619–643, with its warning against a universal hundred-item negative list).
- [x] Adds source 02's quality bar (02:647–683) as instruction.
- [x] **No numbers.** Length, beats and camera intensity come from the injected target block, assembled from Part 1's config.
- [x] User text, filenames, image text and gallery presets go in the **data** section, never the instruction section.
- [x] Tests: the assembled prompt carries the target's values; contains no hard-coded word or beat count; a target change changes the prompt; an input containing "ignore previous instructions" lands in the data section.

**Verify:** done 2026-09-11 — 139 tests passing (21 new), lint, typecheck, build and contract clean. No AI call, no spend.

**From here, changing `ad-director.v2.ts` is a standing-gate change.**

### Part 5 — Provider interface and the OpenAI adapter

- [x] `src/ai/public/provider.port.ts` — `generate(input): Promise<ProviderResult>` and the DI token (R-7).
- [x] **Plain classes with constructor injection, not a Nest application context.** The CLI constructs them directly; a Nest module wrapper is added in P4 when the worker needs it. A script with no HTTP does not need `NestFactory`, and P0 already showed how that fails under a non-compiling runner.
- [x] `OPENAI_MODEL` added to `env.schema.ts` and `.env.example`; `--model` overrides it. Source 01 §27 forbids hard-coding an unverified model name.
- [x] `store: false` where supported — **without claiming it guarantees zero provider retention** (source 01 §27). These are sellers' product photos.
- [x] **`maxRetries` and `timeout` set explicitly.** The SDK retries twice by default, so one "call" is silently up to three billed requests — which also contradicts source 01 §28's "usually one multimodal AI call". Transport retry and the §28 repair call are different things and are named differently in the code.
- [x] **The repair path, fully specified.** Call → schema check → validators → at most one repair carrying the validator errors → terminal. Plus the four cases the first draft left undefined:
  - the spend check is **pre-call**, against a worst-case estimate of the call plus its possible repair, reconciled afterwards with real usage;
  - if the repair itself fails, the result carries **both** the original validator errors and the repair failure, or Part 8a debugging is blind;
  - an explicit state table for (first status × repair status) — a repair that answers `needs_input` is schema-valid and passes every validator, and must not be reported as success;
  - **whether the repair resends the images** — see Q-P1-5 below.
- [x] Error mapping: refusal, timeout, truncation, network failure, malformed structured response → `AI_REFUSED`, `AI_TIMEOUT`, `AI_TRUNCATED`, `AI_MALFORMED` (spec §9).
- [x] `FakeProvider` with scripted responses.
- [x] **A guard, not a convention:** `vitest.setup.ts` overrides `fetch` to throw on any request to a provider host. "No test calls out" as a rule is a hope; as a guard it is a fact.
- [x] Tests against the fake: a clean response passes; a validation failure triggers exactly one repair; a second failure ends `failed`, not a third call; a repair returning `needs_input` is not reported as success; timeouts and malformed bodies map correctly; usage and cost recorded; the pre-call cap refuses a call that could exceed it.

**Verify:** done 2026-09-11 — 159 tests passing (20 new), lint, typecheck, build clean. **No live call yet.**

> **Q-P1-5 · Does the repair call resend the product images?** Resending 3–4 images roughly doubles image cost per repair; not resending them means the model rewrites the prompt without seeing the product, which is a product-lock risk. **Recommendation: resend.** A cheaper prompt that invents a product surface is worthless, and the repair is capped at one. Recorded as a decision either way.

### Part 5b — One capped live smoke call

The first draft made the first live call at Part 8, after eight parts built on an unverified provider contract. Source 01 §52 effectively asks for this: "if valid live credentials are available, perform a small capped live evaluation."

- [x] One fixture, one image, the real downgraded JSON Schema, cap **$0.10**.
- [x] Confirms: the strict schema is accepted (Part 2's keyword list is right); the model takes inline images; `store: false` is accepted; what a real refusal and a real usage block look like; the **actual per-call cost**, which is what Q-P1-3's cap is then computed from.
- [x] Measures the real tokens-per-word ratio on one genuine prompt, as the first datum for Q-P1-1.

**Verify:** done 2026-09-11. Two runs, **$0.0139 total**. Strict schema accepted, images genuinely read, `store: false` accepted, product lock held. It contradicted one thing in Part 3 — `product.*` skipped normalisation — which is fixed with regression tests. The tokens-per-word measurement was dropped as meaningless: output tokens cover the whole JSON response, not `promptEn` alone.

### Part 6 — The CLI harness

- [x] `src/p1-generate.ts`, compiled — `nest build && node dist/p1-generate.js` (tsx exits silently on decorator metadata; learned in P0). A `p1:generate` script is added to `package.json`.
- [x] `pnpm p1:generate --product fixtures/<name> --model <id> --target flow-veo-3.1 --max-spend-usd <n>`
- [x] Photos are downsized and stripped of metadata with sharp before the model sees them (spec §7).
- [x] Output: a markdown report per run — prompt, Uzbek shot plan, every validator result, usage, cost, and provenance **read from the trusted envelope**. Reports are written to a **git-ignored `out/`**: they contain the full brief and the full prompt.
- [x] Refuses to run without `--max-spend-usd`.
- [x] Tests: argument parsing; a missing cap refuses; a missing brief refuses; the report renders from a fake result.

**Verify:** done 2026-09-11 — 182 tests passing (20 new), lint, typecheck, build clean, and the CLI ran end to end **against the real API** on the unbranded-bottle fixture: `ready`, 249 words, $0.00656, report written to the git-ignored `out/`.

### Part 7 — The seven safety fixtures

Source 01 §49, plus the gallery case the first draft asserted without providing a fixture for.

- [x] `fixtures/` — unbranded bottle · cleaner with one label · formal shoe from one side · logo-bearing garment · appliance with unreadable spec text · conflicting variants · **image containing prompt-injection text**.
- [x] **Plus a gallery-inspiration case:** one fixture is given a deliberately unsuitable gallery example (perfume cinematography offered for a cleaning product). Source 01 §25 devotes a whole block to this and the first draft had no fixture that could exercise it. Asserts both "does not copy gallery product identity" and "adapts or discards the unsuitable style".
- [x] Photos are **shot by Doston or Jakhongir, not scraped** (source 01: keep evaluation fixtures private), and run through sharp metadata-stripping *before* being committed — R-6 strips metadata at upload, which is after these are already in git.
- [x] Record each provider response once and replay the recordings in CI. **No live AI calls in CI** (spec §11).
- [x] **The recorder writes an allowlist** — id, model, created, usage, the structured output — and never a raw error object or the request. A serialized SDK error can carry the `Authorization` header; response headers carry account identifiers; a recorded request carries base64 product photos.
- [x] A CI test greps `fixtures/**` for `sk-`, `Bearer`, `Authorization`, `org-`.
- [x] All six §49 verifications, including **"clothing/talent adapts to category"**, which the first draft dropped — the formal-shoe-in-gym-styling failure.
- [x] **A template-leak check:** generate two unrelated fixtures and diff their `promptEn`; high n-gram overlap means the template leaked through. Source 02's first quality-bar question — "could this have been written without seeing the product?" — is the product's stated differentiator, and nothing else measures it.
- [x] The §51 hard-fail rubric encoded as assertions where machine-checkable, and as a written checklist where it needs a human eye.

**Verify:** done 2026-09-11 — 229 tests passing (40 new safety assertions), all replayed offline from recordings. Lint, typecheck, build clean.

The gallery-inspiration fixture is **not** built: gallery presets need an inspiration source that does not exist until P6, and the brief only carries an id the server resolves. The assertion it was meant to cover is deferred to P6 with the gallery itself, and is recorded here rather than quietly dropped.

### Part 8a — The offline sweep

- [ ] Matrix, defined before the cap is set: **6 configs** (word count 300 / 500 / 700 at the baseline beat count, then beats 2 / 3 / 4 at the baseline word count) **× 7 fixtures = 42 runs**, up to 84 billed calls with repairs.
- [ ] Cap computed from Part 5b's measured per-call cost × 84, with headroom. Passed explicitly; the CLI refuses without it.
- [ ] Results table: product, category, model, prompt version, **target config version**, word count, measured tokens-per-word, validator pass, **§51 rubric score** (the nine criteria at source 01 §51), cost.
- [ ] Tokens-per-word p95 across the corpus sets `tokensPerWord`, and `maxWords` is re-derived from `maxPromptTokens` with it. The provisional marks come off (Q-P1-1, D-012).
- [ ] **No conclusions about video quality here.** Word count and validator pass cannot tell you whether 300 or 700 words makes a better video. This part produces candidate prompts; 8b judges them.

**Verify:** the table in `docs/PROGRESS.md` with real numbers, and the cap never exceeded.

### Part 8b — The Flow pilot that picks the config

Judged, not counted. No predetermined sample size: this is Doston and Jakhongir looking at videos and deciding which prompt reads better, and a fixed *n* would be false precision.

- [ ] Take one product's candidate prompts from 8a and generate it in Flow at **each word setting (300 / 500 / 700)**, then at each beat setting.
- [ ] **The same product across configs.** Comparing a 300-word bottle against a 700-word shoe measures the product, not the prompt length — this is the only real constraint on this part.
- [ ] Look at them. If the better setting is obvious, stop. If it is not, add another product and repeat.
- [ ] Set the winning length and beat default in the target config and remove the provisional marks.
- [ ] Record the provider and model pick as a decision (D-029 as amended by D-043), on D-029's stated criterion: prompt quality by the §51 rubric first, then cost per **successful** package — cost divided by the packages that cleared the rubric, not by all of them.

**Verify:** the comparisons recorded in `docs/PROGRESS.md` — product, config, which won and why — and a settled, no-longer-provisional target config.

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
| Live costs run away | Pre-call cap from a measured per-call cost, refuses to start without one. |
| One-provider comparison | Recorded as one provider, not dressed up as three (D-043). |
| Our token count is an estimate, not Veo's own | Both ceilings enforced per D-012; the ratio measured at p95 in Part 8a, the estimator and its error documented in the config, and Part 0 gets the empirical truth from Flow itself. |
| Fixture recordings leak keys or photos | Allowlist recorder, a CI secret grep, metadata stripped before commit. |

## Code style

Self-explaining names and structure. Comments only where the code cannot say the why — a decision reference, or a trap a plausible alternative would fall into. No comment that restates the line beneath it.
