# Handoff — compatibility-audit fixes

> 2026-07-22 · branch `claude/device-compatibility-audit-c5iui2` · fix the findings from the
> device-compatibility audit under a strict no-regression constraint

## Objective & non-goals

A full compatibility audit (this session, read-only — no code changed yet) verified the floor in
`docs/COMPATIBILITY.md` against the code and tests. Three result sets: the **register is accurate in
substance but stale in citations and missing rows**, the **test suite exercises almost none of the
declared device matrix**, and there are **zero unguarded above-floor APIs** in shipping code (the
floor holds). This handoff is the burn-down list.

**HARD CONSTRAINT (user-stated, governs every item):** any change to production code must have
**zero impact on supported-device performance or UX** and must **not leverage any new web APIs**. A
change may only *improve* behavior on old devices (at or below the floor edge). **If a candidate fix
cannot meet that bar, do not implement it** — document it instead. Doc-only and CI/test-only changes
are outside the constraint (they don't ship).

Non-goals: raising or lowering the floor; adding polyfills (ADR'd as none-required); refactors;
anything that changes what supported devices execute.

## State

* Branch `claude/device-compatibility-audit-c5iui2`, forked from `ef8c636` (main). No code commits —
  the audit produced findings only; this handoff is the first commit.
* Nothing else in flight; working tree was clean.

## The findings (work inventory)

### A. `docs/COMPATIBILITY.md` register refresh — doc-only, no constraint concerns

Stale `file:line` citations (guards were all verified still present; only locations drifted):

| Register row                | Cited                     | Actual                                                                              |
| --------------------------- | ------------------------- | ----------------------------------------------------------------------------------- |
| `getCoalescedEvents()`      | `engine.ts:651`           | `engine.ts:890` (written `?.() ?? []` + `[e]` on 891, not the quoted `?.() ?? [e]`) |
| `navigator.storage.persist` | `secureStorage.ts:154`    | `secureStorage.ts:177`                                                              |
| Wake Lock                   | `+page.svelte:56`         | `+page.svelte:130–134`                                                              |
| Screen Orientation lock     | `orientation.ts:48`       | `orientation.ts:50–55`                                                              |
| `screen.orientation.angle`  | engine.ts (unnumbered)    | `engine.ts:240`; listener guard `engine.ts:1322–1324`                               |
| `ResizeObserver`            | `ColorPalette.svelte:27`  | `ColorPalette.svelte:53`                                                            |
| `clipboard.writeText`       | `AdminConsole.svelte:122` | `AdminConsole.svelte:133`                                                           |
| `color-mix` (picker)        | `ColorPicker.svelte:427`  | `ColorPicker.svelte:443`                                                            |
| `100dvh`                    | `app.css:61`              | `app.css:28` (body) + `:70` (portrait)                                              |
| `backdrop-filter`           | `app.css:88`              | `app.css:97` (+ `ParentCenter.svelte:339–340`)                                      |
| `aspect-ratio`              | `app.css:221`             | `app.css:294`                                                                       |
| `env(safe-area-inset-*)`    | `app.css:52`              | `app.css:54–56`                                                                     |

Missing rows to add:

* **`<dialog>` + `showModal()`/`close()`/`::backdrop`** — core UI primitive, unguarded by design
  (like the PointerEvent row). `modalDialog.svelte.ts:122` plus six components (ColorPicker:118,
  ParentCenter:150, AiImagePrompt:49, AiImageResult:75, ColoringBook:101, AdminConsole:332).
  Baseline Chrome 37 / Safari 15.4 — within floor.
* **`requestIdleCallback`** — `idle.ts:7–9`, guarded (`typeof … === 'function'`, `setTimeout(200)`
  fallback). Never shipped in any Safari.
* **`getContext('2d', { willReadFrequently: true })`** — `emptyScan.ts:22`. Safari **16.4 exactly**
  (sits on the floor); below it the hint is ignored, no breakage.
* **`navigator.connection.saveData`** — `pwa/updates.ts:63`, guarded `?.`. Chromium-only.
* **Unprefixed `mask` / `mask-image`** — `DrawingCanvas.svelte:536`, `AiConfetti.svelte:50`. Needs
  Chrome **120** (above the 111 floor) but each is preceded by a `-webkit-` twin
  (`DrawingCanvas:531`, `AiConfetti:44`) so Chrome 111–119 uses the prefixed path. The one
  above-floor feature in the codebase — must be documented.
* **`color-mix` extra sites** missing from that row's "Where": `ClearButton.svelte:299–300`,
  `:318–319` (radial-gradient backgrounds, rgba fallback precedes each) and
  `ColoringBook.svelte:368` (tile label, fallback at `:367`).

Rows to amend:

* **`createImageBitmap(blob)`** and **`canvas.toBlob(…, 'image/webp')`** are also used in
  `lib/drawing/aiImage.ts:26` / `:38` (client-shipping upload transcode; try/catch → PNG fallback,
  and an explicit `webp.type === 'image/webp'` check at `:43`). Add to both rows' "Where".
* Optionally note `crypto.subtle.digest` at `aiImage.ts:56` on the `crypto.subtle` row, and add a
  footnote that `Object.hasOwn` in `lib/ai/prompt.ts` is **server-only** (imported only by
  `routes/api/generate-image`) so future audits don't false-alarm on it.

### B. Test-coverage gaps — CI/tooling only, no production impact

What the audit established: CI (`.github/workflows/test.yml:109–120`) installs and runs **chromium
only**; `web/playwright.config.ts:56–61` defines a single Desktop Chrome project; WebKit exists only
as `web/playwright.webkit-scratch.config.ts` (explicitly not in `npm test`) and the perf harness;
Firefox/Edge appear nowhere; Maestro smoke is tag-only and runs Android **API 33**
(`android-deploy.yml:70`, `scripts/lib/android.mjs:9`, `android-setup.mjs:14`) and the **newest**
iOS simulator (`scripts/ios-simulator-smoke.mjs:34–45` sorts newest-first). The testing skill
documents this design honestly — the gap is spec-vs-test, not drift.

Ranked fixes:

1. **WebKit Playwright project in CI** for a small critical-path subset (boot, draw a stroke, open
   Parent Center, one modal). Start from the scratch config. Expect friction: some E2E helpers use
   CDP viewport resizing (`web/tests/flows.spec.ts:1213`, `multitouch.spec.ts`) which is
   Chromium-only — the WebKit subset must avoid or fork those helpers. Get it passing locally
   (`npx playwright install webkit`) before wiring into `test.yml`.
2. **Pin (or add) an Android API 24 Maestro run** so the declared floor boots at least once per
   release tag. Check an API 24 system image is still available for the CI emulator action first.
3. **iOS 16.4 floor smoke** — likely infeasible on current GH macOS runners (old simulator runtimes
   generally can't be installed under new Xcode). If confirmed infeasible, don't force it: record
   the limitation in `docs/COMPATIBILITY.md` ("floor validated manually / via web CI's WebKit run")
   instead.

If any of these are deliberately deferred, file them as GitHub issues (the live backlog) rather than
leaving them only here.

### C. Production-code candidates — constraint verdicts

The audit found **no required production fixes** (nothing unguarded above floor). Candidates
considered, with verdicts against the constraint:

* **ColorPicker selected-swatch `color-mix` fallback** (`ColorPicker.svelte:443`, the register's one
  unguarded `color-mix`): adding a plain precomputed-rgba `background` declaration *before* the
  `color-mix` line is a pure cascade fallback — supported devices override it, below-floor devices
  keep a darken instead of losing it. **Meets the constraint** — allowed, tiny, cosmetic-only gain.
* **`getCoalescedEvents` alternative for iOS** (first real old-device degrade — chunkier fast
  scribbles on iPhone 8-class hardware): no fix exists without new APIs or interpolation logic that
  would run on supported devices too. **Fails the constraint — skip.**
* **Undo-snapshot memory pressure on old WebKit** (Safari PNG-only cold snapshots, ADR-0066): any
  mitigation (downscaling, re-encoding) changes supported-device snapshot behavior and fidelity.
  **Fails the constraint — skip**; ADR-0066's perf gate already owns this trade-off.

Anything else discovered while working: apply the same test — *does a supported device execute even
one different instruction or style?* If yes and it isn't a strictly-preceding fallback declaration,
skip it and document.

## Decisions made (and why)

* Audit ran as three parallel sweeps (JS APIs vs register, CSS, test coverage); enforcement configs
  (`web/vite.config.ts:78`, `package.json:303–309` browserslist, pbxproj `16.4` ×4,
  `variables.gradle` minSdk 24) verified **matching the spec exactly** — no config work needed.
* Deliberately changed no code during the audit so findings could be handed off with a clean tree.
* The constraint above was set by the user explicitly — it is the acceptance bar, not a preference.

## Unverified assumptions

* All `file:line` numbers above came from this session's sweep agents; they were spot-checked but
  **re-verify each citation while editing the register** (files move fast in this repo).
* Baseline browser versions quoted (unprefixed `mask` = Chrome 120, `willReadFrequently` = Safari
  16.4, `<dialog>` = Safari 15.4, Wake Lock Firefox 126, etc.) are from model knowledge — confirm
  against caniuse/MDN before committing them into the register.
* WebKit pass rate of the existing E2E suite is unknown; the scratch config has never gated.
* API 24 emulator image availability in CI, and iOS 16.4 runtime availability on GH macOS runners,
  were **not** checked.
* The claim "dev-harness routes don't ship by default" (`PUBLIC_ENABLE_DEV_HARNESS`) was taken from
  code reading, not a build inspection.

## Done & verified

* The four floor-enforcement configs read and confirmed in agreement with `docs/COMPATIBILITY.md`.
* Every guard claimed by the register was located in current code (locations in table A).
* Confirmed zero shipping usage of: `structuredClone`, `Array.at/findLast/toSorted`, `:has()`,
  `oklch`, container queries, `@layer`, native nesting, `text-wrap`, popover/inert, view
  transitions, `OffscreenCanvas`, `crypto.randomUUID`, `navigator.share`, `roundRect`, `ctx.filter`
  (explicitly avoided in `exportDrawing.ts:64–76`), and the rest of the modern-API checklist.
* No tests were run (nothing changed). `npm install` was clean at session start.

## Risks & next 3 steps

1. **Register refresh** (section A) in `docs/COMPATIBILITY.md` — re-verify each line number as you
   go, keep the table format, and remember Markdown is dprint-owned: run `npm run format:check`
   before committing.
2. **WebKit CI subset** (B1): make the scratch config's subset pass locally on webkit, then add the
   project + `playwright install --with-deps chromium webkit` to `test.yml`.
3. **Floor-version native smoke** (B2/B3): check runner support for API 24 / iOS 16.4; implement
   what's feasible, document what isn't. Then, if doing C's ColorPicker fallback, do it last as its
   own commit with a before/after check on a supported browser (identical rendering required).

Risks: WebKit CI flakiness/time (keep the subset minimal); CDP-only test helpers breaking under
webkit; citation drift between this handoff and HEAD by resume time; accidentally "improving" a
guarded path in a way that changes supported-device behavior (the constraint kills the change, not
the constraint).

## Reread first

* `docs/COMPATIBILITY.md` — the document being fixed; its "Maintaining this" section.
* `web/playwright.config.ts` + `web/playwright.webkit-scratch.config.ts` +
  `.github/workflows/test.yml`
* `.ruler/skills/testing/SKILL.md` (and note: skill/docs edits go through `.ruler/`, never the
  generated files — `npm run ruler:apply`)
* `scripts/ios-simulator-smoke.mjs`, `scripts/lib/android.mjs`,
  `.github/workflows/android-deploy.yml`
* `docs/adrs/` 0066 (undo snapshots / WebKit memory), plus the ADR index for 0050 (paper view) if
  touching engine-adjacent rows
* `web/src/lib/components/ColorPicker.svelte:443` (the one allowed production candidate)
