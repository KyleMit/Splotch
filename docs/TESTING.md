<!-- cspell:ignore Maestro maestro Vitest happydom apksigner swiftshader reactivecircus avds xcodebuild simctl -->

# Splotch — Testing Guide

Splotch's automated suites span three test layers. The app-unit, asset-pipeline, store-drawing,
repo-script, and E2E suites run on every push/PR, alongside the WebKit smoke job. The two-scenario
WebKit commit-timing gate runs post-merge, on pushes to `main`, because its verdict is a millisecond
P95 that needs WebKit and a quiet host; its full seven-scenario form and the real-device launch
tests run only on tagged releases. ADR-0100's 2026-08-11 amendment records why its obsolete
pre-merge blob-encoding guard retired.

| Layer                 | Tool                | Command                             | Runs in CI                                   |
| --------------------- | ------------------- | ----------------------------------- | -------------------------------------------- |
| Unit (app)            | Vitest (happy-dom)  | `npm run test:unit`                 | every push / PR                              |
| Unit (asset pipeline) | Vitest (Node)       | `npm run test:asset-gen`            | every push / PR                              |
| Unit (store drawings) | Vitest (Node)       | `npm run test:store-drawings`       | every push / PR                              |
| Unit (repo scripts)   | Vitest (Node)       | `npm run test:tools`                | every push / PR                              |
| E2E (web)             | Playwright          | `npm run test:e2e`                  | every push / PR                              |
| Smoke (API contract)  | Node + `vite dev`   | `npm run test:api:smoke`            | every push / PR (unit job)                   |
| Smoke (WebKit)        | Playwright WebKit   | `npm run test:webkit:smoke`         | every push / PR (parallel job)               |
| Smoke (Android)       | Maestro + emulator  | `npm run test:android`              | **tagged releases only** (API 33 + API 24)   |
| Smoke (iOS)           | Maestro + simulator | `npm run test:ios`                  | **tagged releases only** (macOS runner)      |
| WebKit commit timing  | Playwright WebKit   | `npm run perf:web:undo:webkit:fast` | pushes to `main`; full suite on release tags |

A separate `quality` CI job (type-check, ESLint, Prettier `--format:check`, and
`npm audit --audit-level=critical`) also runs on every push/PR alongside the tests — see Continuous
integration below. One more server-contract smoke test, `test:blobs:smoke`, runs against real
deploys rather than on every push.

`npm test` runs the first five (`test:unit` + `test:asset-gen` + `test:store-drawings` +
`test:tools` + `test:e2e`). The native smoke tests are intentionally **not** part of `npm test` —
they need an emulator/simulator and the native toolchains.

## A test that cannot fail is a lint error

A test that has only ever passed carries no evidence it is connected to anything, and a green suite
looks identical whether the coverage is real or vacuous. `npm run lint` catches that whole class on
every file, in the `quality` job, at no runtime cost. `eslint.config.js` scopes
`@vitest/eslint-plugin` onto `**/*.test.{ts,mjs}` and `eslint-plugin-playwright` onto
`web/tests/**/*.spec.ts`, and turns on the same six guards under each plugin's spelling: a test body
with no assertion, a committed `.only` (which silently skips the rest of its file), an unconditional
skip, an `expect` that never reaches a matcher, a retrying assertion whose promise is dropped
(`expect.poll`, a web-first assertion), and an assertion reachable only through a branch.

That last one is the only rule that constrains how a test is written. **A parametrized case states
its expectation as a value rather than branching around the assertion:**

```ts
// Not this — the assertion is skipped for half the table, and the skip is silent.
if (expected === 'shown') expect(label).toBeVisible();

// This — the case's own value drives the matcher, so every row asserts.
await expect(label).toBeVisible({ visible: expected === 'shown' });
expect(output.includes(hint)).toBe(scenario.wantsHint);
```

The other two shapes that replace a branch: narrow a union through an `asserts`-signature `expect*`
helper (`expectParsedBody` in `web/src/lib/server/http.test.ts`) rather than an `if` on the
discriminant, and split a case that asserts something genuinely different into its own parametrized
block (`web/src/lib/components/Icon.svelte.test.ts`) — pairing the split with a test that the two
lists still partition the input, so an exception naming something that no longer exists fails rather
than quietly emptying a block.

Helpers named `expect*` count as assertions, so a test that delegates is not read as assertion-free.
Conditional skips (`test.skip(!!process.env.DEV_SERVER, '…')`) stay allowed — that is the supported
way to gate a spec on the environment.

The rules themselves have the same failure mode as the tests they police: one scoped to a glob
nothing matches reports nothing, which is indistinguishable from a clean repo.
`tools/tests/vacuous-test-lint.test.mjs` is the positive control — it seeds each defect and asserts
the rule fires, and pins what each deliberate relaxation lets through. Extend it when you add a
rule.

## Server-contract smoke tests — `test:api:smoke`, `test:blobs:smoke`

Two Node smoke tests guard the server contract:

* **`test:api:smoke`** boots a throwaway `vite dev` and checks the `/api/*` shapes (admin auth flow,
  bearer gate, token add/remove, `verify-access-code`) plus the CORS/preflight contract the native
  apps depend on. No Blobs, so it asserts the snapshot's `persistent` is `false`. CI runs it in the
  browserless `unit` job on every push/PR; run it locally after any endpoint change (see the `api`
  skill).
