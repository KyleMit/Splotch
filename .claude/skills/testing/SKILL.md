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
| Smoke (iOS) | Maestro + simulator | `npm run test:ios` | **tagged releases only** (macOS runner) |

A separate `quality` CI job (type-check, ESLint, Prettier `--format:check`, and
`npm audit --audit-level=critical`) also runs on every push/PR alongside the
tests — see Continuous integration below.
| Smoke (API contract) | Node fetch + throwaway `vite dev` | `npm run test:api:smoke` | on demand |
| Smoke (deployed Blobs) | Node fetch vs a real deploy | `npm run test:blobs:smoke` | on demand (PR preview / prod) |

`npm test` runs the first two (`test:unit` + `test:e2e`). The native smoke tests
are intentionally **not** part of `npm test` — they need an emulator/simulator
and the native toolchains.

## Deploy smoke tests — `test:api:smoke`, `test:blobs:smoke`

Two Node smoke tests guard the server contract, on demand:

- **`test:api:smoke`** boots a throwaway `vite dev` and checks the `/api/*` shapes
  (admin auth flow, bearer gate, token add/remove, `verify-access-code`). No Blobs,
  so it asserts the snapshot's `persistent` is `false`. See the `api` skill.
- **`test:blobs:smoke`** runs against a **real deploy** to prove Netlify Blobs is
  actually live on the deployed function — the failure mode of ADR-0025, which the
  local `vite dev` tests structurally cannot catch:
  ```bash
  BLOBS_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
  ADMIN_ACCESS_TOKEN=… npm run test:blobs:smoke
  ```
  It asserts `persistent:true`, round-trips a unique token through Blobs, and cleans
  up. Run it on a PR's deploy preview before merging any adapter/Netlify-config
  change, and against `https://splotch.art` to confirm prod.

---

## Unit tests — Vitest

```bash
npm run test:unit          # one-shot
npm run test:unit:watch    # watch mode
```

Configured in `web/vitest.config.ts`. Environment is **happy-dom** (not jsdom).
Covers the pure logic + state modules (`colorRing`, `state/*`, `storage`,
including the native dual-layer hydrate via a mocked `@capacitor/preferences`).

## E2E web tests — Playwright

```bash
npm run test:e2e           # headless — whole suite
npm run test:e2e:ui        # Playwright UI mode
npm run test:e2e:headed    # headed, slowed down (SLOWMO=500)
npm run test:e2e:debug     # inspector

# one spec / one title, not the whole suite (trailing args pass through to Playwright):
npm run test:e2e -- flows.spec.ts -g "the undo button enables on a stroke and reverts it"
```

For ad-hoc validation of a single change, filter through the npm script — **not**
raw `npx playwright test` from the repo root. The config + `baseURL` live in `web/`,
so raw `npx` from the root navigates to an empty `baseURL` (`Cannot navigate to
invalid URL`) and also loses the Chromium fallback (cryptic `chrome-headless-shell`
error in cloud). `node scripts/web.mjs` sets the `web/` cwd and Chromium path for you,
and forwards everything after `--` to Playwright.

Configured in `web/playwright.config.ts`. By default it builds the production
artifact and serves it with `vite preview` (set `DEV_SERVER=1` for fast
iteration against `vite dev`). Specs live in `web/tests/` and exercise the real
drawing engine, the responsive palette, and the full UI flows.

These run on real Chromium but **cannot catch native or WebView boot failures** —
that's what the Android smoke test is for.

### Cloud session gotchas

- **`Executable doesn't exist … chromium-<rev>`** — the env's cached Chromium
  revision drifted from the one this Playwright version wants. `playwright.config.ts`
  and the `run-splotch` driver now self-heal: if the pinned binary is missing they
  fall back to any Chromium under `PLAYWRIGHT_BROWSERS_PATH` (default `/opt/pw-browsers`).
  Override the pick with `PLAYWRIGHT_CHROMIUM=/path/to/chrome`. **Never** run
  `npx playwright install` in a cloud session. The permanent fix is keeping
  `.claude/cloud/setup.sh`'s browser install pinned to this package's `@playwright/test`
  version (it now derives it from `package.json`). See `docs/CLOUD.md`.
- **`DEV_SERVER=1` is unreliable in cloud** — global-setup has hit
  `window is not defined` (SSR) / `/dev/engine never became ready` there. Use the
  default production-build path (just `npm run test:e2e`); it's slower per run but
  works.

---

## Native deployment smoke test — Maestro (Android + iOS)

### What it does and why

The web E2E suite runs in a browser, so it can't tell you whether the *shipped
native app* actually boots. The smoke test fills that gap: it installs the app
on a real Android emulator or iOS simulator, launches it, and asserts that the
UI renders — proving the Capacitor WebView started **and** loaded the production
web bundle (not a white screen or a crash).

The assertion is a single, meaningful signal: the **"Parent Center"** button
(the always-present help button, `web/src/lib/components/ParentCenter.svelte`) must
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

> On macOS/Linux, `npm run android:setup` provisions all three (system image,
> the `Pixel_7_Pro_API_33` AVD, **and** Maestro) and is safe to re-run — it
> skips whatever is already present.

### Installing Maestro

Maestro is **not** an npm package, so it can't be a dev dependency — it's a
standalone JVM-based CLI installed separately.

**macOS / Linux:** `npm run android:setup` installs it automatically (re-run it
if Maestro is missing). To install it on its own:

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
# adds the binary to ~/.maestro/bin
```

> Use `get.maestro.mobile.dev` — `get.maestro.dev` does not work.
>
> The smoke scripts resolve Maestro via `scripts/lib/utils.mjs` (PATH first,
> then `~/.maestro/bin`), so they run even before you reopen your shell to pick
> up the PATH entry the installer adds.

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
| `.github/workflows/test.yml` | every push to `main`, every PR | `quality` (type-check, lint, format:check, audit) + unit + Playwright E2E |
| `.github/workflows/android-deploy.yml` | **`v*` tag push** + manual `workflow_dispatch` | Android Maestro smoke test |
| `.github/workflows/ios-deploy.yml` | **`v*` tag push** + manual `workflow_dispatch` | iOS Maestro smoke test (macOS runner) |
| `.github/workflows/blobs-smoke.yml` | Netlify `deployment_status` success + manual `workflow_dispatch` | Netlify Blobs persistence round-trip (ADR-0025) |

The `blobs-smoke` workflow needs a repo secret `ADMIN_ACCESS_TOKEN` matching the
deploy's admin secret; without it the job fails at the login step. The iOS smoke
mirrors Android but on a `macos-latest` runner — the debug build targets the
simulator, so no signing secrets are involved.

The native smoke workflows are deliberately tag-only — an emulator/simulator job is the
heaviest thing in CI, and a launch crash is exactly the kind of regression you
want caught at release time. The Android job runs on **Ubuntu + KVM** (the
emulator-runner's most reliable path; macOS ARM runners hit an HVF init failure),
builds the **debug** APK (auto-signed, no secrets needed; `cap:sync` still bakes
the production web bundle), installs it onto an emulator booted by
`reactivecircus/android-emulator-runner`, and runs `npm run test:android:device`.
The iOS job runs `npm run test:ios` on a macOS runner, which boots a simulator,
builds the debug app, and runs the same Maestro flow. The Maestro report is
uploaded as a build artifact.

> CI uses `test:android:device` (not `test:android`) because the emulator-runner
> action already provides a booted emulator — the one-shot would try to boot a
> second one.
