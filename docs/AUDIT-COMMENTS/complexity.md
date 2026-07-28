# Audit comments — Complexity

34 of the 464 archived burndown PR comments. Part of the [audit comment archive](README.md) — see
the README for what this archive is, the full run table, and the category index.

## PR [\#535](https://github.com/KyleMit/Splotch/pull/535) — Audit burndown (2026-07-24)

### `863ee85aaa43` — [P1][complexity] Split the 125-line initDrawingCanvas into named setup phases

**Issue**

`initDrawingCanvas` is a single ~125-line function that does at least seven unrelated things:
teardown, `getContext`, crayon-overlay adopt-or-create (1247-1276), magic-brush host wiring
(1280-1287), callback attach + color/scale defaults (1289-1294), the whole window/canvas listener
registration block (1298-1345), and the idle export-warm (1352-1354). The reader has to hold all of
it at once, and the overlay-creation branch alone is 20 lines of DOM construction inlined
mid-function.

```ts
export function initDrawingCanvas(canvasElement: HTMLCanvasElement, options: InitOptions = {}) {
  teardownEngine();
  canvas = canvasElement;
  ...
  const providedOverlays = canvas.parentElement?.querySelectorAll<HTMLCanvasElement>(
    'canvas[data-crayon-overlay]'
  );
…
```

**Fix**

refactor(engine): extract initDrawingCanvas setup phases into named helpers

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071306499) · 2026-07-24
15:04:14 UTC</sub>

### `8c50336324a4` — [renderOp dispatcher has a 35-line crayon-bbox block inlined]

**Issue**

`renderOp` switches on six op kinds, and the `op.crayon && !op.erase` arm (499-552) is by itself a
50-line block that: sets up the buffer, mirrors the transform, paints, sets `dirty`, then computes
an op bounding box inline (517-537) and repeats the paint+bounds into the paper-space buffer
(542-550). The bbox computation (dot vs path min/max over segs) is buried procedural code inside a
dispatcher.

```ts
let x0: number; let y0: number; let x1: number; let y1: number; let pad: number;
if (op.kind === 'dot') { x0 = x1 = op.x; ... pad = op.radius + 2; }
else { ... for (const s of op.segs) { x0 = Math.min(x0, s.cx, s.x); ... } pad = op.lineWidth / 2 + 2; }
```

**Fix**

refactor(drawing): extract renderCrayonOp and opDeviceBounds from renderOp

**Adversarial review** — passed (per-round detail predates per-commit logging).

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071307038) · 2026-07-24
15:04:17 UTC</sub>

### `00b519f55916` — [P2][complexity] Split the 95-line `generateAiImage` into named phases

**Issue**

`generateAiImage` is a single ~95-line function that does: the re-entrancy guard,
`AbortController`/timeout setup, canvas export, preview object-URL creation, WebP transcode
selection, credential-header assembly, endpoint construction, the `fetch`, a four-arm response
`switch` with per-arm logging, commit, auto-save orchestration, catch, and `finally` teardown. The
reader has to hold the whole request lifecycle plus the ownership (`isAiGenerationActive(runId)`)
discipline in their head at once, and the response `switch` (lines 150-169) is buried mid-function.
This is the highest-traffic module in the scope and the hardest to scan.

**Fix**

refactor(drawing): split generateAiImage into export/request/response helpers

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5071309697) · 2026-07-24
15:04:30 UTC</sub>

### `20621ebeb907` — [P2][complexity] `settings.svelte.ts` is a god-module bundling four unrelated concerns

**Issue**

At 373 lines this module mixes four concerns that share nothing but the word "settings":

1. The actual settings store + table (lines 45-207, 249-265).
2. A BYOK Gemini-key **secure-write concurrency queue** — `aiKeyWriteVersion`, `aiKeyWriteQueue`,
   `persistAiUserApiKey`, `setAiUserApiKey`, `hydrateApiKey` (lines 213-287), including the subtle
   "ordered writes so a stale save can't win" logic.
3. **Folder-save lazy-loading** — `folderSaveModule`, `loadFolderSave`, `tryLoadFolderSave`,
   `changeSaveFolder`, `forgetSaveFolder`, `hydrateSaveFolder` (lines 289-362), a self-contained
   dynamic-import memo with its own error handling.
4. URL token capture — `captureAiAccessTokenFromUrl` (364-372). …

**Fix**

Extracted the BYOK key write-queue (`setAiUserApiKey`/`hydrateApiKey`) into `aiKey.svelte.ts` and
the folder-save lazy-loader (`changeSaveFolder`/`forgetSaveFolder`/`hydrateSaveFolder`) into
`saveFolder.svelte.ts`, both writing into the still-shared `settings` object, so the core module
keeps only the table-driven settings plus the theme/token specials. Rewired the three call sites
(`+page.svelte`, `AiKeyManager.svelte`, `SavingSection.svelte`) and split the matching test blocks
into `aiKey.svelte.test.ts`, preserving the dynamic `import('$lib/drawing/folderSave')` verbatim so
it stays off the startup bundle.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/startup-bundle.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/535#issuecomment-5073002024) · 2026-07-24
18:08:49 UTC</sub>

## PR [\#540](https://github.com/KyleMit/Splotch/pull/540) — Audit burndown (2026-07-24)

### 3782b5adbd6b — [P4][complexity] `setAiUserApiKey`'s version+queue+ownership concurrency logic is dense and untestable in isolation

**Issue**

`setAiUserApiKey` interleaves three concurrency guards — a monotonically increasing
`aiKeyWriteVersion`, a serializing `aiKeyWriteQueue`, and an `ownsRequest()` re-check that on loss
re-persists the *previous* value (lines 231-233) — inside a single 30-line closure. The correctness
argument ("an older save already in flight cannot finish after a replacement") is subtle and the
branch that restores `settings.aiUserApiKey` on lost ownership is easy to misread. It's buried in
the settings module (see the god-module finding), which makes it hard to unit-test the ordering
guarantees directly.

**Fix**

Added two tests to aiKey.svelte.test.ts covering the setAiUserApiKey race outcomes the finding
called out: a second call superseding a stale in-flight first write (version guard), and ownership
loss mid-flight restoring the prior credential via the `!ownsRequest()` re-persist branch. No
production code changed.

**Adversarial review** — reviewer caught the following; addressed before approval:

* web/src/lib/state/aiKey.svelte.test.ts:69-92 — the new 'a second call supersedes an in-flight
  first write' test never asserts the persisted secret, so it covers only the aiKeyWriteVersion
  guard, not the aiKeyWriteQueue serialization the finding is about. Verified by replaying the
  test's exact call sequence against a queue-less copy of setAiUserApiKey outside the repo: with the
  queue deleted, all four of the test's assertions still hold (awaitSecond=true, settings='second',
  awaitFirst=false, settings still 'second') while secure storage ends holding the stale 'first'
  value instead of 'second' — exactly the corruption the comment at aiKey.svelte.ts:15-16 says the
  queue prevents (the older value becomes the credential restored on next launch). Fix: add
  `expect(secureStore.apiKey).toBe('second');` after line 91.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074733289) · 2026-07-24