* **`test:blobs:smoke`** runs against a **real deploy** to prove Netlify Blobs is actually live on
  the deployed function — the failure mode of ADR-0025, which the local `vite dev` tests
  structurally cannot catch:
  ```bash
  BLOBS_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
  ADMIN_ACCESS_TOKEN=… npm run test:blobs:smoke
  ```
  It asserts `persistent:true`, round-trips a unique token through Blobs, and cleans up. Run it on a
  PR's deploy preview before merging any adapter/Netlify-config change, and against
  `https://splotch.art` to confirm prod.

---

## Unit tests — Vitest

```bash
npm run test:unit          # one-shot
npm run test:unit:watch    # watch mode
```

Configured in `web/vitest.config.ts`. Environment is **happy-dom** (not jsdom). Covers the pure
logic + state modules (`colorRing`, `state/*`, `storage`, including the native dual-layer hydrate
via a mocked `@capacitor/preferences`).

Files that need no DOM at all — `lib/server/**` and pure-logic modules — carry a
`// @vitest-environment node` first line so they skip the per-file happy-dom setup (the suite's
biggest fixed cost). Keep the happy-dom default for any test whose module (or its imports) touches
`localStorage`, `document`, or `window` — running those in `node` would silently switch the code
onto its non-browser fallback paths.

Vitest aborts a timed-out test's context signal, but it cannot cancel the callback's underlying
async continuation. A unit test that polls through real timers and can later touch shared or global
mocks accepts `{ signal }` and calls `signal.throwIfAborted()` after every `await` before
continuing. Without that guard, teardown can install the next test's globals while the timed-out
callback keeps running, producing secondary mock-count failures in a test that did nothing wrong.
Prefer fake timers when they represent the behavior faithfully. If a cold dynamic import alone
exceeds the default timeout on a contended shared host, scope a named larger timeout to that one
test — never raise the whole file's timeout with `vi.setConfig`.

## Asset-pipeline unit tests — Vitest

```bash
npm run test:asset-gen
```

Configured in `tools/asset-gen/vitest.config.mjs`. These run in Node against committed fixtures and
mocked generator workflows, with no model calls or network access. CI runs them in the browser-free
`unit` job, after the app-unit suite and alongside the repo-script suite, in parallel with the e2e
shards.

## Store-drawing pipeline unit tests — Vitest

```bash
npm run test:store-drawings
```

Configured in `tools/store-drawings/vitest.config.mjs`. These run in Node against the committed SVG
samples and static instruction module. They cover the supported SVG subset, coordinate fitting,
closed width/color vocabularies, and exact generator drift without launching a browser.

## Repo-script unit tests — Vitest

```bash
npm run test:tools
```

Configured in `tools/vitest.config.mjs` (Node env), tests in `tools/tests/`. Covers repo automation
helpers whose regressions would be silent — currently the audit-burndown `docs/AUDIT.md` surgery in
`tools/audit-burndown/lib/burndown-core.mjs` (entry-boundary parsing, pure block removal,
dprint-clean seams; see the `burn-down-audits` skill) and complete runner-specific skill replacement
in `tools/ruler/apply-skill-forks.mjs` (package isolation, paired-runner coverage, and shared-source
collision guards). The latter covers generic Ruler-managed forks; packages listed in
`tools/ruler/lib/direct-provider-skills.mjs` are maintained directly in their declared provider
trees and excluded from Ruler drift ownership. `tools/ruler/apply-ruler.mjs` snapshots and restores
every registered path around generation, including its failure path. Add a test here when a `tools/`
helper's failure mode is corrupting state rather than crashing.

The suite also hosts the **drift guards** over things prose can't keep in agreement —
`e2e-engine-tags.test.mjs` and `e2e-harness-imports.test.mjs` over the specs themselves, and
`skill-spec-citations.test.mjs` over the docs: every `tests/…` path an agent-instruction file names
must resolve to a real file in `web/tests/`, so a spec split can't strand a documented command that
then selects zero tests. The scan covers the skill trees, every `CLAUDE.md`/`AGENTS.md`, and the
audit-burndown role prompts. Globs and placeholders (`engine-*.spec.ts`, `tests/<name>.ts`) read as
prose and are skipped; design history — skill notes, ADRs, `docs/AUDIT.md` — is outside the scanned
surface on purpose, as is any non-Markdown source, whose spec names are indistinguishable from the
synthetic ones the `tools/tests/` fixtures feed their reporters.

## E2E web tests — Playwright

```bash
npm run test:e2e           # headless — whole suite
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:headed    # headed, slowed down (SLOWMO=500)
npm run test:e2e:debug     # inspector

# one spec / one title, not the whole suite (trailing args pass through to Playwright):
npm run test:e2e -- flows-undo-persistence.spec.ts -g "the undo button enables on a stroke and reverts it"
```

For ad-hoc validation of a single change, filter through the npm script — **not** raw
`npx playwright test` from the repo root. The config + `baseURL` live in `web/`, so raw `npx` from
the root navigates to an empty `baseURL` (`Cannot navigate to
invalid URL`) and also loses the
Chromium fallback (cryptic `chrome-headless-shell` error in cloud). `node tools/run-web-tool.mjs`
sets the `web/` cwd and Chromium path for you, and forwards everything after `--` to Playwright.

