# ADR-0008: Three-Tier Testing Strategy (Vitest + Playwright + Maestro)

**Status:** Active (amended by [0120](0120-native-smoke-is-a-boot-check-not-a-ui-flow.md) and
[0124](0124-exercise-native-release-configurations-in-tag-gates.md))\
**Date:** 2025–2026

> **Path note ([ADR-0108](0108-unified-tools-tree.md)):** the repo-automation tier now lives in
> `tools/` and its command was renamed `test:scripts` → `test:tools`. The three-tier strategy itself
> is unchanged.

## Context

Splotch has three distinct layers of testable behavior that require different tools:

1. **Pure logic and reactive state** — storage primitives, color ring math, `$state` modules. Needs
   a fast unit-test runner that can import Svelte 5 rune-compiled modules.
2. **Real browser interactions** — palette selection, drawing, undo, screenshot, AI generation
   (mocked), coloring book overlay. Needs a real browser environment with a real Vite dev server.
3. **Native app boot** — whether the Capacitor WebView starts and renders the production web bundle
   (white screen vs. real UI). Neither unit tests nor browser E2E can catch native shell failures.

## Decision

Three testing tiers, with separate unit-test commands for the app, asset pipeline, and repository
automation:

| Tier                | Tool                          | Command                                                                     | What it covers                                                                                     |
| ------------------- | ----------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Unit (app)          | Vitest + happy-dom            | `npm run test:unit`                                                         | Pure functions, `$state` modules, storage layer, color ring math                                   |
| Unit (asset)        | Vitest + Node                 | `npm run test:asset-gen`                                                    | Image-analysis gates and mocked asset-generator workflows against committed fixtures               |
| Unit (repo scripts) | Vitest + Node                 | `npm run test:scripts`                                                      | Repository automation whose failures would corrupt state rather than simply crash                  |
| E2E web             | Playwright (production build) | `npm run test:e2e`                                                          | Real browser flows on `/`, drawing engine harness, palette CSS trim, AI route (mocked), multitouch |
| Native launch smoke | Maestro                       | `npm run test:android` / `npm run test:android:device` / `npm run test:ios` | App boots on a real emulator/simulator and the "Settings" button becomes visible                   |

`npm test` runs app unit + asset-pipeline unit + repo-script unit + E2E sequentially; the native
smoke tests are separate opt-in commands because they require an emulator or simulator. CI runs all
three unit commands before setting up Playwright, then runs E2E.

The Playwright E2E suite runs against the **production build** (not dev server) to catch build-time
issues. A `global-setup.ts` warms each route with a cold Vite load before workers start to avoid
intermittent 504s (see ADR-0009).

The Maestro flow (`.maestro/smoke.yaml`) asserts on the accessibility text "Settings" — presence of
that label means the Svelte app rendered successfully in the WebView, not just that the native
process is alive. That single assertion is the flow's whole job, and
[ADR-0120](0120-native-smoke-is-a-boot-check-not-a-ui-flow.md) records why steps that navigate the
UI do not belong in this tier.

## Consequences

* **+** Each tool is optimized for its layer; no impedance mismatch between test style and subject.
* **+** Android and iOS smoke catch regressions in the native shells (Capacitor upgrade, build
  config change) that the web suite can't see.
* **-** Three separate toolchains to install, configure, and maintain. Maestro is not an npm package
  — it's a standalone JVM binary installed separately.
* **-** The Playwright suite is slower than unit tests (full browser launch, production build
  warmup). Retries (2 on CI) add buffer against cold-start flakiness.
* **-** Native smoke requires an Android emulator/device or an iOS simulator; neither is runnable in
  a standard web CI job without platform-specific setup.

## Amendment (2026-08-08): expanded suites and parallel CI

The three behavioral tiers remain unchanged, while their command and CI coverage expanded. The unit
tier now also includes `test:store-drawings`; `npm test` runs all four unit commands before E2E. CI
runs the unit commands in a browser-free job, shards Chromium E2E, runs a separate WebKit
critical-path smoke subset, and reserves Maestro native launch smoke for release tags.

## Amendment (2026-08-17): release configurations in native tag gates

ADR-0124 keeps the native behavior tier as a boot-only Maestro smoke while adding configuration
coverage to its tag workflows: Android boots a disposable-key-signed Release APK, and iOS compiles a
Release simulator app without store signing before its established Debug boot smoke.
