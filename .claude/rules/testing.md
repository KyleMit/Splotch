---
paths:
  - "web/tests/**"
  - "web/src/**/*.test.ts"
  - "web/playwright.config.ts"
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
* The admin specs rely on the Playwright web server starting with
  `ADMIN_ACCESS_TOKEN=test-admin-secret` (`playwright.config.ts`).
* `tests/webkit-smoke.spec.ts` is a WebKit critical-path subset (boot, stroke, the two dialogs) run
  by the `webkit` Playwright project — CI installs WebKit so it always gates there; locally it only
  runs if the WebKit binary is installed. Keep that spec free of CDP and dev-harness dependencies.
* Adult-facing surfaces (`/privacy`, `/admin`, the Parent Center dialog) get axe-core scans in
  `tests/a11y.spec.ts` — serious/critical violations fail. The toddler-facing canvas chrome is out
  of scope by design; scans of overlays over it are scoped via `AxeBuilder.include()`. Details in
  the `testing` skill.
* **Flake-resistance (the suite runs 4 parallel workers, so specs share the CPU):** never assert on
  a single interaction against a lazily-wired control — wrap open-then-assert in
  `expect(...).toPass()` or reuse a retrying helper
  (`openParentCenter`/`openDrawer`/`openStrokeMenu`); use `expect.poll` / web-first assertions
  instead of a fixed `waitForTimeout` to wait for something to happen (a fixed sleep is fine only to
  idle *past* a known threshold or to prove a state does *not* change); poll async canvas/relayout
  state through a retrying assertion with a window sized for a starved worker
  (`expect(await count()).toBe(n)` races the repaint — use `await expect.poll(() => count())`); and
  verify a fix with `--repeat-each=10`, never in isolation. Full checklist with examples: the
  `testing` skill, "Writing flake-resistant specs."