21:47:32 UTC</sub>

### 4c825b095752 — [P2][complexity] `ParentCenter.svelte` is 771 lines with four shells inlined — extract the compact quick-toggles shell

**Issue**

This one component holds routing state, four distinct render branches (compact / wide sidebar /
phone hub / drilled section), and a self-contained sub-feature: the compact landscape-phone shell
with its own `LockedOrientation` type, `orientationOptions`, and `lockOrientation()` logic
(`:60-86`), ~65 lines of markup (`:183-249`), and ~130 lines of dedicated CSS (`.quick-toggles`,
`.orient-seg`, `.about-cell`, `.portrait-note`, `:405-533`). None of it is shared with the other
three shells. The `<style>` block alone is 446 lines.

**Fix**

Moved the landscape-phone quick-toggles shell — the `LockedOrientation` selector state, its 2×2
markup, and its ~130 lines of dedicated CSS — into a new `parent/CompactShell.svelte`, which imports
the settings state and setters directly the way every other `parent/*` section already does, so the
extraction needed no new props. ParentCenter now only picks a shell
(`{#if compact}<CompactShell />`) and drops from 771 to 524 lines. Note: the compact header also
depended on ParentCenter's scoped `.pc-header` base rule, which cannot reach a child component, so
those declarations were merged into `.pc-header-compact` in the new file; the brief's "well under
500 lines" target was not reachable from this extraction alone (its own arithmetic lands at ~530)
and would require extracting a second shell.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5074734254) · 2026-07-24
21:47:37 UTC</sub>

### 81e0eed01cc1 — [P4][complexity] `AiKeyManager` mixes credential verification, secure persistence, masking, feedback, and three feature toggles

**Issue**

One component owns: platform detection + storage-note copy (`:47-54`), key masking (`:39-45`), the
async verify→persist→feedback state machine with `latestRequest` guarding (`:71-123`), forget
handlers, *and* the three downstream feature toggles (`:247-282`). It's a lot of unrelated concerns
in a single 488-line file; the toggles at the bottom have nothing to do with credential handling and
only render when `!aiLocked`.

**Fix**

Extracted the three unrelated AI feature toggles ("Create AI Images", "AI Customization", "Auto-Save
AI Images") out of AiKeyManager.svelte into a new AiFeatureToggles.svelte, following the sibling
*Section.svelte pattern of importing settings/setters directly rather than prop-drilling.
AiKeyManager now renders `<AiFeatureToggles />` in place of the inline block, keeping credential
handling (verify/persist/forget, masking, storage note) as its sole remaining concern.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/parent-zoom.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5075748621) · 2026-07-25
00:10:56 UTC</sub>

### bdbedef3b597 — [P2][complexity] The coachmark tutorial should be its own component, not 180 lines inside ClearButton

**Issue**

ClearButton (540 lines) mixes the actual clear control (button + `dragToClear` wiring, 102-146) with
a self-contained animated tutorial: state (`tutorialVisible`, `tutorialFadeOut`,
`tutorialDismissTimer`, 18-23), imperative geometry positioning of ghost/ring in viewport coords
(`showTutorial`, 29-68), dismiss/reset lifecycle (70-99), its markup (148-162), and ~160 lines of
coachmark CSS + two big keyframe blocks (359-522). None of it is needed to render or operate the
clear button; it's only shown when `dragToClear` calls `onTutorialShow`. The two concerns share
nothing but the button's bounding rect.

**Fix**

Moved the tutorial's state, timer, imperative ghost/ring positioning, markup, and ~160 lines of
CSS + keyframes into a new `ClearCoachmark.svelte`, which ClearButton drives through `bind:this` via
`show(anchorEl)` / `dismiss()`; the child's `dismiss()` early-returns when hidden so the parent can
call it unconditionally instead of reading tutorial visibility itself. Kept the orientation effect's
`untrack` wrapper and updated its comment — it's still what keeps that effect from subscribing to
the coachmark's visibility (signals cross component boundaries), which is the same-tick dismissal
`clear-tutorial.spec.ts` guards.

**Adversarial review** — reviewer caught the following; addressed before approval:

