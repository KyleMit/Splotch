---
paths:
  - "web/tests/**"
  - "web/src/**/*.test.ts"
  - "web/*.test.ts"
  - "web/playwright.config.ts"
  - "web/playwright.shared.ts"
  - "web/vitest.config.ts"
  - "web/vitest-setup.ts"
  - ".maestro/**"
---

# Testing rules

* Three layers (ADR-0008): Vitest unit tests, colocated with their subject (`web/src/**/*.test.ts`
  for app modules, `web/*.test.ts` for build-time modules at the web root), Playwright E2E
  (`tests/*.spec.ts`), and a Maestro native smoke test (`.maestro/smoke.yaml` — one flow shared by
  Android and iOS). Pick the lowest layer that can catch the regression.
* Unit tests cover pure logic and state modules only; UI flows belong in Playwright. The Vitest
  environment is **happy-dom**, not jsdom (ADR-0009). Test files that need no DOM at all —
  `lib/server/**` and pure-logic modules — opt out with a `// @vitest-environment node` first line
  (per-file happy-dom setup is the suite's biggest fixed cost); a file whose module (or imports)
  touches `localStorage`/`document`/`window` must stay on the happy-dom default.
* `npm test` runs the CI test tiers described by the `test` entry in `package.json` and its
  `scripts-info` description; the native smoke tests (`test:android`, `test:ios`) are deliberately
  excluded because they require an emulator/simulator and native tooling.
* Playwright builds the production artifact and serves it with `vite preview` by default; set
  `DEV_SERVER=1` to iterate against `vite dev` instead.
* The Playwright web server **declares** every private env var `web/src` reads, never inherits it —
  `commonWebServer.env` in `playwright.shared.ts` supplies the known test credentials
  (`ADMIN_ACCESS_TOKEN=test-admin-secret`, the managed access code), blanks `GITHUB_ISSUE_TOKEN` —
  the value that forces `/api/report`'s graceful 503 — and sets `OPENAI_API_KEY` to a key that
  cannot authenticate. That one is **non-blank on purpose**: with no key at all the managed-code
  path 500s in `authorizeGenerationRequest` before the request guards the generate-image specs
  assert. Vite gives that env precedence over `web/.env`, so a developer's real dotenv can't change
  what a spec exercises or reaches. Add each new private var to that object (and to the one
  `tools/api-smoke/run-local-contract.mjs` spawns its server with) —
  `tools/tests/e2e-server-env.test.mjs` fails when either is missing a name. Both Playwright configs
  disable server reuse and use Vite `strictPort`; `tests/global-setup.ts` also probes
  `/api/verify-access-code` for a harness-only access code as defense in depth.
* `tests/webkit-smoke.spec.ts` is a WebKit critical-path subset (boot, stroke, the two dialogs) run
  by the `webkit` Playwright project — CI installs WebKit so it always gates there; locally it only
  runs if the WebKit binary is installed. Keep that spec free of CDP and dev-harness dependencies.
  Engine routing is by tag, not filename: `WEBKIT_ONLY_TAG` (`tests/tags.ts`) on the spec's
  `test.describe` is what `webkit` greps for and `chromium` greps out, from one shared constant. Tag
  a new WebKit-only spec the same way — an untagged spec runs under Chromium wherever it lives.
  **Import the tag; never write the string.** Playwright validates no tag, so a typo'd literal
  routes the spec to Chromium silently while the WebKit job stays green on the other specs —
  `tools/tests/e2e-engine-tags.test.mjs` rejects tag literals and unknown tags for that reason.
* Adult-facing surfaces (`/privacy`, `/admin`, Settings dialog) get axe-core scans in
  `tests/a11y.spec.ts` — serious/critical violations fail. The toddler-facing canvas chrome is out
  of scope by design; scans of overlays over it are scoped via `AxeBuilder.include()`. Details in
  the `testing` skill.
* Parametrized tests import the constant/manifest they exercise — never re-declare the value (a
  mirrored copy keeps passing for the wrong reason). Prove the derivation: temporarily change the
  source and confirm the test tracks it. If the source executes at import time, move the constant to
  a side-effect-free module.
* **A test that cannot fail is a lint error**, not something a reviewer has to notice:
  `npm run
  lint` scopes `@vitest/eslint-plugin` and `eslint-plugin-playwright` onto the two test
  globs and rejects a body with no assertion, a committed `.only`, an unconditional skip, an
  `expect` that never reaches a matcher, a dropped retrying assertion (`expect.poll`, a web-first
  assertion), and an assertion reachable only through a branch. That last one shapes how a
  parametrized case is written: state the expectation as a value the table carries
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
* Shared per-test setup lives in a Playwright **fixture**, never in a top-level `test.beforeEach` in
  a helper module: a helper is evaluated once per worker, so such a hook attaches only to the first
  spec file that imports it and every later spec file in that worker silently runs with no setup.
  Extend `test` in the helper and import `test`/`expect` from it (`tests/engine-harness.ts`);
  `tools/tests/e2e-harness-imports.test.mjs` guards the import.
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
  **land** before reading a coordinate off it and dispatching synthetic events there — a real
  `.click()` waits for the element to stop moving, an `evaluate` does not, and a dialog still flying
  in sits inside the launch dead zone that swallows the gesture; await its `Animation.finished`
  first, as `openSettingsModal` does (ADR-0078 §4a); budget a **frame-paced** condition in frames
  rather than milliseconds — the wide Settings pane mounts a section per frame, so
  `settleSettingsPane` samples `aria-busy` from inside the page once per `requestAnimationFrame` and
  spends `SETTINGS_FILL_FRAME_BUDGET` frames, where the default 5s assertion timeout failed a fill
  that was only unfinished; reach for `settleTapGuard` when clicking where a tap just landed, since
  `launchGuard` arms a dead zone for any tap that repaints something under the finger, modal or not
  (a book cover swapping in that book's page grid, say); drive strokes through `draw`/`dragStroke`,
  which pace their samples inside the engine's dropped-pointer threshold — a hand-rolled run of
  far-apart `mouse.move`s gets read as a lifted finger and paints a stub of the stroke; make a
  mocked endpoint control resolve only after its awaited `route.fulfill()` completes; pace
  compositor-dependent synthetic gesture phases with rendered frames, not a fixed sleep; do not
  invent generic `waitForStable`, route-controller, or `nextFrame` abstractions without multiple
  real callers; and verify a fix with `--repeat-each=10`, never in isolation. Full checklist with
  examples: the `testing` skill, "Writing flake-resistant specs."
