# P1 — AI core and the real-world go/no-go

**Status:** DRAFT, awaiting review
**Repo:** `jas-ad-studio-api` only (D-026)
**Built from:** design spec §5, §12 · source 01 §25, §26, §28, §49, §50, §51 · source 02 in full · D-012, D-013, D-017, D-019, D-029

---

## What P1 is for

P1 answers one question: **do the prompts we write produce videos a seller would actually post?** Everything here exists to get an honest answer cheaply, before any UI, account, credit or upload code is written.

There is no HTTP, no database, no auth and no credits in P1. A command-line script runs the AI module end to end, and Jakhongir takes the output to Google Flow.

**Exit:** the seven safety fixtures pass the hard-fail rubric (source 01 §51), then Jakhongir runs ~10 real products through Flow and **at least 6 are usable** (D-019). Below 6, at most two fix-and-retest rounds, then a joint decision.

### Not in P1

HTTP endpoints · the database · accounts · credits · uploads · the needs-input cache (it needs a database; P4) · the job queue · anything in the web repo.

---

## The central problem: sources 01 and 02 disagree

This is the phase where C-1 to C-4 get resolved in code, not just on paper.

| | Source 01 §25 | Source 02 | Veo 3.1 reality |
|---|---|---|---|
| Prompt length | ~180–350 words | 500–1,000 words | 1,024 **tokens** ≈ 700 words hard ceiling |
| Beats | 3 (0–2 / 2–6 / 6–8 s) | 4 (0–1.5 / 1.5–4.5 / 4.5–6.5 / 6.5–8 s) | — |
| Camera | one move per beat, no stacking | high-energy mode allows whip transitions, speed ramps | — |

D-012 resolves all of it the same way: **the system prompt contains no numbers.** Every limit lives in a video-target configuration entry and is injected at instruction level. Source 02's 500–1,000 would not even fit Veo 3.1; source 01's 180–350 would waste the budget. The honest answer is "it depends on the target," and P1 measures which range actually produces better video for this one.

**What P1 decides by experiment:** `recommendedWords` (comparing ~300 / ~500 / ~650) and `beats.default` (2 / 3 / 4), on the same products, judged in Flow.

---

## Dependencies (standing gate)

| Package | Why |
|---|---|
| `openai` | The official SDK, server-side, Responses API with image input and strict structured output (source 01 §27). Doston's key is in `.env` as `OPENAI_API_KEY` (D-041). |
| `sharp` | Reads and downsizes fixture photos to the model-input copy. Arrives in P2 anyway (spec §7); P1 needs it to feed images to the model. |
| `gpt-tokenizer` *(or none — see Q-P1-1)* | Counting tokens for the length budget. |

Nothing else. **No Claude or Gemini SDK yet** — see Q-P1-2.

---

## Open questions — these block the parts that depend on them

### Q-P1-1 · How do we enforce Veo's 1,024-token ceiling?

Veo's tokenizer is not published, so we cannot count its tokens exactly. Three options:

