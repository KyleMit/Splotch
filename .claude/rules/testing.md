---
paths:
  - "e2e/**"
  - "src/**/*.test.ts"
  - "netlify/**/*.test.ts"
  - "e2e/playwright.config.ts"
  - "vitest.config.ts"
  - ".maestro/**"
---

# Testing rules

* Three layers (ADR-0008): Vitest unit tests, colocated with their subject (`src/**/*.test.ts` for
  app modules, colocated `.test.ts` files for server and build-time modules), Playwright E2E
  (`e2e/specs/*.spec.ts`), and a Maestro native smoke test (`.maestro/smoke.yaml` — one flow shared
  by Android and iOS). Pick the lowest layer that can catch the regression.
* Unit tests cover logic and state; mounted RSD tests cover component contracts. UI flows belong in
  Playwright. The Vitest environment is **happy-dom**, not jsdom (ADR-0009). Test files that need no
  DOM at all — `netlify/server/**` and pure-logic modules — opt out with a
  `// @vitest-environment node` first line (per-file happy-dom setup is the suite's biggest fixed
  cost); a file whose module (or imports) touches `localStorage`/`document`/`window` must stay on
  the happy-dom default.
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
  `src/**/*TestHarness.ts` and `eslint-plugin-playwright` onto `e2e/specs/**/*.spec.ts`, and rejects
  a body with no assertion, a committed `.only`, an unconditional skip, an `expect` that never
  reaches a matcher, a dropped retrying assertion (`expect.poll`, a web-first assertion), and an
  assertion reachable only through a branch. The other `e2e/specs/**/*.ts` helper modules get only
  the three assertion-shape rules (`valid-expect`, `missing-playwright-await`,
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
  Extend `test` in the helper and import `test`/`expect` from it (`e2e/fixtures.ts`).
* **Flake resistance:** the RN config uses Playwright's default half-core worker count. Use
  `expect.poll`, retrying assertions and observable hydration/settled-state helpers rather than a
  fixed delay. `openDrawingScreen` waits for the drawing screen; the group helpers wait for React
  handlers or settled controls where a prerendered element can exist before it is interactive.
  Import helpers from their actual owner in `e2e/support/` and read their guarantees before using
  them. Do not wait on deleted engine globals. For animations use the browser's ready/finished
  signal or the product's completion event, and pace frame-dependent gestures with rendered frames.
  A fixed sleep is justified only to pass a known threshold or prove state does not change. Keep
  mocked endpoint controls pending until `route.fulfill()` completes. Verify a flake fix under equal
  worker load with `--repeat-each=10`; see `docs/TESTING.md`.