* BLOCKING — `npm run lint:tokens` fails at this commit, turning the CI Quality job
  (.github/workflows/test.yml:62) red. Moving the `.coachmark-button` gradient out of
  ClearButton.svelte drops that file from 6 raw hex colors to 4, below its committed ratchet
  baseline in scripts/lint-token-styles.mjs:50 (the ratchet fails on counts below baseline as well
  as above, line 100), and creates web/src/lib/components/ClearCoachmark.svelte with 2 raw hexes
  (#ff6b6b, #ee5a6f) and no baseline entry at all. Observed output:
  `lib/components/ClearButton.svelte: 4 raw hex color(s) in <style> but baseline says 6` and
  `lib/components/ClearCoachmark.svelte: 2 raw hex color(s) in <style> (baseline 0)`. Fix: lower the
  ClearButton entry to 4 and add `'lib/components/ClearCoachmark.svelte': 2` with the same 'unthemed
  danger-red chrome (deliberate — reads the same on both papers)' rationale. Note this baseline
  entry is load-bearing: sibling commit a0b68beb cited `'lib/components/ClearButton.svelte': 6` as
  the documented reason a ClearButton token finding was invalid. Neither `npm run check` nor
  `npm test` runs this script, and the acceptance criteria never named it — which is why it slipped.
* NON-BLOCKING — The newly added comment above `:global(.coachmark-trash)` in ClearCoachmark.svelte
  attributes the need for `:global()` to Icon rendering its SVG via `{@html}`. The actual reason is
  that the class is applied to Icon.svelte's own `<span>` (Icon.svelte:75), which carries
  Icon.svelte's style-scope hash rather than ClearCoachmark's — `:global()` would still be required
  even if the SVG were not injected with `{@html}`. Correct conclusion, wrong cited mechanism; could
  mislead a future reader into thinking the `:global()` can be dropped if `{@html}` goes away.
* VERIFIED CLEAN — `npm run check` (927 files, 0 errors/0 warnings), `npm run test:unit` (579
  passed), `npx eslint` on both changed files (clean),
  `npm run test:e2e -- clear-tutorial.spec.ts --repeat-each=10` (10/10 passed),
  `npm run test:e2e -- flows.spec.ts` (43 passed, covers clearViaGesture). Repo-wide grep for every
  removed symbol (showTutorial, dismissTutorial, tutorialVisible, tutorialFadeOut,
  tutorialDismissTimer, coachmarkRingEl, coachmarkGhostEl) found no stragglers outside the new
  component. Markup, both @keyframes blocks, and the reduced-motion rules moved verbatim. The
  retained `untrack` is still necessary and its rewritten comment is accurate (a `$state` read
  inside `dismiss()` registers on the parent's effect regardless of which component owns the state).
  The one behaviour change — `dismiss()`'s new `if (!tutorialVisible) return;` guard — is visually
  inert, since `.clear-coachmark.fade-out` only restates the base rule's `opacity: 0` whenever
  `.visible` is absent; it is what makes the parent's unconditional `coachmark?.dismiss()` safe.
* CONTEXT — docs/AUDIT.md still contains the finding at line 14. This is expected at review time,
  not a defect: scripts/audit-burndown/burndown.mjs:583-587 folds the AUDIT.md deletion into the
  commit with `git commit --amend` after the review stage completes.
* LIMITATION — I could not run the dev-server variant
  (`DEV_SERVER=1 npm run test:e2e -- clear-tutorial.spec.ts`); the env-var-prefixed command was
  denied by the current permission mode. Dev-build behaviour is therefore reasoned about rather than
  observed. The reasoning: Svelte 5's `ownership_invalid_mutation` dev check only applies to proxied
  object/array state, and both mutated values here are primitive `$state(false)`, so mutating them
  from the parent's effect via the child's exported `dismiss()` should not warn.
* docs/COMPATIBILITY.md:72 — stale line references introduced by the extraction. The
  `color-mix(in srgb …)` risk-register row cites `ClearButton.svelte:299–300`, `:318–319` for the
  radial-gradient backgrounds; after the ~236-line extraction those sites are at `:221–222` and
  `:240–241`. Line 299 now lands on the `:global(.clear-icon)` sizing rule and line 318 is past
  end-of-file (the file is 304 lines). Verified the neighbouring refs in the same row
  (ColorPicker.svelte:447, ColoringBook.svelte:298, :368) all still land exactly on their color-mix
  declaration, so this doc is maintained line-accurate and this change is what broke it — per
  CLAUDE.md ("If you discover any doc, skill, or rule is out of date while working, update it as
  part of the same task"), update the two ClearButton refs to 221–222 and 240–241.

**E2E gate** — `tests/clear-tutorial.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/540#issuecomment-5076313949) · 2026-07-25
02:13:51 UTC</sub>

## PR [\#544](https://github.com/KyleMit/Splotch/pull/544) — Audit burndown: 14 fixes, plus deferrals that keep their reasoning and their draft (2026-07-25)

### 9c72ae81c30d — [P3][complexity] `gen-tokens.mjs` emits the dark block via two different call styles

**Issue**

```js
function render() {
  const darkBody = declarations(themes.dark, '  '); // computed…
  return `...
:root[data-theme='dark'] {
  color-scheme: dark;
${darkBody}                                            // …used here
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${declarations(themes.dark, '    ')}                   // …recomputed inline here
  }
}`;
}
```

The dark declarations are produced two ways in one function — a precomputed `darkBody` for one
selector, an inline `declarations(themes.dark, ...)` for the other, differing only in indent string.
It reads as if the two blocks are unrelated when they're the same data at different nesting. The …

**Fix**

Dropped the single-use `darkBody` variable in `render()` and inlined
`declarations(themes.dark, '  ')` at its one use site, so both dark blocks — and every other block
in the template — are emitted with the same inline call style. Pure refactor of a build-time
generator: the regenerated `web/src/tokens.css` is byte-identical.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5079917323) · 2026-07-25
18:29:20 UTC</sub>

### 223cba0c568a — [P4][complexity] `render()` header comment duplicates the emitted `tokens.css` banner

**Issue**

The generator has two long explanatory blocks that say nearly the same thing: the module-level
comment (`:1-10`, "dark declarations emitted twice … generator guarantees the two blocks stay
identical") and the emitted banner inside the template literal (`:27-35`, "generator emits the dark
block twice so the two forms can never drift"). Maintaining the same rationale in two prose blocks
invites drift between them.

**Fix**

Trimmed the module-header comment in scripts/gen-tokens.mjs to a one-line pointer at the emitted
render() banner, which now holds the sole full explanation of why dark tokens are emitted twice —
eliminating the duplicated rationale. tokens.css was already in sync with the change (no CSS text
touched), and gen:tokens:check, svelte-check, unit tests, and eslint all pass.

*Revised before approval:* Folded the browser-floor constraint (CSS can't share a declaration block
between an attribute selector and a media query at our floor; light-dark() needs Chrome 123 / Safari
17.5) into the render() banner in scripts/gen-tokens.mjs, so the consolidated rationale is a
superset of what the trimmed module header used to say. Regenerated web/src/tokens.css to match;
gen:tokens:check, svelte-check, eslint, and unit tests all pass.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/gen-tokens.mjs:1-5` — the deleted module comment carried one clause that the surviving
  `render()` banner never duplicated: *why* the duplication is unavoidable (CSS cannot share a
  declaration block between an attribute selector and a media query at our browser floor;
  `light-dark()` needs Chrome 123 / Safari 17.5). Fold that constraint into the emitted banner at
  `:24-29` so the consolidated copy is a superset — as it stands the code states zero reasons why
  the two blocks can't be collapsed, which is exactly the question a future contributor will ask.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/544#issuecomment-5080228917) · 2026-07-25
19:22:05 UTC</sub>

## PR [\#545](https://github.com/KyleMit/Splotch/pull/545) — Audit burndown: 7 findings fixed, plus a driver data-loss fix (2026-07-25)

### 8a04c0abb759 — [P3][complexity] AdminConsole is an 868-line component mixing presentation, formatting utilities, clipboard, and modal state

**Issue**

One component owns: prop contract + exported interfaces, login/add form handling, an in-flight busy
guard, clipboard-copy feedback state, a relative-time formatter, a usage-tooltip builder, the
overflow-modal open/close/backdrop logic, three action layouts, and ~490 lines of scoped CSS. That's
many independent concerns in a single file; the `<script>` alone spans `:31-161` before any markup.
It's hard to navigate ("where's the copy logic vs the menu logic?") and impossible to unit-test the
pure helpers without mounting the whole component.

**Fix**

Moved `timeAgo`/`usageDetail` verbatim into a new `$lib/adminFormat` module (with node-environment
unit tests covering the unparseable-date and missing-style/prompt edges) and lifted the overflow
modal — its dialog markup, dismiss handlers, and `.more-menu*` CSS — into `admin/InviteMenu.svelte`,
leaving AdminConsole.svelte 143 lines shorter with the `Usage`/`Invite`/`Flash` export surface
untouched. One deviation from the brief: the extracted dialog markup never reads `copied`, and an
unused prop would fail the lint gate, so InviteMenu takes
`invite`/`busy`/`oncopy`/`onremove`/`onclose` and the parent keeps the copy-feedback state; the
parent opens the sheet through an exported `open()` on the child via `bind:this`, preserving the
original imperative `showModal()` flow exactly.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/admin.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/545#issuecomment-5080913369) · 2026-07-25
22:50:43 UTC</sub>

## PR [\#547](https://github.com/KyleMit/Splotch/pull/547) — Audit burndown — clear the docs/AUDIT.md backlog (2026-07-26)

### 96e9c77d3846 — [P4][complexity] `ai-timer` hotkey bindings are duplicated between the `onKeyDown` switch and the on-screen hint text

**Issue**

The key→action mapping exists twice: as an `if/else if` chain over `'p'/'f'/'s'/'e'/'t'/'r'` (72-81)
and as hand-written `<kbd>` hints (129-134). Adding or renaming a hotkey requires editing both, and
they can silently disagree.

**Fix**

Consolidated the ai-timer dev harness's duplicated key→action mapping into a single `HOTKEYS` array,
with `onKeyDown` doing a lookup and the `.hint` paragraph rendering from it via `{#each}`, so the
two hand-written lists can no longer drift apart. All four acceptance commands (check, unit tests,
eslint, ai-timer.spec.ts) pass.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/ai-timer.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5081792396) · 2026-07-26
03:27:10 UTC</sub>

### bdae39f8169b — [P1][complexity] Extract the drag-to-clear exit animation out of nested `scheduleReset` callbacks

**Issue**

The successful-clear branch choreographs a multi-stage animation entirely in JS by mutating inline
styles inside three nested `scheduleReset` closures:

```ts
node.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
node.style.opacity = '0';
node.style.transform = 'scale(0.8)';
o.pageTurnOverlayEl.classList.add('animating');
scheduleReset(() => {
  stopDrawSound();
}, 300);
scheduleReset(() => {
  o.pageTurnOverlayEl.classList.remove('animating');
  o.containerEl.style.transform = '';
  node.classList.remove('dragging');
  node.style.transition = 'none';
  node.style.transform = 'scale(0.8)';
  scheduleReset(() => {
    o.containerEl.classList.remove('dragging-active');
    node.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    node.style.opacity = '1';
…
```

**Fix**

Moved the clear button's commit-exit fade/shrink into `.clearing` / `.clearing-done` /
`.clearing-return` rules in ClearButton.svelte, matching the classList-toggle pattern the rest of
this gesture already uses, and replaced the three nested `scheduleReset` closures in `onPointerUp`
with a flat `playClearExit(node, o)` helper that only hands classes over at 300/600/650ms (plus a
950ms removal of the return class so it doesn't linger like the old inline transition did). The
brief floated letting the base `.clear-button` transition carry the fade-back; it has no opacity
transition, so opacity would snap — hence the explicit `.clearing-return` class it named as the
fallback. Added a fake-timer commit-path test asserting each stage and the final rest state.

*Revised before approval:* Addressed all three review points and amended the fix commit (now
20b40ade5881faf4b0832e5e1ed753104e0ff62a). (1) onPointerCancel now removes the
clearing/clearing-done/clearing-return classes instead of the three inline styles nothing sets any
more, so a cancel inside a previous commit's exit window no longer strands the button at opacity 0;
the cancel-path test's style assertions became class assertions and a new test covers commit → fresh
pointerdown → pointercancel with the exit timers still pending. (2) Dropped the 950ms timer;
.clearing-return is removed by a transitionend listener on the node filtered to target === node &&
propertyName === 'opacity' (the icons transition margin and bubble), registered beside the pointer
handlers and torn down in destroy() — no cross-file duration duplication and no timer racing the
fade. (3) Reworded the CSS comment to say opacity is absent from the base button's transition list.
Gates: check 0 errors, 684 unit tests pass, eslint clean, format:check clean, flows.spec.ts 44
passed.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `onPointerCancel` (dragToClear.ts) still clears `node.style.transition/opacity/transform`, which
  nothing sets any more, but no longer clears the new `clearing`/`clearing-done`/`clearing-return`
  classes — so a pointerdown+pointercancel landing inside the exit window (reachable: `isDragging`
  is already false when `playClearExit` starts, so a fresh drag can begin at once) now leaves the
  button at `opacity: 0` until the old 650ms timer fires, where the inline-style reset previously
  made it visible immediately. Replace those three dead style resets with removal of the three
  `clearing*` classes, and update the corresponding `node.style.*` assertions in the cancel-path
  test.
* The new 950ms `scheduleReset` that removes `.clearing-return` has no counterpart in the original
  code and hard-codes a duration that must stay in sync with `.clearing-return`'s `0.3s` in
  ClearButton.svelte — the cross-file duration duplication the finding specifically asked to
  eliminate — and if the timer fires before the 650ms class swap's fade has finished (jank between
  the two timers), swapping the transition mid-flight cancels it and snaps opacity to 1. Drive that
  removal from a `transitionend` listener on the node (as the finding proposed) or drop the timer
  entirely, which is exactly the original behaviour.
* The CSS comment above `.clearing` in ClearButton.svelte says "the base button transitions
  transform only" — the base `.clear-button` rule transitions box-shadow, border-radius, transform
  and background. Reword to say opacity is absent from the base transition list, which is the actual
  reason the return leg needs its own timing.

**E2E gate** — `tests/flows.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082092621) · 2026-07-26
04:53:08 UTC</sub>

### 7cada583814b — [P2][complexity] Split `dragToClear.onPointerDown` — it mixes multi-tap detection, hold timer, and accept-zone geometry

**Issue**

`onPointerDown` is ~60 lines spanning four unrelated concerns: (1) multi-click/tutorial detection
(`clickCount`/`lastClickTime`), (2) hold-timer arming, (3) drag-state init + pointer capture, and
(4) computing and positioning the circular accept zone (`homeButtonCenter`, `radius`, five
`acceptZoneEl.style.*` writes, an rAF to add `.visible`). The reader must hold all four in mind at
once, and the accept-zone geometry block is the kind of self-contained unit that reads far better
named.

**Fix**

Extracted two nested helpers from `dragToClear.onPointerDown` — `registerTap`, which owns the
multi-tap/tutorial counter and returns whether the caller should bail, and `armAcceptZone`, which
owns the accept-zone style writes and the rAF that reveals it — leaving `onPointerDown` as ~35 lines
of orchestration. Purely structural: the order and content of every side effect is unchanged,
including `releaseAllPointers()` before the geometry read and `dragging-active` before the zone is
armed. One wrinkle in the brief: it says `armAcceptZone` "owns computing `homeButtonCenter` and
`radius`" while its stated signature takes both as parameters; I followed the signature, so the
caller computes them and the helper stores the center into the closure variable.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/flows.spec.ts tests/clear-tutorial.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/547#issuecomment-5082173986) · 2026-07-26
05:18:57 UTC</sub>

## PR [\#550](https://github.com/KyleMit/Splotch/pull/550) — Burn down staged audit findings (continuation 2) (2026-07-26)

### d03bd4b09c64 — [P2][complexity] `hydrateDurableStorage` bundles concurrency orchestration, two-way reconciliation, and store-notification in one function

**Issue**

One function does four separable jobs: (1) gate on native + lazy-load Preferences, (2) fan out
concurrent `Preferences.get` across all keys, (3) a per-key reconciliation loop that both *restores*
localStorage-from-durable and *back-fills* durable-from-localStorage in the same `forEach` with two
branches (lines 179-188), and (4) fire the restore callbacks (lines 197-199). The dual-direction
branch inside the loop is the hard part to read — `restored` tracks only the restore direction while
the backfill quietly mutates the durable store and is deliberately not reported. This is the
"serialization + IO + migration in one function" smell the audit targets.

**Fix**

Extracted the four-way local/durable reconciliation into a pure exported helper and added direct
coverage for every input combination. Hydration now applies the helper’s restore/backup actions and
delegates restore callbacks to a named notifier.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084373619) · 2026-07-26
16:32:10 UTC</sub>

### 0ea5073fdba4 — [P3][complexity] `saveBlobToFolder` mixes permission negotiation, unique-naming, the write, and stale-handle recovery in one function

**Issue**

The function does: support check, load handle, query-then-maybe-request permission (lines 159-163),
unique-name resolution + createWritable + write + close (165-168), and a catch block that performs
*semantic recovery* — detecting a `NotFoundError`, clearing the stored folder, and firing the UI
listener (175-178). The recovery logic (stale folder → forget + notify) is a distinct concern buried
in a catch arm.

**Fix**

Extracted permission negotiation and stale-folder cleanup into private helpers, leaving
`saveBlobToFolder()` focused on orchestration while preserving its existing behavior and API.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/550#issuecomment-5084375748) · 2026-07-26
16:32:41 UTC</sub>

## PR [\#551](https://github.com/KyleMit/Splotch/pull/551) — chore(audit): burn down 126 staged findings (2026-07-26)

### 8332d6d48bc2 — [P2][complexity] Split the long generate-image POST handler into named stages

**Issue**

The handler runs five distinct responsibilities in one 54-line body: read request shape (99),
authorize (101-106), read+validate image (108-113), build prompt (117), branch usage logging
(121-133), call provider and shape response (137-151). The usage-logging branch inline in the
handler (121-133), with a `platform?.context?.waitUntil?.` detail and a separate BYOK `console.log`,
is especially out of place — it's audit plumbing sitting in the middle of the request pipeline.

**Fix**

Extracted the BYOK/managed telemetry branch into a private typed helper while preserving synchronous
logging and fire-and-forget scheduling through optional `waitUntil`. `POST` now retains the
requested ordered pipeline with no endpoint contract changes.

*Revised before approval:* Applied the repository’s Prettier style to the helper signature by
removing the trailing comma. The worktree contains only that formatting correction on top of the
scoped extraction.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/generate-image.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084811991) · 2026-07-26
18:27:12 UTC</sub>

### 25ceeaaba7c9 — [P3][complexity] Extract a type guard for the Reporting-API entry predicate in csp-report

**Issue**

The array-branch predicate casts `item` to `Record<string, unknown>` **four times** inside one
boolean expression to reach `.type` and `.body`:

```ts
.filter((item): item is Record<string, unknown> =>
  typeof item === 'object' && item !== null &&
  (item as Record<string, unknown>).type === 'csp-violation' &&
  typeof (item as Record<string, unknown>).body === 'object' &&
  (item as Record<string, unknown>).body !== null)
.map((item) => fromReportingApiPayload(item.body as Record<string, unknown>, item.url));
```

It's hard to read and the repeated casts signal a missing guard.

**Fix**

Added a local Reporting-API entry interface and type guard, then used it to normalize valid CSP
violations without repeated casts. Accepted and rejected payload behavior remains unchanged.

*Revised before approval:* Formatted the Reporting-API guard to match the repository’s Prettier
output, resolving the driver rejection without changing behavior.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5084817449) · 2026-07-26
18:28:40 UTC</sub>

### e4cf6fa35a4d — [P2][complexity] `checkForUpdates` is a 70-line function wrapping a nested `activateWaitingSW` state machine

**Issue**

`checkForUpdates` mixes four concerns in one function: the `'deferred'`/`'activating'` guard
(162-169), the registration lookup + `update()` (171-174), a 35-line nested `activateWaitingSW`
closure that owns its own recovery-timer/`controllerchange` state machine (176-210), and the
waiting-vs-installing dispatch (212-225). The nested closure captures `registration`-adjacent state
and is re-created on every call. This is hard to read and impossible to unit-test in isolation (it's
reachable only through `checkForUpdates`).

**Fix**

Moved the waiting-service-worker activation state machine to a private module-scope helper while
preserving its logic and call ordering. Both immediately waiting and installing-to-waiting workers
continue through the same activation path.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086068599) · 2026-07-27
00:10:54 UTC</sub>

### 6508e0de243d — [P3][complexity] `collectDeviceInfo` is a ~40-line function mixing web + native collection

**Issue**

The function seeds base fields, then branches into a native path (dynamic-import
`@capacitor/device`, merge OS/model/language, UA fallback) and a web path (display mode, UA OS, full
UA), all inline. The two collection strategies are logically separable but interleaved, and the
`try/catch` + fallback nesting makes the native arm the densest part of the file.

**Fix**

Extracted native and web device-info collection into dedicated helpers while preserving the
compile-time branch and payload behavior. Added focused Node-only coverage for every UA-to-OS
mapping.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** — `tests/parent-zoom.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086080107) · 2026-07-27
00:13:10 UTC</sub>

### 2ec481d0169f — [P2][complexity] `scoreEyeFill` is a 100-line function mixing resize, per-core sampling, annulus geometry, and the liveliness verdict

**Issue**

One function decodes+resizes the fill and builds a luma plane (211-218), then per core: collects
core pixels (226-229), builds a geometric annulus while running an inner 3×3 near-ink exclusion
(231-279), computes p15/p85 band stats (282-288), and evaluates the tri-branch liveliness ladder
(289-294). The annulus loop alone is a 30-line quadruple-nested block with a `nearInk` inner scan.
The reader must hold all of it to follow one core's verdict.

**Fix**

Extracted module-private `coreLuma`, `sampleAnnulus`, and `judgeLively` helpers while preserving the
orchestrator’s percentile selection, skip behavior, verdict logic, and full reported core shape.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086088206) · 2026-07-27
00:14:50 UTC</sub>