Configured in `web/playwright.config.ts`. By default it builds the production artifact and serves it
with `vite preview` (set `DEV_SERVER=1` for fast iteration against `vite dev`). Specs live in
`web/tests/` and exercise the real drawing engine, the responsive palette, and the full UI flows.

These run on real Chromium but **cannot catch native or WebView boot failures** — that's what the
Android smoke test is for.

### Flake-hunting protocol

Start discovery at the repository's supported CI contention level: one worker per logical CPU
available to the process (ADR-0078), with retries disabled. Read that count with
`node -p "require('node:os').availableParallelism()"`, then run at least three independent full
suites through the sweep driver:

```bash
npm run test:e2e:sweep -- --workers=<printed count> --reps=3 --out=/tmp/splotch-e2e-discovery
```

The driver builds once, unsets the CI variables that enable retries, and lets Playwright start a
fresh preview server for every repetition. That fresh server is part of the protocol: the suite
fills server-side rate-limit windows, so a shell loop against one long-lived server manufactures
failures that the next real run would never inherit.

Use this sequence for a suspected flake:

1. Reproduce the failure on the pre-fix code at the supported CI worker count. Record the failing
   product state, not only the assertion text.
2. Decide whether the timing window is reachable by a real user. Contention can amplify either a
   test-harness race or a product bug; a failure under stress alone does not classify it. Fix the
   product when a user can reach the bad state. Otherwise make the spec wait for the durable outcome
   its next operation actually needs.
3. Keep the pre-fix reproduction as evidence, then run a focused diagnostic amplifier with retries
   disabled, for example
   `npm run test:e2e -- <spec> -g "<title>" --workers=<higher count> --retries=0 --repeat-each=10`.
   Higher-than-supported worker counts are diagnostic amplification only, never a new default.
4. Verify the outcome-based fix with that focused amplifier, then run at least three clean
   full-suite repetitions through `test:e2e:sweep` at the supported CI worker count. Use the sweep
   for any stateful or full-suite repetition so every repetition gets fresh server state.

A clean streak is validation, not proof of a zero flake rate. Report the sample size and contention
level so a later recurrence can update the evidence instead of contradicting an absolute claim.

### Writing flake-resistant specs

The full suite runs parallel workers, derived from the machine rather than hardcoded: a worker costs
~2 cores, so capacity is **`cores / 2`** — local runs sit there and CI goes to **twice** it, i.e.
`cores` (`playwright.config.ts`, ADR-0078; on the 4-core boxes measured, 2 and 4). So every spec
shares the CPU with the others, and a test that passes alone but fails in the full run is almost
always a timing race under that contention, not a real regression. Locally `retries: 0` surfaces it
immediately; CI retries, so a flake can still ship green — which is why a retried pass is annotated
(`playwright-flaky-reporter.ts`) rather than left silent in the log of a job nobody opens. Write
specs that can't race in the first place:

