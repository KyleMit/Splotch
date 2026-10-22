---
paths:
  - "e2e/**"
  - "web/src/**/*.test.ts"
  - "web/*.test.ts"
  - "e2e/playwright.config.ts"
  - "web/vitest.config.ts"
  - ".maestro/**"
---

# Testing rules

* Three layers (ADR-0008): Vitest unit tests, colocated with their subject (`web/src/**/*.test.ts`
  for app modules, `web/*.test.ts` for build-time modules at the web root), Playwright E2E
  (`e2e/specs/*.spec.ts`), and a Maestro native smoke test (`.maestro/smoke.yaml` — one flow shared
  by Android and iOS). Pick the lowest layer that can catch the regression.
* Unit tests cover pure logic and state modules only; UI flows belong in Playwright. The Vitest
  environment is **happy-dom**, not jsdom (ADR-0009). Test files that need no DOM at all —
  `lib/server/**` and pure-logic modules — opt out with a `// @vitest-environment node` first line
  (per-file happy-dom setup is the suite's biggest fixed cost); a file whose module (or imports)
  touches `localStorage`/`document`/`window` must stay on the happy-dom default.
* `npm test` runs the CI test tiers described by the `test` entry in `package.json` and its
  `scripts-info` description; the native smoke tests (`test:android`, `test:ios`) are deliberately
  excluded because they require an emulator/simulator and native tooling.
* Playwright builds the RN production export and serves it through `e2e/server/serve.ts`, including
  the real Netlify Function on the same origin. Set `SPLOTCH_E2E_PREBUILT=1` only after building
  that checkout's current sources.
* The Playwright host declares its complete environment in `e2e/server/serverEnv.ts`, including test
  admin credentials, a managed access code and a model key that cannot authenticate. It reads no
  dotenv file or shell credentials. Keep new private variables in this isolated environment and in
  the API smoke's environment (`tools/api-smoke/run-local-contract.mjs`).
* `e2e/specs/smoke.spec.ts` is the Firefox/WebKit critical-path subset (boot, stroke, Undo, the
  privacy page); the SvelteKit suite's own subset is retired. CI installs and requires one engine
  per smoke job; locally each project joins only when its binary is installed. Keep that spec free
  of CDP and dev-harness dependencies. Engine routing is by tag, not filename: `SMOKE_TAG`
  (`e2e/tags.ts`) on the spec's `test.describe` is what the Firefox and WebKit projects in
  `e2e/playwright.config.ts` grep for. Chromium runs every spec, tagged or not. **Import the tag;
  never write the string.** Playwright validates no tag, so a typo'd literal drops the spec from
  both non-Blink jobs while they stay green on the other specs —
  `tools/tests/e2e-engine-tags.test.mjs` rejects tag literals and unknown tags for that reason.
* Adult-facing surfaces (`/privacy`, `/admin`, Settings dialog) get axe-core scans in
  `e2e/specs/a11y.spec.ts` — serious/critical violations fail. The toddler-facing canvas chrome is
  out of scope by design; scans of overlays over it are scoped via `AxeBuilder.include()`. Details
  in the `testing` skill.
* Parametrized tests import the constant/manifest they exercise — never re-declare the value (a
  mirrored copy keeps passing for the wrong reason). Prove the derivation: temporarily change the
  source and confirm the test tracks it. If the source executes at import time, move the constant to
  a side-effect-free module.
* **A test that cannot fail is a lint error**, not something a reviewer has to notice:
  `npm run lint` scopes `@vitest/eslint-plugin` onto `**/*.test.{ts,mjs}` and
  `web/src/**/*TestHarness.ts` and `eslint-plugin-playwright` onto `e2e/specs/**/*.spec.ts`, and
  rejects a body with no assertion, a committed `.only`, an unconditional skip, an `expect` that
  never reaches a matcher, a dropped retrying assertion (`expect.poll`, a web-first assertion), and
  an assertion reachable only through a branch. The other `e2e/specs/**/*.ts` helper modules get
  only the three assertion-shape rules (`valid-expect`, `missing-playwright-await`,
  `valid-expect-in-promise`), since helpers are not tests. The branch rule shapes how a parametrized
  case is written: state the expectation as a value the table carries
  (`await expect(label).toBeVisible({ visible: expected === 'shown' })`,
  `expect(output.includes(hint)).toBe(scenario.wantsHint)`), narrow a union through an
  `asserts`-signature `expect*` helper rather than an `if` on the discriminant, or split a case that
  asserts something genuinely different into its own parametrized block — and pair that split with a
  test that the lists still partition the input, so an empty block fails instead of passing. Helpers
  named `expect*` count as assertions; conditional skips stay allowed. Adding a rule means extending
  its positive control, `tools/tests/vacuous-test-lint.test.mjs`. Details: `docs/TESTING.md`, "A
  test that cannot fail is a lint error."
* A page-driving helper needed by a second spec moves to the shared helpers module at that moment —
  never copied between specs. Exception: the self-contained white-box pixel specs stay
  self-contained (a past consolidation there created a real defect for a measured 8-line saving).
* One behavior per test: a spec accumulating assertion clusters across behaviors gets split, with
  setup-only helpers carrying zero assertions. Imperative logic whose only coverage is E2E (inline
  in a component or config) is an extraction candidate: pure injectable module + unit tests.
* Async lifecycle tests exercise reset, supersede, unmount, deadline, and late settlement as
  independent boundaries instead of asserting only on reopen. Every new red regression test gets a
  negative control against the pre-fix code.
* Dialog keyboard tests account for focus falling back to `<body>` when focused content unmounts,
  then prove the product deliberately restores or moves it.
* Shared per-test setup lives in a Playwright **fixture**, never in a top-level `test.beforeEach` in
  a helper module: a helper is evaluated once per worker, so such a hook attaches only to the first
  spec file that imports it and every later spec file in that worker silently runs with no setup.
  Extend `test` in the helper and import `test`/`expect` from it (`engine-harness` in the retired
  SvelteKit suite).
* **Flake-resistance (worker count is derived from the machine — capacity is `cores / 2`; local sits
  there, CI goes to twice it, ADR-0078 — so specs share the CPU):** never assert on a single
  interaction against a lazily-wired control — wrap open-then-assert in `expect(...).toPass()` or
  reuse a retrying helper (`openSettingsModal`/`openDrawer`/`openStrokeMenu`), and give `retryOpen`
  a hydration-only or otherwise durable outcome that cannot appear before hydration and reset
  afterward; retry the *open* rather than the wait when the open itself picks a view (the coloring
  picker chooses book grid vs. single book from an installed set that resolves after load and never
  re-picks, so a longer wait can't reach the grid — `openColoringBookGrid` reopens until one lands
  on it, issue #936); use `expect.poll` / web-first assertions instead of a fixed `waitForTimeout`
  to wait for something to happen (a fixed sleep is fine only to idle *past* a known threshold or to
  prove a state does *not* change); poll async canvas/relayout state through a retrying assertion
  with a window sized for a starved worker (`expect(await count()).toBe(n)` races the repaint — use
  `await expect.poll(() => count())`); wait on the *engine's* state rather than the button that
  requests it (`pickBrush` polls `window.__committedBrushMode`, ADR-0080); let a fly-in dialog
  **land** before any pointer action on its content — an `evaluate` never waits for the element to
  stop moving, and a real `.click()` only usually does (a fly-in still *pending* its start time
  holds its first keyframe across frames, which passes the stability check), while a dialog still
  flying in sits inside the launch dead zone that swallows the gesture; await its
  `Animation.finished` first via `settleFlyIn`, as `openSettingsModal` and `landedReportConfirm` do
  (ADR-0078 §4a); when a spec needs an animation to be *in* a phase, wait on the browser's signal
  for that phase, never a sleep sized to its duration: `Animation.ready` for started (a play-pending
  animation cancelled before its first frame fires no `animationcancel` at all),
  `Animation.finished` or the `animationend`/`animationcancel` event for settled — the event, not
  `finished`, when the product's own handler is on that event, since the `finished` continuation
  runs before the event dispatches (the lifting-halo spec, issue #2196; Svelte hash-scopes component
  keyframe names, so match `animationName` by suffix); when a spec must act *inside* an animation
  rather than after it, widen that animation instead of timing the act — the halo lift-off specs
  override `--halo-in-duration` through a `:root:root` rule that outranks the component's scoped
  declaration, so the release lands deep inside a grow-in no slow frame can finish first, and an
  inline override would arrive too late because the element does not exist until the halo mounts;
  budget a **frame-paced** condition in frames rather than milliseconds — the wide Settings pane
  mounts a section per frame, so `settleSettingsPane` samples `aria-busy` from inside the page once
  per `requestAnimationFrame` and spends `SETTINGS_FILL_FRAME_BUDGET` frames, where the default 5s
  assertion timeout failed a fill that was only unfinished; reach for `settleTapGuard` when clicking
  where a tap just landed, since `launchGuard` arms a dead zone for any tap that repaints something
  under the finger, modal or not (a book cover swapping in that book's page grid, say); drive
  strokes through `draw`/`dragStroke`, which pace their samples inside the engine's dropped-pointer
  threshold — a hand-rolled run of far-apart `mouse.move`s gets read as a lifted finger and paints a
  stub of the stroke; make a mocked endpoint control resolve only after its awaited
  `route.fulfill()` completes; pace compositor-dependent synthetic gesture phases with rendered
  frames, not a fixed sleep; leave an element by hovering a real control, never by dispatching a
  synthetic `pointerleave`, which leaves the browser's hover target in place; do not invent generic
  `waitForStable`, route-controller, or `nextFrame` abstractions without multiple real callers; and
  verify a fix with `--repeat-each=10`, never in isolation. Full checklist with examples: the
  `testing` skill, "Writing flake-resistant specs."