### 820adf640f41 — [P2][complexity] `detectInventedShapes` is a 155-line function whose five numbered comments are begging to be functions

**Issue**

The body is literally sectioned `// 1. flood…`, `// 2. dilated source-ink mask`,
`// 3. median background color`, `// 4. foreign pixels`, `// 5. connected components + anchoring`.
Step 5 alone (129-179) is a 50-line inline connected-components scan with per-blob bbox, color sums,
and border/anchor accounting. Numbered-comment steps in a long function are the canonical
extract-into-named-function signal.

**Fix**

Extracted background flooding, candidate-color median/deviation, and blob labeling into private
helpers so the detector remains a linear orchestrator without changing its results.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/551#issuecomment-5086089439) · 2026-07-27
00:15:04 UTC</sub>

## PR [\#552](https://github.com/KyleMit/Splotch/pull/552) — Audit burndown: clear the staged docs/AUDIT.md backlog (236 findings) (2026-07-27)

### 86989dfe3c3f — [P1][complexity] `model-eval-fixtures.mjs` embeds an 80-line browser program as a template string

**Issue**

The entire in-page canvas renderer — `paper`, `crayon`, `strokePaths`, `drawOutline`, `revealFill`,
`revealGradient`, the `SCENES` map, `renderFixture` — lives inside one giant backtick string
assigned to `PAGE_JS` and injected via `page.evaluate(PAGE_JS)`. It's ~80 lines of dense JavaScript
with no syntax highlighting, no linting, no type checking, and no editor help; a typo surfaces only
as a runtime `pageerror`. It also silently duplicates the node-side RNG (`makeRng`/`jit`, lines
31-38) as page-side `rnd`/`jit` (lines 337-338) with the same LCG constants.

