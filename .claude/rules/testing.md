---
paths:
  - "web/tests/**"
  - "web/src/**/*.test.ts"
  - "web/playwright.config.ts"
  - "web/playwright.shared.ts"
  - "web/vitest.config.ts"
  - "web/vitest-setup.ts"
  - ".maestro/**"
---

# Testing rules

* Three layers (ADR-0008): Vitest unit tests (`src/**/*.test.ts`, colocated with source), Playwright
  E2E (`tests/*.spec.ts`), and a Maestro native smoke test (`.maestro/smoke.yaml` — one flow shared
  by Android and iOS). Pick the lowest layer that can catch the regression.
* Unit tests cover pure logic and state modules only; UI flows belong in Playwright. The Vitest
  environment is **happy-dom**, not jsdom (ADR-0009). Test files that need no DOM at all —
  `lib/server/**` and pure-logic modules — opt out with a `// @vitest-environment node` first line
  (per-file happy-dom setup is the suite's biggest fixed cost); a file whose module (or imports)
  touches `localStorage`/`document`/`window` must stay on the happy-dom default.
* `npm test` = `test:unit` + `test:asset-gen` + `test:e2e`; the native smoke tests (`test:android`,
  `test:ios`) are deliberately excluded (need an emulator/simulator + native toolchain).
* Playwright builds the production artifact and serves it with `vite preview` by default; set
  `DEV_SERVER=1` to iterate against `vite dev` instead.
* The Playwright web server **declares** every private env var `web/src` reads, never inherits it —
  `commonWebServer.env` in `playwright.shared.ts` supplies the known test credentials
  (`ADMIN_ACCESS_TOKEN=test-admin-secret`, the managed access code), blanks `GITHUB_ISSUE_TOKEN` —
  the value that forces `/api/report`'s graceful 503 — and sets `GEMINI_API_KEY` to a key that
  cannot authenticate. That one is **non-blank on purpose**: with no key at all the managed-code
  path 500s in `authorizeGenerationRequest` before the request guards the generate-image specs
  assert. Vite gives that env precedence over `web/.env`, so a developer's real dotenv can't change
  what a spec exercises or reaches. Add each new private var to that object (and to the one
  `scripts/api-smoke.mjs` spawns its server with) — `scripts/tests/e2e-server-env.test.mjs` fails
  when either is missing a name. `reuseExistingServer` can still hand the suite a server nobody here
  started, so `tests/global-setup.ts` probes `/api/verify-access-code` for a harness-only access
  code and aborts the run when the server on the port doesn't know it.
* `tests/webkit-smoke.spec.ts` is a WebKit critical-path subset (boot, stroke, the two dialogs) run
  by the `webkit` Playwright project — CI installs WebKit so it always gates there; locally it only
  runs if the WebKit binary is installed. Keep that spec free of CDP and dev-harness dependencies.
* Adult-facing surfaces (`/privacy`, `/admin`, the Parent Center dialog) get axe-core scans in
  `tests/a11y.spec.ts` — serious/critical violations fail. The toddler-facing canvas chrome is out
  of scope by design; scans of overlays over it are scoped via `AxeBuilder.include()`. Details in
  the `testing` skill.
* Parametrized tests import the constant/manifest they exercise — never re-declare the value (a
  mirrored copy keeps passing for the wrong reason). Prove the derivation: temporarily change the
  source and confirm the test tracks it. If the source executes at import time, move the constant to
  a side-effect-free module.
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
  `scripts/tests/e2e-harness-imports.test.mjs` guards the import.
* **Flake-resistance (the suite runs 2 workers locally and 4 on CI — ADR-0078 — so specs share the
  CPU):** never assert on a single interaction against a lazily-wired control — wrap
  open-then-assert in `expect(...).toPass()` or reuse a retrying helper
  (`openParentCenter`/`openDrawer`/`openStrokeMenu`); use `expect.poll` / web-first assertions
  instead of a fixed `waitForTimeout` to wait for something to happen (a fixed sleep is fine only to
  idle *past* a known threshold or to prove a state does *not* change); poll async canvas/relayout
  state through a retrying assertion with a window sized for a starved worker
  (`expect(await count()).toBe(n)` races the repaint — use `await expect.poll(() => count())`); wait
  on the *engine's* state rather than the button that requests it (`pickBrush` polls
  `window.__committedBrushMode`, ADR-0079); drive strokes through `draw`/`dragStroke`, which pace
  their samples inside the engine's dropped-pointer threshold — a hand-rolled run of far-apart
  `mouse.move`s gets read as a lifted finger and paints a stub of the stroke; and verify a fix with
  `--repeat-each=10`, never in isolation. Full checklist with examples: the `testing` skill,
  "Writing flake-resistant specs."