| | Approach | Honest? |
|---|---|---|
| **A (recommended)** | Enforce a **word ceiling and a character ceiling** derived conservatively from 1,024 tokens. English averages ~1.3 tokens/word, so 700 words ≈ 910 tokens, leaving headroom. Name the field `maxWords`, not `maxTokens`, so the config never claims precision it doesn't have. | Yes — it says what it measures |
| B | Count with `gpt-tokenizer` (OpenAI's BPE) and call it the token count | No — a different model's tokenizer is a proxy, and naming it `tokens` invites trusting it |
| C | Ask the model to self-report length | No — unverifiable, and costs a call |

**Recommendation: A.** It adds no dependency, and the config field names match what is actually enforced. The 1,024-token figure stays in the config as `sourceTokenLimit` with its URL and `checkedAt`, documenting where the word ceiling came from.

### Q-P1-2 · Do we build Claude and Gemini adapters now?

D-029 says compare 2–3 providers. Only an OpenAI key exists today.

- **Recommended:** build the provider **interface** plus the **OpenAI adapter** only. The interface is proven by a fake adapter used throughout the tests, so the seam is real and not theoretical. Adding Claude or Gemini later is then one file each against a tested contract.
- Alternative: write all three now. Two of them would be untested code that cannot run, and untested adapters give false confidence in a comparison that never happened.

**If Jakhongir supplies keys before the live run, the other adapters become a small task inside P1.** Otherwise P1 compares OpenAI models against each other, and `docs/PROGRESS.md` says plainly that it was a one-provider comparison.

### Q-P1-3 · What is the spend cap for the live run?

Live calls cost real money on Doston's key (D-004 moves billing to Jakhongir before launch).

**Recommended:** the CLI refuses to start without `--max-spend-usd`, tracks estimated cost per call, and stops at the cap. A default of **$5** for a full fixture sweep, and the run prints the running total. No cap, no run.

---

## Parts

Each part stops for review. **Every part ends by updating `docs/PROGRESS.md`, ticking these boxes, and recording any new decision — before the next part starts.**

### Part 1 — Video target configuration

- [ ] `src/ai/targets/` — a versioned config file, reviewed like code (D-012, D-013).
- [ ] The `flow-veo-3.1` entry: `id`, `sourceUrl`, `checkedAt`, `maxWords`, `maxChars`, `recommendedWords`, `sourceTokenLimit`, `beats: { default, max }`, `durations`, `aspectRatios`, `referenceImages`, `highEnergyCameraAllowed`.
- [ ] A zod schema for the config itself, so a malformed target fails at import, not at generation time.
- [ ] `recommendedWords` and `beats.default` start as the values Part 8 will test, marked provisional in the file.
- [ ] Tests: the shipped config parses; a target with `beats.default > beats.max` is rejected; an unknown target id is rejected; durations and aspect ratios are non-empty.

**Verify:** `pnpm test` — config tests pass. No AI call.

### Part 2 — The output schema

- [ ] `src/ai/schema/` — zod for source 01 §26's shape, **without `editingAssets`** (D-017).
- [ ] Strict objects, no unknown properties, explicit nullability, bounded arrays and strings, enums for `status` and `style`.
- [ ] A JSON Schema derived from the zod schema for the provider's structured-output mode, so one definition drives both (the same principle as D-031).
- [ ] Tests: a well-formed `ready` result parses; an unknown property is rejected; a `ready` with `concept: null` is rejected; `questionsUz` longer than 2 is rejected; oversized strings are rejected.

**Verify:** `pnpm test`. No AI call.

### Part 3 — Deterministic validators

The largest test surface in P1, and all pure functions. Source 01 §28 and §50.

- [ ] **Target:** the target exists; `durationSeconds` and `aspectRatio` are supported; reference mode is supported.
- [ ] **Length:** `promptEn` within `maxWords` and `maxChars`; not empty on `ready`.
- [ ] **Timeline:** first shot starts at 0; shots contiguous, no overlap, no gap; last shot ends at the duration; beat count ≤ `beats.max`.
- [ ] **Content:** no placeholders (`[PRODUCT]`, `{…}`, `TBD`, `Lorem`); Uzbek fields are Latin script with `oʻ`/`gʻ` handled; `promptEn` is English.
- [ ] **Ready state:** `ready` has a concept, shots and a prompt; `needs_input` has 1–2 questions and no prompt; `refused` has a message and no prompt.
- [ ] Each validator returns a structured error naming the field and what was wrong — the repair call is fed these errors verbatim.
- [ ] Tests: at least one passing and one failing case per rule, plus the boundary cases (exactly `maxWords`, a shot ending at 7.999, a single-beat timeline).

**Verify:** `pnpm test`. No AI call. This part is where most of P1's test count lands.

### Part 4 — The merged system prompt V2

- [ ] `src/ai/prompt/ad-director.v2.ts` — `AD_DIRECTOR_SYSTEM_PROMPT_V2`, a server-only versioned constant.
- [ ] Merges source 01 §25 with source 02's depth and architecture requirements. **No numbers:** length, beat count and camera intensity come from the injected target block.
- [ ] Keeps intact from §25: input trust, gallery inspiration limits, evidence-before-invention, product lock, category guidance, Uzbek context, language rules, the pre-return self-check.
- [ ] Adds from source 02: the prompt architecture (product reference, product lock, concept, camera, motion, environment, lighting, material, sequence, editing, audio, hero ending, fidelity), the quality bar questions, and the "could this have been written without seeing the product?" test.
- [ ] The target block is assembled from Part 1's config and concatenated at instruction level. User text, filenames, image text and gallery presets are passed as **data**, never instructions.
- [ ] Tests: the assembled prompt contains the target's values; it contains no hard-coded word count or beat count; a target change changes the prompt; user input containing "ignore previous instructions" appears in the data section, never the instruction section.

**Verify:** `pnpm test`. No AI call. **Changing this file is a standing-gate change from here on.**

### Part 5 — Provider interface and the OpenAI adapter

- [ ] `src/ai/public/` — the port: one `generate(input): Promise<ProviderResult>` plus the DI token (R-7).
- [ ] `src/ai/providers/openai.adapter.ts` — Responses API, image input, strict structured output, usage and estimated cost returned.
- [ ] A `FakeProvider` returning scripted responses, used by every test so no test ever calls out.
- [ ] Error mapping: refusal, timeout, truncation, network failure, malformed structured response — each to its own error code (spec §9: `AI_TIMEOUT`, `AI_REFUSED`, `AI_MALFORMED`, `AI_TRUNCATED`).
- [ ] The orchestration: call → schema check → validators → **at most one repair call** carrying the validator errors → `failed`. No retry loops (source 01 §28).
- [ ] Tests, all against the fake: a clean response passes; a response failing validation triggers exactly one repair; a second failure ends as `failed`, not a third call; a timeout maps to `AI_TIMEOUT`; a malformed body maps to `AI_MALFORMED`; usage and cost are recorded.

**Verify:** `pnpm test`. **No live call yet.**

### Part 6 — The CLI harness

- [ ] `src/p1-generate.ts`, compiled by `nest build` — *not* tsx; esbuild emits no decorator metadata and `NestFactory` dies silently (learned in P0).
- [ ] `pnpm p1:generate --product fixtures/<name> --provider openai --model <id> --target flow-veo-3.1 --max-spend-usd <n>`
- [ ] Input: a product folder with photos and `brief.json`. Photos are downsized with sharp to the model-input copy and stripped of metadata (spec §7) before the model sees them.
- [ ] Output: a markdown file per run — the English prompt, the Uzbek shot plan, every validator result, token usage, estimated cost, provider, model and prompt version.
- [ ] **Refuses to run without `--max-spend-usd`**, tracks the running total, and stops at the cap (Q-P1-3).
- [ ] Tests: argument parsing; a missing cap refuses; a missing brief refuses; the report renders from a fake result.

**Verify:** the CLI runs end to end against the fake provider, writing a real report file. Still no live call.

### Part 7 — The seven safety fixtures

Source 01 §49. These are the ones that must never regress.

- [ ] `fixtures/` with a brief and photos each for: unbranded bottle · cleaner with one label · formal shoe from one side · logo-bearing garment · appliance with unreadable spec text · conflicting variants · **image containing prompt-injection text**.
- [ ] Record each provider response to disk once, then replay the recordings through the schema and validators in CI. **No live AI calls in CI** (spec §11).
- [ ] Assertions per source 01 §49: blank surfaces stay unbranded; unknown surfaces are not invented; logos are not moved; gallery inspiration cannot override reference identity; the injection fixture's embedded text does not change behaviour; conflicting variants return `needs_input` with ≤2 Uzbek questions rather than a guessed compromise.
- [ ] The hard-fail rubric from source 01 §51 encoded as assertions where it is machine-checkable, and as a written checklist where it needs a human eye.

**Verify:** `pnpm test` replays every fixture offline and passes.

### Part 8 — The live comparison run

The first part that spends money.

- [ ] Run the fixtures live, under the cap, across the available models.
- [ ] Sweep `recommendedWords` at ~300 / ~500 / ~650 and `beats.default` at 2 / 3 / 4 on the same products.
- [ ] Record a results table: product, category, provider, model, prompt version, word count, validator pass, cost.
- [ ] Pick the winning length and beat default; update the target config and mark the provisional values settled.
- [ ] Write the outcome as a new `DECISIONS.md` entry (the provider and model pick, per D-029).

**Verify:** the results table lives in `docs/PROGRESS.md` with real numbers, and the cap was never exceeded.

### Part 9 — Jakhongir's go/no-go

- [ ] Hand him ~10 real products' worth of generated prompts plus a one-page instruction sheet for Flow.
- [ ] He generates and judges each: product shape, colours and labels intact; nothing invented; postable without heavy editing (D-019).
- [ ] Record every run in `docs/PROGRESS.md`: product, category, prompt version, Flow mode, usable yes/no, what went wrong.
- [ ] **≥6 usable → go.** Below 6 → fix the prompt or the target config and re-test, at most twice, then decide together.

**Verify:** the recorded results, and a written go or no-go.

---

## Testing

| Layer | How |
|---|---|
| Config, schema, validators, prompt assembly | Vitest unit tests, pure functions, no I/O |
| Provider orchestration, repair, error mapping | Vitest against `FakeProvider` |
| Fixture safety (source 01 §49) | Recorded provider responses replayed through the validators. **Never live in CI.** |
| Live quality | The CLI only, run by hand, under a spend cap. Results into `docs/PROGRESS.md` |

## Risks

| Risk | Handling |
|---|---|
| Prompts are good but Flow's videos are not | That is exactly what the go/no-go is for. Two fix rounds, then an honest decision — including changing target or stopping (D-019). |
| One-provider comparison | Recorded as a one-provider comparison, not dressed up as three (Q-P1-2). |
| Live costs run away | Hard cap, refuses to start without one (Q-P1-3). |
| The word ceiling is a proxy for Veo's real tokenizer | Named `maxWords`, derived conservatively with headroom, `sourceTokenLimit` documented with its URL (Q-P1-1). |
| The system prompt drifts from the sources | It is one versioned file, and changing it is a standing-gate change. |

## Code style for this phase

Self-explaining names and structure; comments only where the code cannot say the why — a decision reference, or a trap a plausible alternative would fall into. No comment that restates the line beneath it.