**Fix**

Moved the in-page canvas renderer out of the `PAGE_JS` template literal into
`scripts/lib/model-eval-fixture-renderer.js`, loaded per fixture with `page.addScriptTag`, with the
paper colors and palette published as `window.__PAPER`/`window.__PALETTE` by a small `page.evaluate`
right before it (the values used to be baked in by JSON interpolation). Two details the brief didn't
anticipate: the renderer body is wrapped in an IIFE because the page's global lexical scope survives
`setContent`, so top-level `const`/`let` threw "already declared" on the second injection (verified
empirically), and one ternary-as-statement became an `if`/`else` to satisfy `no-unused-expressions`.
Regenerating the corpus produces byte-identical PNGs.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — "regenerating the corpus produces byte-identical PNGs" is the strongest
verification available for this shape of change, and the right one to have reached for: moving a
canvas renderer out of a string into a real file is pure code motion *if and only if* the pixels are
unchanged, and nothing in the type-check, lint, or unit gates can see a rendering difference.

The IIFE detail is worth keeping: the page's global lexical scope survives `setContent`, so a
top-level `const` in the extracted file threw "already declared" on the second injection — a failure
that appears only from the *second* fixture onward, so a single-fixture smoke test would have missed
it. It was found empirically rather than reasoned about.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088032973) · 2026-07-27
06:29:58 UTC</sub>