* **Never assert on a single interaction against a lazily-wired control.** Overlays that idle-mount
  (Settings, ADR-0049) can drop the first click before their handler is attached, so a bare
  `.click()` + `expect(modal).toBeVisible()` flakes. `tests/helpers.ts` exports a shared
  `retryOpen(ready, open, opts?)` primitive for this — it retries `open()` until `ready` shows,
  skipping the click when it is already open. The ready locator must be durable: prerendered or
  native behavior must not be able to satisfy it before hydration and then reset it. Either wait on
  a hydration-only sentinel before interacting (the Beta page's on-mount-only support link and
  `openHydratedContents`' computed panel cap are examples), or retry the complete action plus its
  durable product outcome as one transaction. `openSettingsModal` (also `tests/helpers.ts`) and
  `openDrawer`/`openBrushMenu`/`openColoringDialog`/`openParentalGate` (`tests/flows-harness.ts`)
  are all one-liners over `retryOpen`. Reach for one of those contracts (or wrap the complete
  open-and-outcome transaction in `expect(...).toPass()`) rather than repeating a bare click or
  treating transient visibility as readiness.
* **A view an overlay picks *at open time* can't be waited into — reopen it.** Retrying an assertion
  only works while the thing asserted on is still coming; when the open itself chose a different
  view, no timeout reaches it. `ColoringBook` picks between its book grid and a single book's pages
  in `onOpen`, from an installed set that resolves asynchronously after load (a manifest fetch plus
  a store scan), and re-picks only if the active book disappears — so a picker opened a beat too
  early shows the starter book's pages and *stays* there, which is how "no viewport draws a cover
  smaller than four columns" came to fail with the cover grid simply absent (issue \#936). The
  sentinel to retry the open against is the view you need, not the dialog: `openColoringBookGrid`
  (`tests/flows-harness.ts`) closes and reopens until an open lands on the grid, since each open
  re-reads the installed set. Prefer it over `openColoringDialog` in any spec that then reads a book
  cover, and seed the page with `gotoAppWithInstalledColoringBook`/`…AllColoringBooksInstalled` so
  there is a grid to land on — a spec that means to exercise the fresh-install view drives the
  dialog directly instead (`coloring-pack-download.spec.ts`).
* **No fixed `waitForTimeout` to wait for something to *happen*.** Use a web-first assertion that
  retries until the condition holds (`expect(locator).toBeVisible()`, `expect.poll(() => …)`,
  `expect(...).toPass()`). A fixed sleep is only legitimate when it is **monotonic-safe under
  load**: (a) deliberately idling *past* a known threshold to reproduce a timing bug (e.g. the
  stroke-resume gap in `engine-pointer-recovery.spec.ts`), or (b) proving a *negative* — that state
  must **not** change within a window (e.g. the "SW never registers" check in
  `pwa-registration.spec.ts`). A slower worker only lengthens the real wait in both cases, so they
  can't false-red. Comment the reason when you keep one.
* **Use the drawing app's durable ready state.** `gotoApp()` does not return merely because the
  prerendered `#drawingCanvas` is visible: it waits for the hydrated drawing debug seam and a
  non-zero rendered composite. Specs intentionally covering first paint or hydration navigate with
  `page.goto()` so the shared postcondition stays strong. Use `drawCommittedStroke` when setup
  requires one durable command: it retries input only while the renderer's monotonic stroke revision
  proves that the previous attempt produced neither a pending nor a committed stroke, so a slow
  commit cannot become a duplicate stroke. Keep the visual or product-specific assertion in the
  spec.
* **Poll async render/canvas state; size the window for a *starved* worker.** Canvas reveals and
  debounced relayouts settle asynchronously and lag hard under contention. The magic brush samples a
  sheet that rasterizes async, holding a stroke's ops out of the paper until a fold-in repaint
  (`REVEAL_SETTLE_MS` in `flows-magic-brush.spec.ts`); the engine debounces resize by
  `RESIZE_SETTLE_MS`. Use `expect.poll` with a generous timeout, not a one-shot
  `await page.evaluate(...)` + `expect(...)`.
* **Read reactive/engine state *through* a retrying assertion.** `expect(await count(page)).toBe(n)`
  reads exactly once and races the repaint; `await expect.poll(() => count(page)).toBe(n)` waits for
  it to settle. Same for `getViewState()`/`pixelAt()` reads after a rotation.
* **A sequence that must land inside a timing window must retry as a whole.** A triple-tap that has
  to fall inside dragToClear's 1000ms multi-click window (`clear-tutorial.spec.ts`) can straddle it
  under load — wrap the entire burst in `toPass()`, don't just add a longer wait between taps.
* **A mocked endpoint control resolves after delivery, not after queuing.** If a helper exposes
  `succeed()` or `fail()`, resolve that control only after the intercepted handler's awaited
  `route.fulfill()` completes. Queuing a response does not prove the page has received it, so an
  assertion started from that signal races the network operation it means to observe. Keep the
  delivery handshake beside the mock that owns it; do not create a generic route-controller
  abstraction without a second honest caller.
* **Pace synthetic gesture phases on rendered frames.** Touch start, dependent moves, and touch end
  can be delivered to the compositor as one coalescible burst under load even when arbitrary
  wall-clock sleeps separate them in the test process. Advance a phase with `requestAnimationFrame`
  in the page when the next phase depends on compositor observation. Keep that pacing local until a
  second real caller earns a narrowly named helper; do not introduce a generic `nextFrame` or
  `waitForStable` abstraction.
* **A control's UI state commits a tick before the imperative engine adopts it, so wait on the
  engine.** The tool buttons update `aria-pressed` reactively, but the engine enters that mode
  through a Svelte `$effect` (`setMagicMode` in `DrawingCanvas`), so `aria-pressed=true` does not
  prove the engine switched, and a stroke drawn in that window would commit under the previous brush
  — already painted before anything can observe it. `pickBrush()` closes it by polling the engine's
  own `window.__committedBrushMode` (the dev-harness seam in `lib/boot/devHarnessSeam.ts`,
  ADR-0080); prefer that shape — a signal for the state you actually depend on — over retrying an
  action until its effect appears. Where you must assert instead, pick a metric a wrong-mode action
  can't satisfy: a canvas-fill pixel count is not one, since a pen stroke fills the band too.
* **Let a fly-in dialog land before reading a coordinate off it.** A real Playwright `.click()`
  waits for its target to stop moving; an `evaluate` that reads `getBoundingClientRect()` and
  dispatches synthetic pointer events there does not. `dialogFlyFromOrigin` (app.css) starts a modal
  at `scale(0.05)` **on the button that opened it**, and `modalDialog` arms a launch dead zone at
  that same point (`launchGuard`: 72px, 600ms) whose capture-phase `pointerdown` handler swallows
  everything inside it — dialog content included, by design (issue \#308's ghost click). So for the
  opening frames the whole dialog sits in the dead zone: Settings' content pane centers **6px** from
  the launch origin at the first keyframe and only clears the radius ~13ms into the animation. A CSS
  animation advances with *rendered frames*, so a starved worker parks the dialog on that keyframe
  for far longer than 13ms of wall clock, and the gesture is aimed straight into the guard and
  silently does nothing. That was issue \#665 — the three zoom/pinch specs that were the entire
  residual flake rate (ADR-0078 §4), all failing as "the pinch produced no zoom". The fix is to
  await the dialog's `Animation.finished` before reading any coordinate off it — `openSettingsModal`
  does this, which puts the pane 574px from the origin and removes the dependency on animation
  progress instead of timing it. Three other dialogs carry `modal-fly-in` (`#color-picker`,
  `#coloring-book-dialog`, `.ai-prompt-modal`); the helper is private to `tests/helpers.ts` until a
  second caller needs it, so lift it there rather than copying the wait. Query `getAnimations()` on
  the dialog element alone — the fly-in animates it directly, and `{ subtree: true }` would start
  waiting on unrelated descendant animations too.
* **Budget a frame-paced condition in frames, not milliseconds.** The wide Settings pane mounts one
  section per frame once the card lands (issue \#910), and `aria-busy` clears only when the last one
  is in — so the wait for it is on the fill's clock, which is the frame. Playwright's assertion
  timeout is wall clock, and contention stretches a frame without adding any, which is how the
  default 5s cap on `expect(pane).toHaveAttribute('aria-busy', 'false')` came to fail a WebKit smoke
  run three times over on a fill that was merely unfinished (issue \#918 — the `web/` tree under
  test was byte-identical to a green `main`). `settleSettingsPane` (`tests/helpers.ts`) samples the
  attribute from inside the page once per `requestAnimationFrame` and gives up only after
  `SETTINGS_FILL_FRAME_BUDGET` frames, so a starved worker costs it wall clock and nothing else, and
  the budget still bounds a fill that has genuinely stopped. Sampling from inside the page is half
  the point: a round trip to the test process measures the harness, and on a starved worker one can
  span the whole fill. Reach for the same shape wherever the thing being waited on advances with
  rendered frames — and note this is the *complementary* half of the bullet above: a CSS animation
  runs on rendered frames too, but it exposes `Animation.finished`, so there you await the browser's
  own signal instead of counting.
* **A modal open is not the only thing that arms a dead zone.** `launchGuard.guardTapZone` is armed
  by any tap that repaints something else under the finger, so a spec can be swallowed well after
  the fly-in has landed. `ColoringBook` arms one when a book cover swaps the grid for that book's
  pages, which is exactly where a spec then clicks a page tile — two specs went red on the first run
  of that guard. `flows-harness`'s `settleTapGuard(page)` idles past the window (it is one of the
  few legitimate fixed sleeps: a known duration, and a zone self-clears on the next query rather
  than exposing state to poll), and `openFarmPageGrid` already calls it so its callers don't have
  to. When a click at a just-tapped point mysteriously does nothing, check for a zone before
  suspecting the control.
* **Drive strokes through `draw`/`dragStroke`, never a hand-rolled run of `mouse.move`s.** The
  engine reads a sample far from the previous one and more than `POINTER_RESUME_GAP_MS` later as a
  finger that lifted and set down (`strokeMath.pointerWasResumed`), restarts the stroke there, and
  never paints the span between — so under contention a four-point sweep can come back as its start
  dot alone. A starved worker owns the timing half of that predicate; the helper holds the other
  half by subdividing every hop with `mouse.move`'s `steps`, sized from `POINTER_RESUME_JUMP_RATIO`
  imported from the engine's own module (ADR-0080).
* **Calibrate a discriminating threshold against measured distributions on *both* sides.** The magic
  reveal's colour count had to reject a flat pen pass (measured 1-3 buckets) and accept a rainbow
  slice (measured min 3 at the old quantization) — the two overlapped, so a correct reveal failed a
  few percent of the time and no retry could help, since a redraw repaints the same gradient. Sample
  both populations before picking the number, and leave margin on each side, rather than reasoning
  about what the value "should" be.
* **Shared per-test setup belongs in a fixture, never in a helper module's top-level
  `test.beforeEach`.** A helper is evaluated once per worker process, so a hook it registers at
  import time attaches only to the *first* spec file in that worker that imports it; every later
  spec file gets no setup at all and runs against `about:blank`. That was issue \#624 — ~12
  `/dev/engine` specs "flaking" with a missing `#drawingCanvas` or an undefined `window.__engine`,
  green on retry (a retry re-runs the file alone) and green in isolation. Extend `test` in the
  helper instead (`base.extend({ page: async ({ page }, use) => { …setup…; await use(page) } })`,
  see `tests/engine-harness.ts`) and have specs import `test`/`expect` from the helper;
  `tools/tests/e2e-harness-imports.test.mjs` fails the build if one imports `test` from
  `@playwright/test` instead.
* **Prove it's fixed under load, not in isolation.** Flakes only appear under contention, so verify
  with `npm run test:e2e -- <spec> --repeat-each=10` (which still fans out across the configured
  workers) before trusting green — a single isolated pass proves nothing. A stubborn one may only
  show every ~1-in-5 runs; raise `--repeat-each` until you've seen it both fail on the old code and
  hold on the new.

### WebKit critical-path smoke — `tests/webkit-smoke.spec.ts`

The full suite is Chromium-only, but Safari/iOS is the engine `docs/COMPATIBILITY.md` worries about
most, so a tiny critical-path subset (boot, draw a stroke, Settings dialog, Color Picker dialog)
also runs on **WebKit** as the `webkit` Playwright project:

* The project only joins the run when the WebKit binary is installed
  (`npx playwright install --with-deps webkit`) — local checkouts and cloud sessions with Chromium
  only keep working, and **CI installs WebKit explicitly** (`test.yml`), so the subset always gates
  pushes/PRs there. Run it alone with `npm run test:webkit:smoke`.
* In CI it is its own `webkit-smoke` job, parallel to Tests, rather than a project inside the Tests
  run. WebKit's apt dependencies pull the whole GStreamer/ffmpeg media stack — ~110 packages the
  Chromium suite doesn't need — and unlike the browser binaries they can't be cached, so that
  install lands on every run. Off the critical path it costs nothing; inside Tests it cost ~40s per
  run for four tests. That's also why Tests passes `browsers: chromium` to the `setup-playwright`
  action: it *relies* on WebKit being absent so the project drops.
* Both Ubuntu jobs get their browsers from `.github/actions/setup-playwright` (browser cache +
  `install-deps`, keyed per browser set); macOS keeps its own `setup-playwright-webkit`, which needs
  no apt step and caches elsewhere.
* **Routing is by tag, not filename.** `WEBKIT_ONLY_TAG` (`tests/tags.ts`) sits on the spec's
  `test.describe`; the `webkit` project `grep`s for it and `chromium` `grepInvert`s it, from the one
  shared constant. The two projects are therefore exact complements — a test runs on exactly one
  engine. To add WebKit coverage, tag it; a new spec with no tag runs under Chromium wherever it
  lives.
* **Import the tag, never type it.** Playwright validates no tag, so a hand-written `@webkti-only`
  matches neither project and runs under Chromium alone — and the WebKit job stays green, because
  the correctly tagged specs still populate it. Only editing the shared constant to match nothing
  fails loudly (`No tests found`). `tools/tests/e2e-engine-tags.test.mjs` covers the gap: it rejects
  a tag string literal and any tag not exported by `tags.ts`, and asserts at least one spec still
  carries `WEBKIT_ONLY_TAG`.
* Keep the spec WebKit-portable: no CDP sessions (`rotateViewportViaCdp` in `tests/cdp.ts` and the
  `touchDriver` in `tests/settings-zoom.spec.ts` are Chromium-only), no dev-harness routes, no
  assertions tied to Chromium's rasterizer. Chromium skips the tagged specs — their coverage is
  already in the full suite.
* `web/playwright.webkit-scratch.config.ts` stays for ad-hoc "run *any* spec under WebKit"
  debugging; it is still not part of `npm test`.

CI runs current WebKit, not the floor's Safari 16.4 — it proves engine-family coverage, not the
floor version or a native iOS boot. The declared bundle target has separate drift coverage, while
native iOS 16.4 remains a manual/device concern; see `docs/COMPATIBILITY.md` for the exact boundary
and hosted-run evidence.

### Accessibility tier — axe-core scans (`tests/a11y.spec.ts`)

The **adult-facing surfaces** get an automated axe-core scan (`@axe-core/playwright`, a
devDependency per ADR-0070 — CI-only tooling, never in the Netlify build) as part of the normal E2E
run — no separate command or workflow:

* **What's scanned:** `/privacy`, `/changelog`, `/admin` (logged-out *and* logged-in, via the
  `test-admin-secret` web-server key), and Settings dialog opened over `/`.
* **What's deliberately not:** the drawing canvas and toddler-facing chrome. Toddler UX (giant
  wordless buttons, no reading order) isn't WCAG's model, so Settings scan is **scoped to
  `#settingsModal`** via `AxeBuilder.include()` instead of scanning the whole drawing page.
