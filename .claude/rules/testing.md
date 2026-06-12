---
paths:
  - "tests/**"
  - "src/**/*.test.ts"
  - "playwright.config.ts"
  - "vitest.config.ts"
  - "vitest-setup.ts"
  - ".maestro/**"
---

# Testing rules

* Three layers (ADR-0008): Vitest unit tests (`src/**/*.test.ts`, colocated with source), Playwright E2E (`tests/*.spec.ts`), and a Maestro Android smoke test (`.maestro/smoke.yaml`). Pick the lowest layer that can catch the regression.
* Unit tests cover pure logic and state modules only; UI flows belong in Playwright. The Vitest environment is **happy-dom**, not jsdom (ADR-0009).
* `npm test` = `test:unit` + `test:e2e`; the Android smoke test is deliberately excluded (needs an emulator + native toolchain).
* Playwright builds the production artifact and serves it with `vite preview` by default; set `DEV_SERVER=1` to iterate against `vite dev` instead.
* The admin specs rely on the Playwright web server starting with `ADMIN_ACCESS_TOKEN=test-admin-secret` (`playwright.config.ts`).
* Full guide (commands, Maestro install, CI triggers): the `testing` skill.
