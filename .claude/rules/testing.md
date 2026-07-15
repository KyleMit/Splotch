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
  environment is **happy-dom**, not jsdom (ADR-0009).
* `npm test` = `test:unit` + `test:asset-gen` + `test:e2e`; the native smoke tests (`test:android`,
  `test:ios`) are deliberately excluded (need an emulator/simulator + native toolchain).
* Playwright builds the production artifact and serves it with `vite preview` by default; set
  `DEV_SERVER=1` to iterate against `vite dev` instead.
* The admin specs rely on the Playwright web server starting with
  `ADMIN_ACCESS_TOKEN=test-admin-secret` (`playwright.config.ts`).
* Full guide (commands, Maestro install, CI triggers): the `testing` skill.