### 2485bdd4f90b — [P1][complexity] `api-smoke.mjs` is one 320-line `run()` with ~24 inline fetch/check blocks

**Issue**

`run()` is a single function that sequentially exercises admin login, the tokens auth gate, tokens
CRUD, verify-access-code, report (validation/honeypot/unconfigured/throttle), csp-report (five
formats + throttle), generate-image (raw + legacy multipart), and the shared 429 contract — all as
flat inline `await fetch(...)` + `check(...)` pairs. There are no section functions, so a reader
can't run/skim one contract in isolation, and shared request shapes (the JSON POST, the bearer
header) are re-typed at every call.

**Fix**

Split the flat `run()` in `scripts/api-smoke.mjs` into eight named async suites (admin auth, CORS,
tokens CRUD, verify-access-code, report, csp-report, generate-image, throttling) invoked in the
original order, since the per-route rate-limit buckets make that order load-bearing, and hoisted
local `postJson`/`authHeader` helpers to drop the re-typed JSON-POST shape. Kept the helpers local
rather than in `scripts/lib/smoke.mjs` — sharing with `blobs-smoke.mjs` is a separate backlog entry
— and two small deviations from the brief's sketch: `checkCorsContract` takes the unauthenticated
401 response as an argument so it still re-reads it instead of spending an extra request, and the
tokens DELETE keeps its inline `fetch` because `postJson` as specified only does POSTs.

**Adversarial review** — approved on the first pass; no changes needed.

**Supervisor note** — the load-bearing detail is that **execution order was preserved
deliberately**, not incidentally. Extracting 24 inline blocks into eight suites is exactly where a
refactor reorders things for readability, and here the per-route rate-limit buckets make ordering
semantic: run the throttling suite before the endpoints that share its bucket and the 429 contract
stops meaning what it asserts. The fix calls this out explicitly as the reason it kept the sequence.

Also right in the small: `checkCorsContract` takes the already-fetched 401 response as an argument
rather than re-issuing the request, which would have consumed an extra token from the very bucket
the throttle assertions depend on — a "cleaner" signature that would have quietly changed what the
suite tests. And it declined to hoist the helpers into `scripts/lib/smoke.mjs` on the grounds that
sharing with `blobs-smoke.mjs` is its own backlog item, rather than widening scope unasked.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088090862) · 2026-07-27
06:38:07 UTC</sub>

### 02c745a1716d — [P3][complexity] `store-shots.mjs` five scenes inline in a loop with magic waits

**Issue**

The per-target loop body is five anonymous `{ … }` blocks (draw / coloring-book / color-page /
color-picker / parent-center), each opening a page, doing UI steps, screenshotting, and closing —
interleaved with bare `sleep(450)`, `sleep(500)`, `sleep(400)`, `sleep(700)` whose values are
unexplained "wait for animation/overlay" guesses. It's hard to run or reason about one scene, and
the magic delays are the kind of thing that flakes.

**Fix**

Each of the five store-shot scenes is now a labelled `scene*` function taking
`(browser, base, device, dir)`, driven from a `SCENES` array so a scene can be run alone while
iterating, and the per-scene console logging comes off `scene.label` instead of hardcoded numbers.
The 700ms overlay guess is replaced by a real DOM signal — a new `waitForColoringOverlay` in
`app-driver.mjs` awaiting `#coloringOverlay.overlay-ready` (the class the component only sets once
the page art decodes) — and the remaining four waits keep their exact values behind
`MENU_TRANSITION_MS` / `PAGE_GRID_TRANSITION_MS` / `SCREENSHOT_SETTLE_MS`.

*Revised before approval:* `scripts/driver-smoke.mjs` now imports `waitForColoringOverlay` and calls
it after `pickPage` instead of `sleep(700)`, so the `#coloringOverlay.overlay-ready` selector is
exercised by the dedicated rot guard. I confirmed the guard bites by temporarily renaming
`class:overlay-ready` to `class:overlay-primed` in `DrawingCanvas.svelte`: the smoke run went to 5
passed / 1 failed with `FATAL: waiting for locator('#coloringOverlay.overlay-ready')`, and reverting
the app file restored 6/6. In `scripts/store-shots.mjs`, scene 2's post-`pickBook` wait is now
`PAGE_GRID_SETTLE_MS = PAGE_GRID_TRANSITION_MS + 100` — the same 500ms as before, but named for the
page-grid entrance it screenshots and derived from the transition constant so a future tune carries
that shot along.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `scripts/driver-smoke.mjs` is the dedicated guard against app-driver selector rot (its header says
  so, because `gen:*` never runs in CI), but the new `waitForColoringOverlay` and its
  `#coloringOverlay.overlay-ready` selector are not exercised by it — the smoke test still does
  `await sleep(700)` then checks plain `#coloringOverlay` visibility at line 68-73. Replace that
  `sleep(700)` with `waitForColoringOverlay(page)` so a rename of the presentational `overlay-ready`
  class in `DrawingCanvas.svelte` fails the smoke test instead of silently making `gen:shots` hang
  for the 30s default timeout.