* **The gate:** only violations with impact `serious` or `critical` fail the test, but the failure
  message prints *every* violation axe found (id, impact, offending selectors, fix hints), so the
  moderate/minor tail is visible in any red run.
* **Adding a surface:** add a test to `tests/a11y.spec.ts` that navigates (or opens the overlay),
  waits for a stable element, and calls `expectNoSeriousViolations(page)` — pass a CSS selector as
  the second argument to scope the scan when the surface is an overlay above toddler chrome.
* **Fixing vs suppressing:** fix violations in the app source. Only suppress (axe `disableRules` or
  an exclusion) for a genuine false positive or an unfixable-by-design case, each with a comment
  saying why.

### Cloud session gotchas

* **`Executable doesn't exist … chromium-<rev>`** — the env's cached Chromium revision drifted from
  the one this Playwright version wants. `playwright.config.ts` and the `run-splotch` driver now
  self-heal: if the pinned binary is missing they fall back to any Chromium under
  `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`). Override the pick with
  `PLAYWRIGHT_CHROMIUM=/path/to/chrome`. **Never** run `npx playwright install` in a cloud session.
  The permanent fix is keeping `.claude/cloud/setup.sh`'s browser install pinned to this package's
  `@playwright/test` version (it now derives it from `package.json`). See `docs/CLOUD/Claude.md`.
