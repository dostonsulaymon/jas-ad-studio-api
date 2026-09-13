# P6d — Request Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the open requests that need no product decision from Doston (R-008, R-001, R-006, R-002), write the public-tunnel setup into the docs, then run the R-007 design/QA pass and fix what is plainly broken.

**Architecture:** Small, independent fixes, one task each, each committed on `p6d-requests` in the repo it touches. R-002 is the only change that crosses repos: one new read route in the api (`GET /api/projects/{id}/generations`), then the web reopens a project onto its saved prompts with a version switcher. Nothing merges to `main` without Doston.

**Tech Stack:** NestJS 11 + zod 4 + vitest (api); Next.js 16 App Router, React 19, Tailwind v4, `node --test`, Playwright (web). **No new dependency in either repo.**

**Spec:** `docs/REQUESTS.md` (R-001, R-002, R-006, R-007, R-008), `docs/superpowers/specs/2026-09-11-jas-ad-studio-design.md` §3, §8, §9; source 01 §13, §20, §39, §48.

Written 2026-09-13 while Doston was away, on his instruction: *"plan before starting… if you have questions, store them and go on with another part."* Questions are parked in [Questions for Doston](#questions-for-doston) instead of blocking work.

## Global Constraints

- Branch `p6d-requests` in **both** repos, cut from `main` 2026-09-13. **No merge to `main` without Doston.**
- Node 24: `nvm use` before every pnpm command. pm2 is under Node 22: call it as `~/.nvm/versions/node/v22.17.1/bin/pm2`.
- **Never hand-write API types** (D-031). `pnpm api:generate` reads the api repo's **`main`**; `--from-worktree` output is for local testing and is **never committed** (W-002).
- Every visible string lives in `src/lib/i18n/uz-Latn.ts`; `oʻ`/`gʻ` are U+02BB, `ʼ` is U+02BC (`uzbek-source.test.ts` enforces it).
- Tap targets ≥ 44 px, form controls ≥ 16 px, no horizontal overflow at 360 / 390 / 1440 (`tests/layout.spec.ts`).
- Copy puts only the clean prompt on the clipboard (§48). Never imply the app makes videos.
- **Do not run `pnpm build` in the web repo**: it rewrites `.next` under the live `jas-web` dev server that serves jas.kitobnarxi.uz. Run Playwright against the dev server: `BASE_URL=http://localhost:3042 pnpm test:e2e`.
- Doston reviews the rendered site, not code: every task that changes UI ends with screenshots.

---

## File Structure

| File | Task | Responsibility |
|---|---|---|
| web `src/lib/admin-tab.ts` (+ `.test.ts`) | 1 | Parse and format the admin tab held in the URL hash |
| web `src/app/admin/page.tsx` | 1 | Read the tab from the hash on load, write it on change |
| web `src/components/studio/inspiration-chip.tsx` | 2 | The "Ilhom: …" chip, moved out of step 2 so every step shows it |
| web `src/components/studio/workbench.tsx`, `step-direction.tsx` | 2, 4 | Land on step 1 when the brief is incomplete; host the chip; version switcher |
| web `tests/gallery.spec.ts` | 2 | The inspiration test follows the new landing |
| web `src/components/support-links.tsx` | 3 | Inline SVG marks on the contact cards |
| api `src/generation/generations.repo.ts`, `generation.service.ts`, `generation.controller.ts`, `generation.dto.ts` | 4a | `GET /api/projects/{id}/generations` |
| api `src/generation.e2e.spec.ts` | 4a | Drive the new route; ownership refusal |
| web `src/lib/generation.ts` (+ test), `studio.tsx`, `workbench.tsx` | 4b | Load saved prompts on reopen, pick a version |
| web `CLAUDE.md`, api `CLAUDE.md`, api `docs/PROGRESS.md` | 5 | The public tunnel setup, for future sessions |

---

### Task 1: R-008 — `/admin` keeps its tab across a refresh

**Files:**
- Create: `jas-ad-studio-web/src/lib/admin-tab.ts`, `jas-ad-studio-web/src/lib/admin-tab.test.ts`
- Modify: `jas-ad-studio-web/src/app/admin/page.tsx:25-40,117`

**Interfaces:**
- Produces: `ADMIN_TABS`, `type AdminTab`, `tabFromHash(hash: string): AdminTab`, `hashForTab(tab: AdminTab): string`

Why a hash and not `?tab=`: `useSearchParams` forces a Suspense boundary in Next 16 for a page that is entirely client-side already, and a hash never reaches the server, so no route changes.

- [ ] **Step 1: Write the failing test** — `src/lib/admin-tab.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashForTab, tabFromHash } from './admin-tab.ts';

test('a known tab in the hash is restored', () => {
  assert.equal(tabFromHash('#hero'), 'hero');
  assert.equal(tabFromHash('#reports'), 'reports');
});

test('no hash, or an unknown one, falls back to orders', () => {
  assert.equal(tabFromHash(''), 'orders');
  assert.equal(tabFromHash('#'), 'orders');
  assert.equal(tabFromHash('#panel'), 'orders');
  assert.equal(tabFromHash('#constructor'), 'orders');
});

test('the hash written is the one read back', () => {
  assert.equal(tabFromHash(hashForTab('gallery')), 'gallery');
});
```

- [ ] **Step 2: Run it, expect FAIL** — `pnpm test` → cannot find `./admin-tab.ts`.

- [ ] **Step 3: Implement** — `src/lib/admin-tab.ts`

```ts
export const ADMIN_TABS = ['orders', 'grants', 'settings', 'gallery', 'hero', 'users', 'reports'] as const;
export type AdminTab = (typeof ADMIN_TABS)[number];

/** `#panel` is the skip link's target, so an unknown hash must never be trusted as a tab. */
export function tabFromHash(hash: string): AdminTab {
  const id = hash.replace(/^#/, '');
  return (ADMIN_TABS as readonly string[]).includes(id) ? (id as AdminTab) : 'orders';
}

export function hashForTab(tab: AdminTab): string {
  return `#${tab}`;
}
```

- [ ] **Step 4: Wire the page** — in `page.tsx`, replace the local `Tab` type with `AdminTab`, and:

```tsx
const [tab, setTab] = useState<AdminTab>('orders');

// The hash is read after mount: `window` does not exist during the server render.
useEffect(() => {
  const sync = () => setTab(tabFromHash(window.location.hash));
  sync();
  window.addEventListener('hashchange', sync);
  return () => window.removeEventListener('hashchange', sync);
}, []);

const choose = (next: AdminTab) => {
  setTab(next);
  // replaceState, not location.hash: a tab click is not a history entry worth Back.
  history.replaceState(null, '', hashForTab(next));
};
```

and `onClick={() => choose(item.id)}`.

- [ ] **Step 5: Verify** — `pnpm test`, `pnpm lint`, `pnpm typecheck`. Then by hand in Chrome as the owner: open `/admin`, pick **Bosh sahifa rasmlari**, refresh → still on that tab. Screenshot.

- [ ] **Step 6: Commit** — `fix(admin): a refresh keeps the tab the owner was on (R-008)`

---

### Task 2: R-001 — "Shu uslubdan foydalanish" never skips step 1

**Files:**
- Create: `jas-ad-studio-web/src/components/studio/inspiration-chip.tsx`
- Modify: `jas-ad-studio-web/src/components/studio/workbench.tsx:165-174,273-277`, `step-direction.tsx:44-65`
- Test: `jas-ad-studio-web/tests/gallery.spec.ts:98-114`

**Interfaces:**
- Consumes: `isStep1Complete(draft)` from `@/lib/brief`, `InspirationChoice` from `@/lib/gallery`
- Produces: `InspirationChip({ inspiration, onRemove })`

REQUESTS.md records why the first attempt was reverted: landing on step 1 is right, but the chip lived inside step 2, so the button looked broken. The chip moves to the workbench, above whichever step is showing.

- [ ] **Step 1: Update the Playwright test first** — replace the test at `tests/gallery.spec.ts:98`:

```ts
test('choosing a style with an empty brief lands on step 1, shows the choice, and clears', async ({ page }) => {
  const card = page.locator(`${GALLERY} article`).first();
  const title = (await card.getByRole('heading').textContent())?.trim() ?? '';

  await card.getByRole('button', { name: /prompti/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Shu uslubdan foydalanish' }).click();

  // Nothing is entered yet, so the seller starts where a brief starts.
  await expect(page.getByRole('button', { name: /Mahsulot/ }).first()).toHaveAttribute('aria-current', 'step');

  const chip = page.getByText(`Ilhom: ${title}`);
  await expect(chip).toBeVisible();

  const description = page.locator('textarea').first();
  if (await description.count()) expect(await description.inputValue()).toBe('');

  await page.getByRole('button', { name: 'Olib tashlash' }).click();
  await expect(chip).toBeHidden();
});
```

- [ ] **Step 2: Run it, expect FAIL** — `BASE_URL=http://localhost:3042 pnpm exec playwright test tests/gallery.spec.ts -g "lands on step 1" --project=desktop` → step 2 is current.

- [ ] **Step 3: Extract the chip** — `inspiration-chip.tsx`, the markup from `step-direction.tsx:49-64` unchanged, taking `inspiration: InspirationChoice` and `onRemove: () => void`. Delete that block from `step-direction.tsx`.

- [ ] **Step 4: Land by completeness, render the chip on every step** — in `workbench.tsx`:

```tsx
const onUseInspiration = (event: Event) => {
  const choice = (event as CustomEvent<InspirationChoice>).detail;
  setDraft((d) => ({ ...d, inspiration: choice }));
  // §13 shows the choice in step 2, but a seller with no product yet has nothing to
  // direct: send them to step 1, where the chip above the step still confirms the click.
  go(isStep1Complete(draftRef.current) ? 2 : 1);
  requestAnimationFrame(() =>
    document.getElementById('studiya-boshlash')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
  );
};
```

and inside `headingRef`'s div, before the steps:

```tsx
{draft.inspiration ? (
  <InspirationChip inspiration={draft.inspiration} onRemove={() => change({ inspiration: null })} />
) : null}
```

- [ ] **Step 5: Verify** — the Step 2 command → PASS on desktop, phone-390, phone-360. `pnpm lint`, `pnpm typecheck`, `pnpm test`. Screenshot: chip above step 1 at 390.

- [ ] **Step 6: Commit** — `fix(studio): choosing a gallery style starts at step 1 when the brief is empty (R-001)`; mark R-001 done in REQUESTS.md in the api repo's Task 5 commit.

---

### Task 3: R-006 — the contact cards get marks

**Files:** Modify `jas-ad-studio-web/src/components/support-links.tsx`

No icon library: two inline SVGs, `aria-hidden`, `currentColor`, 20 px. The Telegram mark is used for both Telegram cards; the label already says which is the bot.

- [ ] **Step 1:** add `icon: 'telegram' | 'email'` to `SupportLink`; set it at each `links.push`.
- [ ] **Step 2:** render the card as a row: icon in a 36 px `rounded-full bg-stone-2 text-primary` circle, then the existing label/handle column.

```tsx
function Mark({ icon }: { icon: 'telegram' | 'email' }) {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-stone-2 text-primary">
      {icon === 'telegram' ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
          <path d="M21.9 4.3 18.7 19.4c-.2 1-.9 1.3-1.8.8l-4.9-3.6-2.4 2.3c-.3.3-.5.5-1 .5l.3-5 9.1-8.2c.4-.4-.1-.6-.6-.2L6.2 13.1l-4.8-1.5c-1-.3-1-1 .2-1.5L20.5 2.9c.9-.3 1.6.2 1.4 1.4Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="m3 7 9 6 9-6" />
        </svg>
      )}
    </span>
  );
}
```

- [ ] **Step 3: Verify** — `BASE_URL=http://localhost:3042 pnpm exec playwright test tests/gallery.spec.ts -g "support"` and `tests/layout.spec.ts` (44 px rule) PASS; lint, typecheck. Screenshot of the footer at 360 and 1440.
- [ ] **Step 4: Commit** — `feat(footer): Telegram and mail marks on the support cards (R-006)`

---

### Task 4a (api): R-002 — a project's saved prompts can be listed

**Files:**
- Modify: `src/generation/generations.repo.ts` (add `listForProject`), `generation.service.ts` (add `listForProject`), `generation.controller.ts` (add route), `generation.dto.ts` (list DTO)
- Test: `src/generation.e2e.spec.ts`
- Regenerate: `openapi.json`

**Interfaces:**
- Produces: `GET /api/projects/{id}/generations` → `GenerationDetailDto[]`, newest first, only the signed-in user's, **404 `PROJECT_NOT_FOUND`** when the project is not theirs or is deleted (never 403 — the P2 isolation rule).
- Produces (repo): `listForProject(userId: string, projectId: string): Promise<GenerationDetail[]>`

All statuses are returned, not only `ready`: the client decides what to show, and a `needs_input` answer the seller never saw is also worth reopening. Listing is a read and costs nothing.

- [ ] **Step 1: Write the failing e2e test** — in `src/generation.e2e.spec.ts`, after the disconnect test, using the file's existing `send`, `aliceCookie`, `bobCookie`, `aliceProject` and the `exercised` set the coverage guard reads:

```ts
describe('a project lists its generations', () => {
  it('returns every package the seller has made for it, newest first', async () => {
    const first = await generateReady(aliceProject);   // helper already used above for a ready job
    const second = await generateReady(aliceProject);

    const response = await send(`/api/projects/${aliceProject}/generations`, { cookie: aliceCookie });
    expect(response.status).toBe(200);
    const list = await json<{ id: string; package: { promptEn: string } | null }[]>(response);

    expect(list.map((g) => g.id)).toEqual([second, first]);
    expect(list.every((g) => g.package?.promptEn)).toBe(true);
  });

  it('is a 404, never a 403, for someone else\'s project', async () => {
    const response = await send(`/api/projects/${aliceProject}/generations`, { cookie: bobCookie });
    expect(response.status).toBe(404);
  });
});
```

If the file has no `generateReady` helper, write one from the existing ready-path test in the same file (start → run the worker once → return the id); do not stub the repo.

- [ ] **Step 2: Run, expect FAIL** — `pnpm vitest run src/generation.e2e.spec.ts` → 404 on the new path, and the coverage guard names `GET /api/projects/{id}/generations` once the route exists.

- [ ] **Step 3: Repo** — the `findOwned` query without `g.id = $2`, filtered by project, ordered `g.created_at DESC, g.id DESC`; map each row through the same package-building code as `findOwned` (extract it to one private `toDetail(row)` so the two cannot drift).

- [ ] **Step 4: Service** — check ownership through the projects port the `request()` path already uses (`getOwned`, which throws `ProjectNotFoundError`), then `repo.listForProject`.

- [ ] **Step 5: Controller + DTO**

```ts
@Get('projects/:id/generations')
@ApiOperation({ summary: "A project's generations, newest first, with packages where ready. 404 if not yours." })
@ApiOkResponse({ type: GenerationDetailDto, isArray: true })
list(@User() user: CurrentUser, @Param('id') projectId: string): Promise<GenerationDetail[]> {
  return this.generations.listForProject(user.id, projectId);
}
```

- [ ] **Step 6: Verify** — `pnpm openapi:generate && pnpm openapi:check`; the e2e file PASS including `endpoint coverage`; full gate: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Restart `jas-api`.
- [ ] **Step 7: Commit** — `feat(generation): list a project's generations so a saved prompt can be reopened (R-002)`

---

### Task 4b (web): R-002 — reopening a project shows its prompts

**Blocked for commit until Task 4a is merged to the api repo's `main`** (see Global Constraints). Build and verify against `pnpm api:generate --from-worktree`; leave the web change **uncommitted** and say so.

**Files:**
- Modify: `src/lib/generation.ts` (+ `generation.test.ts`), `src/components/studio/studio.tsx` (`onReopen`, after `generate`), `src/components/studio/workbench.tsx` (step-3 switcher), `src/lib/i18n/uz-Latn.ts`

**Interfaces:**
- Produces: `readyVersions(list: GenerationDetailDto[]): GenerationDetailDto[]` — only `ready` with a package, **oldest first**, so "Versiya 1" is the first one made and numbers never shift when a new one arrives.

- [ ] **Step 1: Failing unit test** — `generation.test.ts`

```ts
test('versions are the ready packages, numbered from the first one made', () => {
  const g = (id: string, status: JobStatus, createdAt: string, pkg = true) =>
    ({ ...DETAIL, id, status, createdAt, package: pkg ? PKG : null }) as GenerationDetailDto;
  const list = [g('c', 'ready', '2026-09-13T03:00:00Z'), g('b', 'failed', '2026-09-13T02:00:00Z', false), g('a', 'ready', '2026-09-13T01:00:00Z')];
  assert.deepEqual(readyVersions(list).map((v) => v.id), ['a', 'c']);
});
```

(`DETAIL`/`PKG`: minimal objects satisfying the generated type, declared at the top of the test file.)

- [ ] **Step 2: Implement** `readyVersions` — filter `status === 'ready' && package`, sort by `createdAt` ascending.
- [ ] **Step 3: Load on reopen** — in `studio.tsx`'s `onReopen`, after the assets call: `api.get<GenerationDetailDto[]>(\`/api/projects/${project.id}/generations\`)` → `setVersions(readyVersions(list))`; if any, `setGeneration(last)` and `setJobStatus('ready')`. After a new generation finishes `ready`, append it to `versions`.
- [ ] **Step 4: Land on the result** — the workbench's reopen handler goes to step 3 when the project has a ready version (the prompt is what the seller came back for), otherwise step 1 as today. Parked as Q-2 below.
- [ ] **Step 5: Switcher** — above `GenerationResult` in step 3, when `versions.length > 1`: a row of real buttons `t.generate.version(n)` ("Versiya 1", "Versiya 2"), `aria-pressed` on the shown one, 44 px tall, horizontally scrollable at 360.
- [ ] **Step 6: Verify** — unit tests; a Playwright case in `tests/flow.spec.ts` stubbing `GET /api/projects/p-1/generations` with two ready packages: reopening shows the newer prompt and "Versiya 2" pressed, "Versiya 1" swaps the prompt text. By hand on the real Pixel 9a project (it has two): screenshot both versions.
- [ ] **Step 7: Do not commit.** Report that it waits on 4a's merge, then `pnpm api:generate` from `main`, `pnpm api:check`, commit `feat(studio): a reopened project shows its saved prompts, every version (R-002)`.

---

### Task 5: The public tunnel setup, in the docs

**Files:** web `CLAUDE.md` (new "Running it publicly" section after Commands), api `CLAUDE.md` (one line under the env notes), api `docs/PROGRESS.md` (dated entry), api `docs/REQUESTS.md` (R-001, R-006, R-008 → done)

Content, verbatim facts only (from the 2026-09-13 setup): the separate `jas-ad-studio` tunnel and its config file; the `kitobnarx` tunnel is a different live site and must not be touched; the four pm2 names and `pm2 save`; `WEB_ORIGIN` / `GOOGLE_REDIRECT_URI` on the public host with `EXTRA_WEB_ORIGINS` for localhost; Google OAuth app in production with `/maxfiylik` as the interim privacy URL (D-022 still Jakhongir's); the gotchas (`route dns` needs `--config` + `--overwrite-dns`, pm2 under Node 22, DoH to test a fresh hostname, no `pnpm build` under the live dev server).

- [ ] Write, then `git diff` both files and confirm no secret (no client secret, no DB URL, no tunnel credential path contents).
- [ ] Commit per repo: `docs: how the site is served publicly, for the next session`.

---

### Task 6: R-007 — design and QA pass

Load `impeccable` and `design-taste-frontend` before starting. Order: home (header, hero, tray, how-it-works, gallery, FAQ, footer) → studio steps 1–3 and result → projects drawer → credits drawer → `/admin` every tab → `/maxfiylik`.

For each part:
- [ ] Screenshot at 1440, 390, 360 signed in (Chrome, Doston's session) and signed out (Playwright).
- [ ] List findings in the table below as **defect** (overlap, overflow, cut-off text, a control under 44 px, a broken state, a console error, focus lost) or **taste** (colour, spacing rhythm, hierarchy, iconography).
- [ ] Fix defects in place, one commit per part: `fix(<part>): …`. **Do not fix taste findings**; park them for Doston with a screenshot. R-003 (projects experience) is his and his friends' — record observations only.

| Part | Finding | Kind | Fixed in |
|---|---|---|---|
| Whole site, public | Next.js dev indicator ("N" badge) visible bottom-left to every visitor, because the public site is `next dev` | defect | web `fix(dev): hide the Next.js indicator…` |
| Studio, phone 390/360 | Fixed "Davom etish" bar floated over the entire page: covered a gallery card's text, hid the footer privacy link, offered to continue an off-screen form | defect | web `fix(studio): the phone action bar shows only while…` |
| Hero, desktop | Hand-drawn loop around "Google Flow" crosses the space into "Videoni" and touches the line above. A scaled-down loop was tried and cut through the letters instead, so it was **reverted**: the gap is ~5px, no loop clears both. Options: drop the loop and keep the underline + note, or redraw it as an underline swoosh | taste, Doston | not fixed |
| Admin, hero photos | Each card's "1-rasm / Standart rasm" label looked squeezed beside a 289px photo. **Not a code defect:** the `<img>` has `size-20`, but the browser held a CSS chunk from before that class existed. After bypassing the cache it measures 80×80 and the label sits correctly | stale CSS, see next row | — |
| **Public site, every page** | **Cloudflare rewrites the dev server's `Cache-Control: no-cache, must-revalidate` on CSS to `max-age=14400`.** After any front-end change, visitors keep the old stylesheet for up to 4 hours while running the new markup, so layouts look broken. Almost certainly also the cause of Doston's earlier "Prompt collided with the category" screenshot. Fix is a Cloudflare setting, not code | defect | **Fixed 2026-09-13:** Cloudflare Cache Rule "jas.kitobnarxi.uz: no cache (dev server)", `Hostname wildcard "jas.kitobnarxi.uz"` → Bypass cache, deployed by Doston. Verified: jas CSS now `no-cache, must-revalidate`, `cf-cache-status: DYNAMIC`; kitobnarxi.uz unchanged (`s-maxage=300`) |
| Home, console | "N" in the corner of Doston's Chrome is Next's **Open Next.js Dev Tools** button. A fresh browser (Playwright) shows none with `devIndicators: false`; Doston's Chrome keeps it, likely from remembered dev-tools state. A `suppressHydrationWarning` on `<body>` was tried on the theory that an extension's hydration mismatch caused it, refuted, and reverted | not a visitor defect | — |
| Footer | R-006 marks are hand-drawn inline SVG. The design skill prefers an icon library (Phosphor/Tabler); the plan allowed no new dependency | taste, Doston | not changed |
| Home, "Qanday ishlaydi" | Three equal columns numbered "1. / 2. / 3." — the generic step-row pattern | taste, Doston | not changed |
| Home, console | `401 /api/me` logged on every signed-out load — expected, not an error a visitor sees | not a defect | — |
| Home, console | Hydration mismatch on `<body>`: `data-gr-ext-installed` attributes, injected by the Grammarly extension in the tester's Chrome | not a defect | — |
| Home 1440 | One 404 in the console on the first capture; did not reproduce on a fresh load with every failed request logged | not reproducible | — |
| Home, all widths | No horizontal overflow at 1440, 390, 360; the only controls under 44px are the 1×1 hidden file inputs behind visible upload buttons | pass | — |

---

## Questions for Doston

Parked instead of asked, so work did not stop. Asked and answered on 2026-09-13 when Doston returned.

1. **Commits while you were away.** Each finished task is committed on `p6d-requests`; nothing is merged to `main` without Doston. *Not objected to; standing.*
2. **Reopening a project with a saved prompt: which step?** → **The newest prompt (step 3)**, with the Versiya buttons. Doston confirmed it on the real Pixel 9a project.
3. **Versions: ready only?** Default kept: only prompts that were actually made are listed.
4. **Admin refresh: tab only?** → **Tab only is fine.** An open edit form inside a tab may close on refresh.
5. **R-002 web half needs a merge.** → **Merge the api route once reopening works on the real site.** It did, so Task 4a merges to `main` and Task 4b is committed after `pnpm api:generate` from `main`.

**A false alarm worth recording:** an automated check in Chrome showed the reopened project stuck on step 1 with no prompt. The data, the api and the console were all clean; the clicks were landing before the page had hydrated, on a tab that had been open across hot reloads. Doston's own click on the real site showed the prompt and both versions. Check with a fresh, hydrated page before debugging a "real" failure.

## Self-review

- Coverage: R-008 → T1, R-001 → T2, R-006 → T3, R-002 → T4a/T4b, docs → T5, R-007 → T6. R-003 is deliberately not built (Doston: discuss with friends first). R-004, R-005 are done.
- Types: `AdminTab`/`tabFromHash`/`hashForTab` (T1) and `readyVersions` (T4b) are used only with the names defined here.