* In `scripts/store-shots.mjs`, `sceneColoringBook` waits `SCREENSHOT_SETTLE_MS` (500) after
  `pickBook` for the very same page-grid entrance animation that `sceneColorPage` waits
  `PAGE_GRID_TRANSITION_MS` (400) for. Keep the values as-is, but label scene 2's wait for what it
  is, so a future tune of `PAGE_GRID_TRANSITION_MS` doesn't silently skip the one scene that
  screenshots that grid.

**Supervisor verification** — the best-verified finding of the run. The reviewer's first catch is
subtle and genuinely dangerous: swapping a `sleep(700)` for a real selector *improves* the code but
creates a **new** rot surface, and the failure mode is worse than what it replaced — a renamed
`overlay-ready` class would not fail anything, it would make `gen:shots` hang for the 30s default
timeout with no CI signal, because `gen:*` never runs in CI.

The implementer then proved the guard rather than asserting it: temporarily renaming
`class:overlay-ready` → `overlay-primed` in `DrawingCanvas.svelte`, confirming the smoke run went 5
passed / 1 failed with the expected `FATAL: waiting for locator('#coloringOverlay.overlay-ready')`,
then reverting to 6/6. That is a mutation test — the only way to show a guard actually bites, since
a passing smoke run proves nothing about whether it *would* fail.

Because that experiment edited **app source**, I checked it was really reverted rather than trusting
the summary. Confirmed at HEAD: `DrawingCanvas.svelte` is clean in the working tree and
`class:overlay-ready` is intact at line 368 (and its style rule at 575). No app-source change
escaped, and the only dirty files remain the previously-noted `store-assets/` and
`scrapbook/index.html` churn.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/552#issuecomment-5088934775) · 2026-07-27
08:16:21 UTC</sub>

## PR [\#554](https://github.com/KyleMit/Splotch/pull/554) — Burn down staged audit findings (2026-07-27)

### 582166b19e69 — [P4][complexity] `release.mjs` is a 150-line top-level procedure

**Issue**

The whole release flow runs at module top level in numbered comment sections (resolve versionCode,
bump versions, regenerate, cleanliness guard, commit+tag, publish). It's readable thanks to the
comments, but it's untestable and can't be reasoned about in pieces; the stray-file guard (96-123)
in particular is meaty logic embedded mid-script.

**Fix**

Refactored the release workflow into named stages while preserving its dry-run, no-publish,
cleanliness, and publishing boundaries. Added focused coverage for the pure porcelain-status filter
so release artifact paths, rename destinations, and quoted paths remain handled correctly.

*Revised before approval:* Formatted the release script with Prettier so it conforms to the
repository style gate. No functional behavior changed.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090036234) · 2026-07-27
10:10:19 UTC</sub>

### 33084d16575e — [P1][complexity] Split the 90-line `driveSession` orchestrator into named stages

**Issue**

`driveSession` does everything in one function: `mkdirSync`, observer injection, heap sampling,
trace start, the entire nine-`beat` interaction script with inline drawing-coordinate math (lines
138-181), observer/heap read, screenshot, then assembling and writing four artifact files
(`trace.json`, `metrics.json`, `summary.json`, `report.md`) and logging. The interaction
choreography (what a "toddler session" *is*) is tangled with capture plumbing and artifact I/O, so
you cannot read the scenario without wading through trace mechanics, and the drawing constants
(`box.width * 0.15`, `arcPts(... 0, Math.PI)`, etc.) are buried mid-function.

**Fix**

Extracted the unchanged eight-beat toddler scenario, metrics construction, and ordered artifact
writes into focused helpers. `driveSession` now remains the setup, capture, analysis, logging, and
return orchestrator while preserving artifact names and structures.

*Revised before approval:* Restored the original duration measurement boundary by creating metrics
only after screenshot handling and the `trace.json` write. The artifact writer now preserves the
prior metrics, analysis, report, and write sequence while `driveSession` still supplies each
creation stage.

**Adversarial review** — reviewer caught the following; addressed before approval:

* The extraction changes `metrics.settings.durationMs`: `buildMetrics(...)` now runs before the
  screenshot and `trace.json` serialization/write, whereas the original measured duration afterward,
  so large traces can materially shorten the reported session length. Preserve the original
  measurement boundary while keeping the stages separated.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090310432) · 2026-07-27
10:39:59 UTC</sub>

### e449897cba65 — [P1][complexity] Break up `undo-scenarios.mjs main()` (170 lines) into per-scenario + artifact stages

**Issue**

`main()` runs env setup, browser launch, trace start, the full scenario loop (352-432) with dense
inline metric extraction, then ~40 lines of settings/metrics/artifact assembly (440-473). Inside the
loop, one block (374-424) pulls `engine.draw/commit/snapshot/undo` measures, computes
`historyRasterMB`, and pushes a 25-field result object — that's a distinct unit ("measure one
scenario") wedged inside the driver. The reader cannot see the scenario lifecycle without also
parsing trace-artifact bookkeeping.

**Fix**

Extracted per-scenario measurement and settings construction from the undo harness, and reused the
exported shared profile writer for all standard artifacts while preserving the bespoke undo outputs.

*Revised before approval:* Exported `runUndoScenario` and guarded the CLI entry point so importing
the module exposes the single-scenario runner without launching the full harness.

**Adversarial review** — reviewer caught the following; addressed before approval:

* `runUndoScenario` remains module-private, and importing `scripts/perf/undo-scenarios.mjs`
  unconditionally invokes `main()`, so it is not independently callable as required. Export it from
  an import-safe module or guard the CLI entry point so callers can run one scenario without
  launching the full harness.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5090312377) · 2026-07-27
10:40:13 UTC</sub>

### 20db1550d7fe — [P4][complexity] `analyze.mjs` makes five separate full passes over the event array

**Issue**

`userTimingMeasures`, `categoryBreakdown`, `jsSelfTime`, `phaseWindows`, `perPhase`, and
`attributeLongTasks` each iterate the entire `events` array independently, and
`perPhase`/`attributeLongTasks` additionally re-`filter` events into `tasks`/`commits`/`nested`
sub-arrays (lines 226-231, 272-286) then loop again per window (O(events × windows)). For a large
Android trace this is several redundant O(n) scans plus an O(n×w) attribution. Beyond cost, it hurts
readability: the "what is a RunTask, a Commit, a phase" classification is re-expressed in each
function rather than derived once.

**Fix**

Centralized trace event classification so each analyzer consumes ordered, purpose-specific subsets
while preserving summary and report output for captured web and Android traces.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5091086018) · 2026-07-27
12:08:25 UTC</sub>

