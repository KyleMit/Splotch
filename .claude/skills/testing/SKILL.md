---
name: testing
description: Full testing guide — the three-tier strategy (Vitest unit, Playwright E2E, Maestro native smoke on Android + iOS), every test command, CI workflow triggers, and Maestro installation. Use before writing, running, or modifying tests, or when debugging CI test failures.
---

<!-- cspell:ignore Maestro maestro Vitest happydom apksigner swiftshader reactivecircus avds xcodebuild simctl -->

# Splotch — Testing Guide

Splotch has three layers of automated tests. The first two run on every push/PR;
the third (a real device launch) is heavy, so it runs only on tagged releases
and on demand.

| Layer | Tool | Command | Runs in CI |
| --- | --- | --- | --- |
| Unit | Vitest (happy-dom) | `npm run test:unit` | every push / PR |
| E2E (web) | Playwright | `npm run test:e2e` | every push / PR |
| Smoke (Android) | Maestro + emulator | `npm run test:android` | **tagged releases only** |
| Smoke (iOS) | Maestro + simulator | `npm run test:ios` | local only (needs macOS + Xcode) |

`npm test` runs the first two (`test:unit` + `test:e2e`). The native smoke tests
are intentionally **not** part of `npm test` — they need an emulator/simulator
and the native toolchains.

---

## Unit tests — Vitest

```bash
npm run test:unit          # one-shot
npm run test:unit:watch    # watch mode
```

Configured in `vitest.config.js`. Environment is **happy-dom** (not jsdom).
Covers the pure logic + state modules (`colorRing`, `state/*`, `storage`,
including the native dual-layer hydrate via a mocked `@capacitor/preferences`).

## E2E web tests — Playwright

```bash
npm run test:e2e           # headless
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:headed    # headed, slowed down (SLOWMO=500)
npm run test:e2e:debug     # inspector
```

Configured in `playwright.config.ts`. By default it builds the production
artifact and serves it with `vite preview` (set `DEV_SERVER=1` for fast
iteration against `vite dev`). Specs live in `tests/` and exercise the real
drawing engine, the responsive palette, and the full UI flows.

These run on real Chromium but **cannot catch native or WebView boot failures** —
that's what the Android smoke test is for.

---

## Native deployment smoke test — Maestro (Android + iOS)

### What it does and why

The web E2E suite runs in a browser, so it can't tell you whether the *shipped
native app* actually boots. The smoke test fills that gap: it installs the app
on a real Android emulator or iOS simulator, launches it, and asserts that the
UI renders — proving the Capacitor WebView started **and** loaded the production
web bundle (not a white screen or a crash).

The assertion is a single, meaningful signal: the **"Parent Center"** button
(the always-present help button, `src/lib/components/ParentCenter.svelte`) must
become visible. Seeing its accessibility label means real UI painted, not just
that the process launched.

### The flow

The test itself is a declarative [Maestro](https://maestro.dev) flow —
`.maestro/smoke.yaml`:

```yaml
appId: art.splotch.app
---
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible: 'Parent Center'
    timeout: 30000
- takeScreenshot: smoke-launch
```

`takeScreenshot` writes `smoke-launch.png` to the working directory (repo root);
it's git-ignored.

### npm scripts

```bash
npm run test:android          # headless one-shot: boot → build+install → test → tear down
npm run test:android:device   # run against an emulator you already have running
npm run test:ios              # one-shot on the iOS simulator (macOS + full Xcode)
```

| Script | What happens |
| --- | --- |
| `test:android` | Runs `scripts/android-emulator-smoke.mjs`: boots a **headless** `Pixel_7_Pro_API_33` emulator (`-no-window …`), builds + installs (`cap:sync` then the platform's `gradlew :app:installDebug`), runs Maestro, and **always** kills the emulator afterward — even on failure. Self-contained and self-cleaning. |
| `test:android:device` | Just `maestro test .maestro/smoke.yaml` against whatever device is already connected. Fast inner loop — you boot the emulator and install the app yourself. This is what CI uses. |
| `test:ios` | Runs `scripts/ios-simulator-smoke.mjs`: reuses a booted iPhone simulator (or boots the newest available one), builds the debug app with `xcodebuild`, installs via `simctl`, runs the same Maestro flow, and shuts the simulator down if the script booted it. No signing required. |

> The smoke scripts are device-lifecycle glue only — Maestro does the actual
> assertions, and both platforms run the **same flow file**. The Android helper
> works on Windows and macOS (AVD name and SDK locations resolve per-platform
> in `scripts/lib/android.mjs`; override the SDK with `ANDROID_HOME`); the iOS
> helper is macOS-only and fails fast elsewhere. Maestro's install location
> resolves in `scripts/lib/utils.mjs`.

### Prerequisites

1. **Android toolchain** — the same one used to build the app: Node ≥ 22, full
   JDK 21, and the Android SDK. See the `mobile` skill and the
   `android:*` scripts.
2. **An AVD** — the scripts default to `Pixel_7_Pro_API_33`. List yours with
   `emulator -list-avds`.
3. **Maestro CLI** — see below. Needs Java 17+ (the JDK 21 above covers it).

### Installing Maestro

Maestro is **not** an npm package, so it can't be a dev dependency — it's a
standalone JVM-based CLI installed separately.

**macOS / Linux:**

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
# adds the binary to ~/.maestro/bin
```

> Use `get.maestro.mobile.dev` — `get.maestro.dev` does not work.

**Windows (native, no WSL):**

1. Download `maestro.zip` from the
   [Maestro releases](https://github.com/mobile-dev-inc/maestro/releases).
2. Extract it (e.g. to `%USERPROFILE%\maestro`).
3. Add `…\maestro\bin` to your **User** `PATH`.
4. Open a **new** terminal and verify: `maestro --version`.

> Gotcha: already-open terminals won't see the new `PATH`. Open a fresh one (or,
> for the current session, `$env:Path += ';C:\Users\<you>\maestro\bin'`).

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

| Workflow | Trigger | What it runs |
| --- | --- | --- |
| `.github/workflows/test.yml` | every push to `main`, every PR | unit + Playwright E2E |
| `.github/workflows/android-deploy.yml` | **`v*` tag push** + manual `workflow_dispatch` | Android Maestro smoke test |

The Android smoke workflow is deliberately tag-only — an emulator job is the
heaviest thing in CI, and a launch crash is exactly the kind of regression you
want caught at release time. It runs on **macOS** (hardware-accelerated emulator,
no KVM setup), builds the **debug** APK (auto-signed, no secrets needed; `cap:sync`
still bakes the production web bundle), installs it onto an emulator booted by
`reactivecircus/android-emulator-runner`, and runs `npm run test:android:device`.
The Maestro report is uploaded as a build artifact.

> CI uses `test:android:device` (not `test:android`) because the emulator-runner
> action already provides a booted emulator — the one-shot would try to boot a
> second one.