* **`DEV_SERVER=1` is unreliable in cloud** — global-setup has hit `window is not defined` (SSR) /
  `/dev/engine never became ready` there. Use the default production-build path (just
  `npm run test:e2e`); it's slower per run but works.

---

## Native deployment smoke test — Maestro (Android + iOS)

### What it does and why

The web E2E suite runs in a browser, so it can't tell you whether the *shipped native app* actually
boots. The smoke test fills that gap: it installs the app on a real Android emulator or iOS
simulator, launches it, and asserts that the UI renders — proving the Capacitor WebView started
**and** loaded the production web bundle (not a white screen or a crash).

The assertion is a single, meaningful signal: the **"Settings"** button (the always-present corner
button, `web/src/lib/components/SettingsButton.svelte`) must become visible. Seeing its
accessibility label means real UI painted, not just that the process launched.

That the flow stops there is a decision, not an omission — **ADR-0120**. Steps that navigated the UI
broke on a UI change within three releases every time they were added, and because these workflows
are tag-only, each break surfaced as a red release gate instead of a failing PR. Coverage of what
the UI *does* belongs in Playwright, which runs on every push and can select elements properly. Do
not grow this flow; `tools/tests/native-smoke-flow.test.mjs` fails on `npm test` if it selects a
string the app no longer renders, or selects by pattern instead of by exact label.