### a7347290fbcd — [P4][complexity] `imageDims` JPEG scanner is a dense loop of unnamed byte offsets

**Issue**

The JPEG branch walks segment markers with bare literals (`buf.readUInt16BE(i + 7)`, `i + 5`, the
`0xc0..0xcf` SOF range minus `0xc4/0xc8/0xcc`) and no explanation of what offsets 5/7 are
(height/width within an SOFn segment). It reads as magic; a reviewer can't tell correct from
off-by-one.

**Fix**

Made JPEG SOFn dimension offsets self-describing with a layout comment, and added focused PNG/JPEG
parser coverage to preserve width-by-height output.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/554#issuecomment-5092448704) · 2026-07-27
14:14:17 UTC</sub>

## PR [\#561](https://github.com/KyleMit/Splotch/pull/561) — Burn down 114 staged audit findings (2026-07-27)

### 0122b9b1ab4c — [P1][complexity] Split the two mega-spec files (engine 1980 LOC, flows 1636 LOC) by feature area

**Issue**

`engine.spec.ts` is 1980 lines and `flows.spec.ts` is 1636 lines. Each bundles many unrelated
feature areas into one file. `engine.spec.ts` covers: basic strokes/undo, undo-cap, clear, eraser,
pen-merge recovery, edge-swipe guards, rotation/paper-view (its own section banner at line 858),
backgrounded re-entry (line 1113), teardown/re-init (line 1191), the crayon brush (line 1299), and
the snapshot memory tier (line 1715). `flows.spec.ts` covers palette, brushes, scribble-guard, undo
gating, persistence, Parent Center layouts, AI key flow, AI generation, coloring book, magic brush,
and brush ring. A reader looking for "the rotation tests" or "the coloring-book tests" must scroll a
2000-line file, and helper functions are interleaved between tests throughout (see the pixel-reader
…

**Fix**

Moved the shared engine readiness setup and drawing helpers into `engine-harness.ts`, then
redistributed all 60 engine scenarios across focused feature specs. Split all 46 full-app scenarios
by feature area, keeping feature-only helpers local and every assertion, retry, and timeout
unchanged.

*Revised before approval:* Retargeted stale engine and full-app spec references across the undo
seam, WebKit guidance, perf harness, asset naming record, and ADRs 0040, 0043, 0045, 0050, 0065,
and 0067. Each reference now identifies the focused spec or shared harness that owns the cited
invariant.

**Adversarial review** — reviewer caught the following; addressed before approval:

* Update the current references to the deleted `engine.spec.ts` and `flows.spec.ts` in
  `web/src/lib/drawing/undoHistory.ts`, `web/tests/webkit-smoke.spec.ts`,
  `scripts/perf/undo-scenarios.mjs`, the relevant ADRs, and `tools/asset-gen/docs/asset-naming.md`;
  they now point readers to nonexistent specs instead of the new feature-specific files.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/561#issuecomment-5093998133) · 2026-07-27
16:32:21 UTC</sub>

## PR [\#583](https://github.com/KyleMit/Splotch/pull/583) — Burn down staged audit findings with Codex (2026-07-28)

### 9bd33103cfb9 — [P2][complexity] `readStore` bundles store-open, read, seed, confirmation-loop, and fallback into one function

**Issue**

`readStore` is the token module's linchpin and carries five responsibilities in one ~45-line body:
open the store, read the key, seed from env on empty, run the multi-attempt seed-race confirmation
loop, and degrade to the memory fallback. The nested confirmation loop (a `for` with an inner
`try/catch` inside the outer `try`) is the subtle, correctness-critical ADR-0025 lost-seed-race
handling, buried where it is hard to read in isolation. Proposed: extract it as
`confirmSeedRaceWinner(store): Promise<StoreRead>`.

**State at triage (2026-07-27):** Fully holds. `readStore` (`web/src/lib/server/tokens.ts:67-111`)
is byte-identical to the pinned version — the f934d43..HEAD churn in this file (67bb0ac's …

**Fix**

Extracted the lost-seed-race retry loop into the unexported `confirmSeedRaceWinner` helper while
preserving successful seeding, transient-read retries, winner confirmation, and fail-closed behavior
exactly.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099779416) · 2026-07-28
04:00:52 UTC</sub>

### e278dd210691 — [P2][complexity] `$effect` bodies use bare member-access statements purely to register reactive dependencies — a fragile, non-obvious pattern

**Issue**

The drawing shell's orientation `$effect` opens with two expression statements
(`settings.lockRotationEnabled; settings.forceLandscapeOrientation;`) whose only job is to trip
Svelte's dependency tracker, because `applyDeviceOrientationPreference()` reads the settings
internally, outside the tracked scope. A cleanup commit or lint pass can delete the bare reads and
silently kill reactivity. Proposed making the reads load-bearing (pass the values as arguments, or
read them into a `$derived`), "same for any other effect using this pattern".

**State at triage (2026-07-27):** Nothing from the draft landed. All four sites are unchanged at
HEAD:

* `web/src/routes/+page.svelte:27-31` — the two bare `settings.*` reads, and …

**Fix**

Made orientation preferences explicit helper arguments so route effects and durable restoration
track and apply current values. Preserved ClearButton orientation resets, removed dead pinch-option
reads, and re-enabled unused-expression linting.

**Adversarial review** — approved on the first pass; no changes needed.

**E2E gate** —
`tests/flows-parent-center.spec.ts tests/clear-tutorial.spec.ts tests/parent-zoom.spec.ts tests/ai-timer.spec.ts`

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5099944782) · 2026-07-28
04:26:16 UTC</sub>

### 1b8fff5ca55b — [P3][complexity] `scoreCompositeEyes` is a 100-line function with an inline pupil-shape validator

**Issue**

Inside `scoreCompositeEyes`'s per-eye loop, three rejection stages are inlined: bounding-box fill +
aspect ratio, a Set-based erosion survival test, and centroid + disc-stats measurement. The
pupil-shape decision spans ~50 lines mixed with measurement, and the erosion is a fourth ad-hoc
morphology implementation. Proposed extracting `isPupilDisc(blob, w, h)` (reusing `erodeMask`) and
`blobCentroid(blob, w)` so the loop reads grow → validate → measure → push.

**State at triage (2026-07-27):** Unchanged at HEAD: `scoreCompositeEyes` is
`lib/composite-eye.mjs:174-275` with the bbox/aspect check (207-222), Set-based erosion (224-248),
and centroid reduce (251-252) all inline. `git apply --check` passes — this is the only C15 patch
that still applies verbatim. …

**Fix**

Extracted pupil-disc validation and centroid calculation from the composite-eye scoring loop. Added
the shared `erodeCross` primitive and focused coverage so the existing two-step four-neighbor
erosion behavior remains unchanged.

**Adversarial review** — approved on the first pass; no changes needed.

<sub>[comment](https://github.com/KyleMit/Splotch/pull/583#issuecomment-5100496873) · 2026-07-28
05:55:28 UTC</sub>
