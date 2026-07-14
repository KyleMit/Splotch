# ADR-0008: Three-Tier Testing Strategy (Vitest + Playwright + Maestro)

**Status:** Active\
**Date:** 2025–2026

## Context

Splotch has three distinct layers of testable behavior that require different tools:

1. **Pure logic and reactive state** — storage primitives, color ring math, `$state` modules. Needs
   a fast unit-test runner that can import Svelte 5 rune-compiled modules.
2. **Real browser interactions** — palette selection, drawing, undo, screenshot, AI generation
   (mocked), coloring book overlay. Needs a real browser environment with a real Vite dev server.
3. **Native app boot** — whether the Capacitor WebView starts and renders the production web bundle
   (white screen vs. real UI). Neither unit tests nor browser E2E can catch native shell failures.

## Decision

Three testing tiers, with separate unit-test commands for the app and asset pipeline:

| Tier                | Tool                          | Command                                                | What it covers                                                                                     |
| ------------------- | ----------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Unit (app)          | Vitest + happy-dom            | `npm run test:unit`                                    | Pure functions, `$state` modules, storage layer, color ring math                                   |
| Unit (asset)        | Vitest + Node                 | `npm run test:asset-gen`                               | Image-analysis gates and mocked asset-generator workflows against committed fixtures               |
| E2E web             | Playwright (production build) | `npm run test:e2e`                                     | Real browser flows on `/`, drawing engine harness, palette CSS trim, AI route (mocked), multitouch |
| Native launch smoke | Maestro                       | `npm run test:android` / `npm run test:android:device` | App boots on real emulator, "Parent Center" button visible                                         |

`npm test` runs app unit + asset-pipeline unit + E2E sequentially; the native smoke tests are
separate opt-in commands because they require an emulator or simulator. CI runs both unit commands
before setting up Playwright, then runs E2E.

The Playwright E2E suite runs against the **production build** (not dev server) to catch build-time
issues. A `global-setup.ts` warms each route with a cold Vite load before workers start to avoid
intermittent 504s (see ADR-0009).

The Maestro flow (`.maestro/smoke.yaml`) asserts on the accessibility text "Parent Center" —
presence of that label means the Svelte app rendered successfully in the WebView, not just that the
native process is alive.

## Consequences

* **+** Each tool is optimized for its layer; no impedance mismatch between test style and subject.
* **+** Android smoke catches regressions in the native shell (Capacitor upgrade, build config
  change) that the web suite can't see.
* **-** Three separate toolchains to install, configure, and maintain. Maestro is not an npm package
  — it's a standalone JVM binary installed separately.
* **-** The Playwright suite is slower than unit tests (full browser launch, production build
  warmup). Retries (2 on CI) add buffer against cold-start flakiness.
* **-** Android smoke requires a running emulator or physical device; it's not runnable in a
  standard web CI environment without additional setup (emulator action, KVM/HW acceleration).