### The flow

The test itself is a declarative [Maestro](https://maestro.dev) flow — `.maestro/smoke.yaml`:

```yaml
appId: art.splotch.app
---
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible: 'Settings'
    timeout: 30000
- takeScreenshot: .maestro/screenshots/smoke-launch
```

`takeScreenshot` writes `smoke-launch.png` under `.maestro/screenshots/`; it's git-ignored. On CI
the whole Maestro report — flow log plus the screenshot taken at a failing step — is uploaded as a
build artifact, and a failure on a **tag** push files or comments on a GitHub issue, since nobody is
watching a tag-triggered run at the moment it goes red.

### npm scripts

```bash
npm run test:android          # headless one-shot: boot → build+install → test → tear down
npm run test:android:device   # run against an emulator you already have running
npm run test:ios              # one-shot on the iOS simulator (macOS + full Xcode)
```

| Script                | What happens                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `test:android`        | Runs `tools/mobile/android/run-smoke-test.mjs`: boots a **headless** `Pixel_7_Pro_API_33` emulator (`-no-window …`), builds + installs (`cap:sync` then `./gradlew :app:installDebug`), runs Maestro, and **always** kills the emulator afterward — even on failure. Self-contained and self-cleaning. |
| `test:android:device` | Just `maestro test .maestro/smoke.yaml` against whatever device is already connected. Fast inner loop — you boot the emulator and install the app yourself. This is what CI uses.                                                                                                                      |
| `test:ios`            | Runs `tools/mobile/ios/run-simulator-smoke-test.mjs`: reuses a booted iPhone simulator (or boots the newest available one), builds the debug app with `xcodebuild`, installs via `simctl`, runs the same Maestro flow, and shuts the simulator down if the script booted it. No signing required.      |

> The smoke scripts are device-lifecycle glue only — Maestro does the actual assertions, and both
> platforms run the **same flow file**. The Android helper works on macOS and Linux (AVD name and
> SDK locations resolve per-platform in `tools/mobile/android/lib/android-toolchain.mjs`; override
> the SDK with `ANDROID_HOME`); the iOS helper is macOS-only and fails fast elsewhere. Maestro's
> install location resolves in `tools/mobile/lib/maestro.mjs`.

For a manual iOS floor check, boot an iOS 16.4 iPhone simulator, shut down any other booted iPhone
simulators, and run `npm run test:ios`; the helper reuses that booted device. The tag workflow stays
on the newest installed runtime because hosted experiments could download, boot, and build for iOS
16.4 but Maestro's XCTest driver never became reachable there. `docs/COMPATIBILITY.md` records both
experiments and the complementary current-WebKit CI coverage.

### Prerequisites

1. **Android toolchain** — the same one used to build the app: Node ≥ 22, full JDK 21, and the
   Android SDK. See the `mobile` skill and the `android:*` scripts.
2. **An AVD** — the scripts default to `Pixel_7_Pro_API_33`. List yours with `emulator -list-avds`.
3. **Maestro CLI** — see below. Needs Java 17+ (the JDK 21 above covers it).

> On macOS/Linux, `npm run android:setup` provisions all three (system image, the
> `Pixel_7_Pro_API_33` AVD, **and** Maestro) and is safe to re-run — it skips whatever is already
> present.

### Installing Maestro

Maestro is **not** an npm package, so it can't be a dev dependency — it's a standalone JVM-based CLI
installed separately.

**macOS / Linux:** `npm run android:setup` installs it automatically (re-run it if Maestro is
missing). To install it on its own:

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
# adds the binary to ~/.maestro/bin
```

> Use `get.maestro.mobile.dev` — `get.maestro.dev` does not work.
>
> The smoke scripts resolve Maestro via `tools/mobile/lib/maestro.mjs` (PATH first, then
> `~/.maestro/bin`), so they run even before you reopen your shell to pick up the PATH entry the
> installer adds.

### Running it locally

```bash
# Simplest — one command, nothing to clean up:
npm run test:android

# Fast iteration — boot once, run many times:
npm run android:emulator        # boot + build + install (or: boot an AVD, then npm run android:run)
npm run test:android:device     # re-run as often as you like
```

---

## Continuous integration

| Workflow                               | Trigger                                                          | What it runs                                                                                                                                                        |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/test.yml`           | every push to `main`, every PR, **`v*` tag push**                | quality, unit, and sharded e2e jobs on branch/PR events, plus the parallel WebKit smoke job; fast WebKit commit gate on pushes to `main`; full gate on release tags |
| `.github/workflows/android-deploy.yml` | **`v*` tag push** + manual `workflow_dispatch`                   | One test-signed Android Release APK build + Maestro boot-smoke matrix on current API 33 and the API 24 floor                                                        |
| `.github/workflows/ios-deploy.yml`     | **`v*` tag push** + manual `workflow_dispatch`                   | iOS Release simulator compile without store signing + Debug Maestro boot smoke (macOS runner)                                                                       |
| `.github/workflows/blobs-smoke.yml`    | Netlify `deployment_status` success + manual `workflow_dispatch` | Netlify Blobs persistence round-trip (ADR-0025)                                                                                                                     |

Inside `test.yml`, every job runs on its own runner in parallel — runner minutes are free on this
public repo, wall clock is not. The Vitest suites (`test:unit` + `test:asset-gen` +
`test:store-drawings` + `test:tools`) run in a browser-free `unit` job, and the Playwright e2e suite
runs as a three-way `--shard=N/3` matrix in `Tests` — each shard builds the app itself (a shared
build artifact was measured slower: it serializes shards behind `needs:`), and each uploads its own
`playwright-report-shard-N` artifact. The app-driver smoke rides shard 1 only. With `fullyParallel`
on, `--shard` deals out individual tests (not files) in a deterministic order, balanced by count and
blind to duration — so the longest shard is bounded by the slowest single test, which lives among
the deliberately heavy stress tests of `tests/flows-tile-history.spec.ts` (the header comment there
explains why their cost is intrinsic).

The `blobs-smoke` workflow needs a repo secret `ADMIN_ACCESS_TOKEN` matching the deploy's admin
secret; without it the job fails at the login step. The iOS smoke mirrors Android but on a
`macos-latest` runner — the debug build targets the simulator, so no signing secrets are involved.

ADR-0100 originally split the commit gate into a structural Chromium half and a WebKit timing half.
The structural half asserted that the deleted snapshot/blob history never ran `engine.encode` inside
a commit. Tiled history (ADR-0085/0086) has no encode path, so that pre-merge job and command
retired instead of passing vacuously.

**Post-merge**, on pushes to `main`, the `webkit-commit-gate-fast` job keeps the `COMMIT_GATE_MS`
P95 verdict over `multi-finger` (the sole multi-pointer exerciser) and `crayon-scribbles` (the sole
mid-stroke pass-split exerciser) on `macos-latest`. That verdict genuinely needs a faithful engine
and absolute milliseconds, and it is expensive: it was the wall-clock floor of a pull-request run,
so it remains off that path. A failure opens a GitHub issue with the run link and diagnostics,
commenting on the existing open one rather than filing per red commit.

**Release tags** run all seven scenarios.

A timing breach, an incomplete or unknown requested scenario, or a bundle with no `engine.commit`
samples fails the job. Every tier attempts to upload `undo-scenarios.json` and `undo-scenarios.md`
after a failure; an early build/browser failure may leave no reports, which warns without masking
the original error.

The workflow's concurrency group folds `github.sha` in for `push` events. Pull requests still
collapse per ref so a new push cancels the run it supersedes, but back-to-back merges no longer
cancel each other — which would drop a commit's only WebKit coverage exactly when merge traffic is
highest.

The fast tier evaluates `multi-finger` against raw `engine.commit` P95. For `crayon-scribbles`, it
divides raw commit P95 by the same run's renderer slowdown from `engine.draw total / calls` against
the controlled healthy reference. That control distinguishes a new commit-only full-raster shape
from a shared macOS host slowing every crayon canvas operation. The 25 ms gate remains unchanged;
the release and on-demand full tiers continue to use raw absolute timing for every scenario. The
JSON and Markdown diagnostics retain raw P95, maximum, samples, control, factor, and gate value.

`FAST_UNDO_SCENARIO_KEYS` is the fast set's only declaration. A repo-script unit test derives sole
exercisers from every scenario's declared paths and requires each one in that set. Release runs also
restore and update the durable `webkit-undo-full-history` artifact: the harness records each
scenario's measured-to-budget ratio, recomputes ideal membership from the three most recent full
runs, and records whether the fast tier would have caught a breach. Membership drift and two
consecutive fast-set misses fail the full job; the updated history and full diagnostics upload even
when that check fails. Invalid restored history falls back to the compatible seed, and a full run
without commit samples is rejected without appending zero-valued evidence.

A timing failure is not product evidence until it is causal. Compare the failing head and its exact
base with the same command and runner class; for noisy gates, use repeated or interleaved runs. If
the base fails with the same shape or the changed code cannot reach the harness path, fix the test
or harness and retry the product PR. Do not quarantine product work for a repository-owned flaky
gate.

The native smoke workflows are deliberately tag-only — an emulator/simulator job is the heaviest
thing in CI, and a launch crash is exactly the kind of regression you want caught at release time.
The Android workflow runs on **Ubuntu + KVM** (the emulator-runner's most reliable path; macOS ARM
runners hit an HVF init failure). Its build job generates a disposable test key, builds the
**Release** APK once with R8 and resource shrinking, and uploads that shared artifact. Both matrix
legs download and boot the same APK on the current API 33 emulator and the declared API 24 floor.
The matrix reads those levels from their source modules rather than carrying a second floor literal
in YAML. Each leg runs `npm run test:android:device` through
`reactivecircus/android-emulator-runner`; the Play upload key never enters CI. The iOS job first
compiles a Release simulator app without store signing, with `CODE_SIGNING_ALLOWED=NO`, then runs
`npm run test:ios` on a macOS runner, which boots a simulator, builds the Debug app, and runs the
same Maestro flow. The Release compile catches configuration-only failures while the established
Debug smoke remains the boot signal. Each Maestro leg uploads its own report artifact.

> CI uses `test:android:device` (not `test:android`) because the emulator-runner action already
> provides a booted emulator — the one-shot would try to boot a second one.
