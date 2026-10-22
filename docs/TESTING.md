<!-- cspell:ignore Maestro maestro Vitest happydom apksigner swiftshader reactivecircus avds xcodebuild simctl -->

# Splotch — Testing Guide

The three layers are unit/mounted tests, Playwright against the RN web export, and native launch
smokes (ADR-0008/0182). SvelteKit's component, SSR and tiled-engine browser suites are retired;
their spec-by-spec decisions are recorded under `docs/scratchpad/2026-10-21-rn-e2e-dispositions/`.
The app lives in root `src/`; retained framework-free app modules live in `src/lib/` and hosted
server modules in `netlify/server/`.

| Layer                     | Tool                     | Command                                                   | CI                            |
| ------------------------- | ------------------------ | --------------------------------------------------------- | ----------------------------- |
| Shared app/server units   | Vitest + happy-dom/Node  | `npm run test:unit:coverage`                              | Every push / PR               |
| Asset pipeline            | Vitest (Node)            | `npm run test:asset-gen`                                  | Every push / PR               |
| Store-drawing pipeline    | Vitest (Node)            | `npm run test:store-drawings`                             | Every push / PR               |
| Opt-in centerline tracing | pytest + Vitest          | `npm run test:centerline-tracing`                         | Path-filtered + manual        |
| Repository scripts        | Vitest (Node)            | `npm run test:tools`                                      | Every push / PR               |
| Mounted RN/RSD            | Vitest + happy-dom       | `npm run test:migration:rsd-selection`                    | Browserless job               |
| Browser behavior          | Playwright               | `npm run test:e2e`                                        | RN export shards              |
| Page load                 | Lighthouse               | `npm run test:lighthouse:ci`                              | RN export                     |
| Local API contract        | Plain Node function host | `npm run test:api:smoke`                                  | Browserless job               |
| Hosted deploy             | Node + Netlify           | `npm run test:deploy:smoke`                               | Daily production + manual URL |
| Firefox / WebKit          | Playwright               | `npm run test:firefox:smoke`, `npm run test:webkit:smoke` | Every push / PR               |
| Native compile            | Gradle / xcodebuild      | `npm run android:apk`, `npm run ios:simulator`            | Path-filtered PRs             |
| Native launch             | Maestro                  | `npm run test:android`, `npm run test:ios`                | Tagged release + manual       |

`npm run check:quality` mirrors the Quality job; `npm run test:browserless` mirrors the browserless
job. Both keep reporting after an individual failure, and their wiring is guarded against CI drift.
`npm run check` type-checks shared modules, Netlify, RN and E2E; it does not run Svelte sync or
generate a `.svelte-kit` directory.

`npm test` runs the unit/asset/store/tools/mounted tiers and the browser suite. It omits local API
smoke and native launch tests. Native launch needs an emulator/simulator and toolchain; the hosted
Blobs diagnostic needs a real deploy.

Run `npm run lint:dead` before pushing deletions. Format edited files, then run check/lint and the
applicable full tier. Host ports and CPU are shared across worktrees: choose an unused port with
`npm --silent run show:free-port`; full browser suites, native runs and performance captures are
host-exclusive. Stop only processes created by the current session.

## A test that cannot fail is a lint error

A test that has only ever passed carries no evidence it is connected to anything, and a green suite
looks identical whether the coverage is real or vacuous. `npm run lint` catches that whole class in
the `quality` job, at no runtime cost. `eslint.config.js` scopes `@vitest/eslint-plugin` onto
`**/*.test.{ts,mjs}` and test-harness modules, and `eslint-plugin-playwright` onto
`e2e/specs/**/*.spec.ts`, and turns on the same six guards under each plugin's spelling: a test body
with no assertion, a committed `.only` (which silently skips the rest of its file), an unconditional
skip, an `expect` that never reaches a matcher, a retrying assertion whose promise is dropped
(`expect.poll`, a web-first assertion), and an assertion reachable only through a branch. The shared
E2E helpers — every other `e2e/**/*.ts` module — get only the three rules about an assertion's own
shape (`valid-expect`, `missing-playwright-await`, `valid-expect-in-promise`): a helper is not a
test, so the rules that judge a test body do not apply. Code outside those globs is not checked.

The branch rule is the only one that constrains how a test is written. **A parametrized case states
its expectation as a value rather than branching around the assertion:**

```ts
// Not this — the assertion is skipped for half the table, and the skip is silent.
if (expected === 'shown') expect(label).toBeVisible();

// This — the case's own value drives the matcher, so every row asserts.
await expect(label).toBeVisible({ visible: expected === 'shown' });
expect(output.includes(hint)).toBe(scenario.wantsHint);
```

The other two shapes that replace a branch: narrow a union through an `asserts`-signature `expect*`
helper (`expectParsedBody` in `netlify/server/http.test.ts`) rather than an `if` on the
discriminant, and split a case that asserts something genuinely different into its own parametrized
block — pairing the split with a test that the two lists still partition the input, so an exception
naming something that no longer exists fails rather than quietly emptying a block.

Helpers named `expect*` count as assertions, so a test that delegates is not read as assertion-free.
Conditional skips (`test.skip(!!process.env.DEV_SERVER, '…')`) stay allowed — that is the supported
way to gate a spec on the environment.

The rules themselves have the same failure mode as the tests they police: one scoped to a glob
nothing matches reports nothing, which is indistinguishable from a clean repo.
`tools/tests/vacuous-test-lint.test.mjs` is the positive control — it seeds each defect and asserts
the rule fires, and pins what each deliberate relaxation lets through. Extend it when you add a
rule.

### A regression test must fail against the old code

The lint rules above catch a test that *structurally* cannot fail. They cannot catch the other
shape: a test full of real assertions that would have passed against the code as it was before the
fix. It reads as coverage, ships as coverage, and pins nothing — and unlike a vacuous test, nothing
in the suite will ever tell you.

**So prove it: revert the fix, rerun the test, and require it to fail.** A test that stays green
against the unfixed code is evidence about the test, not the fix. Either it asserts the wrong thing
or the behavior it describes is unobservable at that seam — both are worth knowing before the test
is committed as protection.

Two shapes from the Codex rival wrapper (now `tools/rival-agent/tests/stream.test.mjs` and
`tools/tests/launch-codex.test.mjs`) are the worked examples, because both passed in the broken
state before the revert check caught them:

* **The defect is real but unobservable through the seam under test.** Asserting that a log file was
  complete when a promise resolved passed either way, because in practice the flush always wins the
  race; a volume-based attempt at 20,000 lines could not separate the two versions either.
  Distinguishing them needed an injected stream that fails while flushing — the ordering was only
  observable once the failure was injectable.
* **The assertion never reaches the path a user runs.** Asserting an argument parser's return value
  passed while the command that parser feeds crashed on invocation, because the crash lived in the
  caller. A unit assertion on a helper is not a test of the command documented in a skill.

**Commit the fix before running the revert check.** The check is destructive, and
`git checkout -- <file>` restores the working tree from the **index** (`HEAD` only when nothing is
staged), so it cannot separate the temporary revert from unrelated uncommitted work in the same file
— it silently discards both, and if the revert itself was staged it restores the reverted shape
rather than the fix. Commit first, or invert the edit rather than restoring the file. Never reach
for a bare `git stash` here: the stash stack is shared across worktrees and other sessions pop it.

### A test owns its inputs

A test also passes for the wrong reason when something outside it decides the outcome. Four shapes
the 2026-09 clean-code campaign found (rule 9 of `docs/CODING-STANDARDS.md`):

* **Build the fixture per test.** Two performance-matrix release-gate tests passed with their
  deciding input removed, because a sibling test had mutated the shared fixture object they read (PR
  \#2414). Return a fresh fixture from a factory, and register cleanup with `onTestFinished` where
  the test creates a temp directory or a listener.
* **Drive the real store, not a double that copies its rule.** Plain-object settings doubles broke
  23 tests when PR \#2386 changed the store's surface, and the repair copied the store's
  `aiCredentialKind()` rule into them, so the request-header assertions checked the tests' own copy.
  PR \#2413 moved that retired Svelte suite onto the real store. In RN tests, drive the current
  settings owner. Import the owner's constant or function rather than re-declaring it, and type any
  remaining stub from the real function (`vi.fn<typeof realFn>()`) so a changed signature fails
  `npm run check`.
* **Pin copy exactly as rendered.** Never collapse whitespace before comparing rendered text. A
  Prettier re-wrap of a template text line changes the DOM text, which a whitespace-normalizing unit
  test hides and an anchored E2E regex then catches (PR \#2400). If Prettier wants to wrap a long
  interpolation, bind a short local alias for it instead (PR \#2411).
* **Name a timeout and give it measured headroom.** A per-test cap sized near the slowest observed
  run fails on a loaded runner. Measure, name the constant (`PNPM_LAUNCHES_TIMEOUT_MS`,
  `REAL_REPO_TEST_OPTIONS`), and prefer fake timers or a mocked `sleep` over real waits (PRs \#2401,
  \#2407, \#2417).

## Server-contract smoke tests — `test:api:smoke`, `test:deploy:smoke`, `test:blobs:smoke`

Three Node smoke entry points guard the server contract:

* **`test:api:smoke`** serves the `/api` Netlify Function in process on a throwaway plain Node host
  (`tools/lib/netlify-function-host.mjs`: dev mode, no SvelteKit, no `vite dev`, no dotenv file) and
  checks the `/api/*` shapes (admin auth flow, bearer gate, token add/remove, `verify-access-code`)
  plus the CORS/preflight contract the native apps depend on. No Blobs, so it asserts the snapshot's
  `persistent` is `false`. CI runs it in the `browserless` job on every push/PR; run it locally
  after any endpoint change (see the `api` skill). Its host listens on `127.0.0.1:SMOKE_PORT`, not
  `SPLOTCH_E2E_PORT`; in a concurrent worktree, set `SMOKE_PORT` to an unused port.
* **`test:deploy:smoke`** is the normal **real deploy** gate. It checks `/`, `/privacy`, and the
  prerendered `/admin`, security and cache headers, `version.json` (exactly the checked-out commit's
  on a preview or loopback target), both native-origin CORS preflights, safe unauthenticated API
  failures, and the admin persistence contract. Production and unrecognized targets use only the
  read-only `persistent:true` assertion; Netlify previews add the token write/read/delete
  round-trip. It never makes a model call. Run it from the ref that produced the target deploy:
  ```bash
  DEPLOY_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
  ADMIN_ACCESS_TOKEN=… npm run test:deploy:smoke
  ```
  The Hosted Deploy Smoke workflow probes production daily and accepts an optional preview or
  production URL on manual dispatch. It does not use the unrelated GitHub Pages `deployment_status`
  event. The checker derives version strictness from the target, in the workflow and on the command
  line alike: a preview must serve the selected ref's version exactly, while production, its
  aliases, and any unrecognized remote host need only a valid, non-cacheable version, so production
  can trail docs/tooling-only commits that ADR-0070 intentionally excludes from Netlify builds.
  `DEPLOY_SMOKE_REQUIRE_CURRENT_VERSION=true` or `false` overrides that choice.
* **`test:blobs:smoke`** is the narrower diagnostic that proves Netlify Blobs is actually live on
  the deployed function — the failure mode of ADR-0025, which the local in-memory function-host
  tests structurally cannot catch:
  ```bash
  BLOBS_SMOKE_URL=https://deploy-preview-11--splotchy.netlify.app \
  ADMIN_ACCESS_TOKEN=… npm run test:blobs:smoke
  ```
  It asserts `persistent:true`. On a Netlify preview it also round-trips a unique token through
  Blobs and cleans up; production and unrecognized targets remain read-only. Run it on a PR's deploy
  preview before merging any adapter/Netlify-config change, and against production to isolate a
  persistence failure. The full hosted gate includes this same target-sensitive contract.

---

## Unit and mounted tests — Vitest

```sh
npm run test:unit
npm run test:unit:coverage
npm run test:unit:watch
node_modules/.bin/vitest run --config vitest.config.ts src/lib/server/securityHeaders.test.ts
npm run test:migration:rsd-selection
```

`vitest.config.ts` runs the retained framework-free TypeScript tests. Its default is happy-dom;
files needing no browser carry `// @vitest-environment node`. Use happy-dom when any imported module
reads `window`, `document` or `localStorage`, so the test exercises its intended path. Coverage
measures the retained TypeScript denominator declared in the config; the former Svelte-era coverage
ratios are not measurements of the RN application.

`tools/migration/rsd-drawing-vitest.config.mjs` mounts the RSD drawing tests through the released
native RSD renderer with explicit host seams. The `tools/migration/tests/rsd-native-*.test.mjs`
files drive actual components/owners. Their animated-host and platform seams model the specific
native gap a test observes; passing them is not a claim that Node exercised Photos, native file I/O
or Skia on a device. `tools/tests/native-*` also holds pure contracts and build/source guards.

Vitest aborts a timed-out test's context signal but cannot stop an async continuation. A real-timer
poller that can touch shared mocks accepts `{ signal }` and calls `signal.throwIfAborted()` after
each await. Prefer fake timers when faithful. Node's `AbortSignal.timeout` uses internal timers, so
deadline tests stub it with an abort controller driven by the fake clock (the pattern in
`netlify/server/github.test.ts`). Scope a named larger timeout to a measured expensive test; never
raise a whole file's cap to hide contention.

## Asset-pipeline unit tests — Vitest

```bash
npm run test:asset-gen
```

Configured in `tools/asset-gen/vitest.config.mjs`. These run in Node against committed fixtures and
mocked generator workflows, with no model calls or network access. CI runs them in the browser-free
`browserless` job, after the app-unit suite and alongside the repo-script suite, in parallel with
the e2e shards. It has no SvelteKit-generated configuration dependency.

## Store-drawing pipeline unit tests — Vitest

```bash
npm run test:store-drawings
```

Configured in `tools/store-drawings/vitest.config.mjs`. These run in Node against the committed SVG
samples and static instruction module. They cover the supported SVG subset, coordinate fitting,
closed width/color vocabularies, and exact generator drift without launching a browser.

ADR-0122's hero capture seam (`window.__replayStroke`) and its browser contract, the
`store-drawing-replay` spec, belonged to the SvelteKit app and retired with it. The React Native
export replays strokes through its in-app probe, which `tools/tests/native-replay-probe.test.mjs`
and `tools/tests/native-replay-traces.test.mjs` pin.

## Opt-in centerline tracing

```bash
npm run test:centerline-tracing
uv run --project tools/centerline-tracing --locked \
  pytest -m integration tools/centerline-tracing/tests/test_integration.py
```

The Python package, lockfile, and local virtual environment stay under `tools/centerline-tracing/`.
The quick suite covers graph schema round-trips, pruning geometry and scale invariance, fill rules,
vector/raster agreement, bridge behavior, deterministic repeated tracing, locked-environment
failure, batch atomicity, and direct handoff to the exported `convertSvg()` consumer. The marked
integration case compares a representative trace against the golden using metric thresholds rather
than bytes so small SciPy/BLAS selection drift does not create a platform-fragile test.

## Repo-script unit tests — Vitest

```sh
npm run test:tools
```

`tools/vitest.config.mjs` runs repository automation tests in Node. They cover parsing, failure
handling, generation, release tooling, workflow wiring and instruction drift. Test a tool's failure
mode where it could corrupt state or silently report success, not only its happy path.

Examples include `tools/ruler/apply-skill-forks.mjs` package isolation and
`tools/ruler/apply-ruler.mjs` preservation of direct provider packages on failure. Registered
provider skills remain outside generated ownership (`tools/ruler/lib/direct-provider-skills.mjs`).

The tier also checks E2E tags, cited spec paths, server environment declarations, native build
contracts and document references. A spec rename needs the tools tier as well as the browser run.
There is no prerequisite SvelteKit sync; configs resolve retained source directly.

## E2E web tests — Playwright

`e2e/README.md` is the authoring guide. `e2e/playwright.config.ts` points at `e2e/specs/` and serves
the output of `npm run build:site` as Netlify serves it: headers, redirects, a status-404 page, and
the real `/api` function on the same loopback origin. The controlled environment in
`e2e/server/serverEnv.ts` uses a test admin credential, an unusable model key and disabled issue
submission. It inherits neither shell credentials nor a dotenv file.

```sh
SPLOTCH_E2E_PORT=<port> npm run test:e2e -- smoke.spec.ts --project chromium --workers=1
SPLOTCH_E2E_PORT=<port> npm run test:e2e:headed -- settings.spec.ts --workers=1
SPLOTCH_E2E_PORT=<port> npm run test:e2e:ui
SPLOTCH_E2E_PORT=<port> SPLOTCH_E2E_PREBUILT=1 npm run test:firefox:smoke
```

Each run builds first unless `SPLOTCH_E2E_PREBUILT=1` is set. Use that only for an export just built
from the same checkout; a stale export can pass against code that no longer exists. Import
`test`/`expect` from `e2e/fixtures.ts`, not directly from Playwright. Use its `drawingScreen`
fixture for booted interactive drawing, `openDocument` for other documents, and the request fixture
for the same-origin API. The export has no Svelte dev harness.

### Writing flake-resistant specs

The RN config uses Playwright's default half-core worker count; the retired Svelte suite's measured
CI oversubscription is not an RN measurement. Local retries are off, while CI retries are recorded
by `e2e/playwright-flaky-reporter.ts` in `playwright-report/flaky.json`. The flaky digest keeps
retried passes visible across expiring report artifacts (`tools/flaky-digest/README.md`). A retrying
pass is evidence of a flake, not an unqualified clean run.

* **Wait for durable readiness.** Prerendered controls can be visible before handlers work. Use the
  drawing fixture's readiness contract or a complete action/outcome retry; transient visibility
  alone is insufficient.
* **Poll asynchronous state.** Use web-first assertions or `expect.poll`; an awaited value read once
  can race a repaint. A press's visual state need not prove the renderer adopted its mode.
* **Avoid fixed sleeps for positive outcomes.** Await the real condition. A named fixed window can
  prove that something stays absent or idle past a known threshold; explain that reason.
* **Wait on the animation being tested.** A moving surface can pass a two-frame stability check
  before a delayed CSS animation starts. Await the actual animation/event or the product's settled
  contract before acting. Wait on `animationend` when the handler matters; `Animation.finished` can
  resolve before event dispatch.
* **Retry dependent bursts as a whole.** A sequence with an input timing window cannot be repaired
  by lengthening a later assertion. Retry the whole operation and its durable outcome.
* **A mock's completion means delivery.** Resolve controls only after awaited `route.fulfill`, not
  when a response is queued.
* **Move the real pointer for hover boundaries.** Dispatching `pointerleave` does not move the
  browser's hover target; later layout can send a trusted re-entry.
* **Use fixtures for shared setup.** A helper module's top-level `beforeEach` attaches only while
  its first importing spec evaluates. Put setup in `base.extend` and import the fixture.
* **Keep gestures faithful.** Use the suite's drawing helpers rather than sparse hand-written moves
  that can become discontinuous under load. A product-specific assertion still belongs in the spec.
* **Measure both sides of a threshold.** An ink/color metric must separate a correct behavior from
  its negative control, with headroom between their measured distributions.
* **Pin text as rendered.** Do not normalize whitespace to hide a changed DOM string.

Reproduce a suspected flake on the unfixed code at the RN config's supported worker count and record
the product state. Decide whether the race is reachable by a person, then fix the product or wait
for the proper outcome. Verify a focused amplifier with retries off and repeated full runs at the
supported load. Each full run needs a fresh server: rate-limit windows shared across repetitions
manufacture unrelated failures. The old Svelte worker-sweep driver is retired; separate invocations
of `npm run test:e2e` start fresh hosts. Report repetition count and worker load, never “zero
flakes” from a single green run.

Linux visual baselines must come from the matching CI render, not a Mac update. Inspect the failing
report's actual image and snapshot name before adopting it; local snapshot updates target Darwin.

### Page-load gate — `tools/page-load/`

`npm run test:lighthouse:ci -- --port=<port>` builds and times the RN export on throttled phone and
tablet profiles, first/repeat visits and three samples per case. It compares median FCP/LCP with
`tools/page-load/baseline.json`. `--no-build` reuses only a fresh export from this checkout.
`tools/page-load/README.md` owns method and baseline recalibration. The startup and per-page byte
caps in `tools/migration/check-native-web-startup.mjs` are a separate gate inside `build:site`;
Lighthouse passing does not waive them.

### Cross-engine critical-path smoke — `e2e/specs/smoke.spec.ts`

Chromium runs every spec; Firefox and WebKit run those tagged with imported `SMOKE_TAG` from
`e2e/tags.ts`. CI requires the selected browser binary; locally a non-Chromium project joins only if
installed. Keep smoke cases portable: no CDP, development routes or Chromium-specific pixel
assumptions. `tools/tests/e2e-engine-tags.test.mjs` rejects literal/unknown tags and pins routing.

These jobs prove current engine-family behavior, not Firefox 114, Safari 16.4 or native iOS boot.
`docs/COMPATIBILITY.md` describes the floor validation boundary.

### Accessibility tier — `e2e/specs/a11y.spec.ts`

Axe scans adult-facing pages, Settings and AI dialogs in both themes during the normal web suite.
Overlay scans stay scoped to the dialog above toddler-facing drawing chrome. Serious/critical
violations fail with selectors and fix hints. Dialog accessible names are also asserted directly;
pseudo-element placeholder contrast needs a separate measurement. The styleguide's scroll-cue
specimens remain a recorded gap in `docs/scratchpad/2026-10-21-rn-e2e-dispositions/group-a.md`.

Add a new surface to the real browser scan and wait for its settled/wired state. Fix the application
before considering a suppression; any deliberate false-positive exclusion needs its reason.

### Cloud session gotchas

The Chromium executable helper in `tools/lib/playwright.mjs` honors `PLAYWRIGHT_CHROMIUM` and can
find an available cached Chromium when the pinned binary is missing. Use the environment's supplied
browser path rather than downloading browsers during a cloud run. The production export is the
supported test target; the retired `DEV_SERVER` Svelte path is unavailable.

## Native deployment smoke test — Maestro (Android + iOS)

### What it does and why

The web E2E suite runs in a browser, so it can't tell you whether the *shipped native app* actually
boots. The smoke test fills that gap: CI installs the React Native app's store-identity Release
build on an Android emulator or iOS simulator, launches it, and asserts that the UI renders —
proving native startup and the embedded JavaScript bundle worked (not a blank screen or a crash).

The assertion is a single, meaningful signal: the **"Settings"** button (the drawing screen's corner
button, `src/rsdDrawing/RsdEdgeControls.tsx`) must become visible. Seeing its accessibility label
means real UI painted, not just that the process launched.

That the flow stops there is a decision, not an omission — **ADR-0120**. Steps that navigated the UI
broke on a UI change within three releases every time they were added, and because these workflows
are tag-only, each break surfaced as a red release gate instead of a failing PR. Coverage of what
the UI *does* belongs in Playwright, which runs on every push and can select elements properly. Do
not grow this flow; `tools/tests/native-smoke-flow.test.mjs` fails on `npm test` if the component
that owns a selected label stops declaring it, or if the flow selects by pattern instead of by exact
label.

### The flow

The test itself is a declarative [Maestro](https://maestro.dev) flow — `.maestro/smoke.yaml`:

```yaml
appId: art.splotch.app
---
- launchApp:
    clearState: true
- extendedWaitUntil:
    visible: 'Settings'
    timeout: 30000
- takeScreenshot: .maestro/screenshots/smoke-launch
```

`takeScreenshot` writes `smoke-launch.png` under `.maestro/screenshots/`; it's git-ignored. On CI
the whole Maestro report — flow log, that screenshot, and the screenshot taken at a failing step —
is uploaded as a build artifact, and a failure on a **tag** push files or comments on a GitHub
issue, since nobody is watching a tag-triggered run at the moment it goes red.

The iOS job budgets XCTest driver startup with `MAESTRO_DRIVER_STARTUP_TIMEOUT` separately from the
flow's app-paint timeout. Its report also retains `~/Library/Logs/maestro/xctest_runner_logs/`:
Maestro's flow log alone can show connection refusals without the underlying `xcodebuild` error. A
failed `test:ios` command can mean simulator setup, build/install, or driver startup failed before
the app assertion ran. Inspect that phase before calling it a product boot regression. Issue
[#1734](https://github.com/KyleMit/Splotch/issues/1734) was filed after the XCTest driver timed out,
with no flow execution or screenshot.

After a Maestro failure, `test:ios` also captures a bounded diagnostic relaunch of the installed app
in `~/.maestro/tests/ios-app-relaunch.log` before simulator teardown. The console can expose native
or JavaScript startup errors; it describes a second launch and does not replace the original failure
evidence. A successful relaunch never changes the smoke result.

### npm scripts

```bash
npm run test:android          # headless one-shot: build → boot → install → test → tear down
npm run test:android:device   # run against the store-identity app on an emulator you already have running
npm run test:ios              # one-shot on the iOS simulator (macOS + full Xcode)
```

| Script                | What happens                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test:android`        | Runs `tools/mobile/android/run-smoke-test.mjs`: builds the `.dev` Release APK (`android:apk`), boots a **headless** `Pixel_7_Pro_API_33` emulator (`-no-window …`) on a console port no other emulator holds, installs the APK with `adb -s`, runs Maestro against `art.splotch.app.dev`, and **always** kills that emulator afterward — even on failure. It smokes `.dev` because a store-identity APK signs with whatever key `keystore.properties` names, which locally is the upload key or nothing; the flow runs from a copy whose only change is its `appId`. |
| `test:android:device` | Just `maestro test .maestro/smoke.yaml` against whatever device is already connected, for the store-identity app (`art.splotch.app`). Fast inner loop — you boot the emulator and install the app yourself. This is what CI uses.                                                                                                                                                                                                                                                                                                                                    |
| `test:ios`            | Runs `tools/mobile/ios/run-simulator-smoke-test.mjs`: builds the store-identity Release simulator app (`ios:simulator`), boots a shut-down iPhone simulator on the newest runtime — never one someone else booted — installs via `simctl`, runs the same Maestro flow, and shuts that simulator down. `--skip-build` installs the app an earlier `ios:simulator` built. No signing required.                                                                                                                                                                         |

> The smoke scripts are device-lifecycle glue only — Maestro does the actual assertions, and both
> platforms run the **same flow file**. The Android helper works on macOS and Linux (AVD name and
> SDK locations resolve per-platform in `tools/mobile/android/lib/android-toolchain.mjs`; override
> the SDK with `ANDROID_HOME`); the iOS helper is macOS-only and fails fast elsewhere. Maestro's
> install location resolves in `tools/mobile/lib/maestro.mjs`.

For the required iOS floor check, follow the
[manual iOS 16.4 floor gate](MOBILE/ios.md#manual-ios-164-floor-gate). Its primary path is
Maestro-free; `npm run test:ios` is only an optional diagnostic on 16.4 because the hosted
experiments could download, boot, and build for that runtime but Maestro's XCTest driver never
became reachable. `docs/COMPATIBILITY.md` distinguishes native floor proof from current-WebKit
family coverage.

### Prerequisites

1. **Android toolchain** — the same one used to build the app: Node ≥ 22, full JDK 21, and the
   Android SDK. See the `mobile` skill and the `android:*` scripts.
2. **An AVD** — the scripts default to `Pixel_7_Pro_API_33`. List yours with `emulator -list-avds`.
3. **Maestro CLI** — see below. Needs Java 17+ (the JDK 21 above covers it).

> On macOS/Linux, `npm run android:setup` provisions all three (system image, the
> `Pixel_7_Pro_API_33` AVD, **and** Maestro) and is safe to re-run — it skips whatever is already
> present.

### Installing Maestro

Maestro is **not** an npm package, so it can't be a dev dependency — it's a standalone JVM-based CLI
installed separately.

**macOS / Linux:** `npm run android:setup` installs it automatically (re-run it if Maestro is
missing). To install it on its own:

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
# adds the binary to ~/.maestro/bin
```

> Use `get.maestro.mobile.dev` — `get.maestro.dev` does not work.
>
> The smoke scripts resolve Maestro via `tools/mobile/lib/maestro.mjs` (PATH first, then
> `~/.maestro/bin`), so they run even before you reopen your shell to pick up the PATH entry the
> installer adds.

### Running it locally

```bash
# Simplest — one command, nothing to clean up:
npm run test:android

# Fast iteration — boot once, install the store-identity APK, run many times:
npm run android:boot            # boot the AVD
npm run android:apk:store  # needs android/keystore.properties
adb -s <serial> install -r android/app/build/outputs/apk/release/app-release.apk
npm run test:android:device     # re-run as often as you like
```

Install a store-identity build on an emulator or simulator only, never on a physical device.

---

## Continuous integration

| Workflow                                    | Trigger                      | Work                                                                               |
| ------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------- |
| `.github/workflows/test.yml`                | Push / PR / release tag      | Quality, browserless, export build, Chromium shards, Firefox/WebKit and page load. |
| `.github/workflows/native-compile.yml`      | Path-filtered PR / main push | RN Android Release APK and unsigned iOS Release simulator build; no boot.          |
| `.github/workflows/android-deploy.yml`      | Release tag / manual         | Test-signed store-identity RN APK and Maestro on current/floor Android.            |
| `.github/workflows/ios-deploy.yml`          | Release tag / manual         | Unsigned store-identity RN simulator build and Maestro launch.                     |
| `.github/workflows/hosted-deploy-smoke.yml` | Daily / manual URL           | Hosted contracts and Blobs persistence; production is read-only.                   |

The `native-web-build` job builds the export once from the deploy's dependency installation and
uploads it. `rn-web-e2e` shards, Firefox/WebKit and page-load jobs download that same export. They
set `SPLOTCH_E2E_PREBUILT=1`; each browser host still gets fresh server state. Browser reports
include the flaky reporter's JSON record. The deleted Svelte suite's shard timings and sweep smokes
are historical measurements, not capacity evidence for the RN suite.

Native compile watches the RN project, pnpm/build inputs and selected cross-tree inputs. Its path
contract is guarded by `tools/mobile/tests/native-release-configurations.test.mjs`. Android builds
the development-identity Release for one ABI; iOS uses CocoaPods and the unsigned simulator Release.
Compilation includes the JavaScript bundle but proves no device interaction.

The Android release smoke builds one optimized store-identity APK with a throwaway CI signing key,
then boots the same artifact on current API 33 and the declared API 24 floor. iOS boots its unsigned
Release on a current simulator. The manual iOS 16.4 gate remains separate. Both platforms select
exactly “Settings” in the same Maestro flow and upload reports. A phase that fails before the
assertion is not evidence that the app painted or failed to paint.

Hosted Deploy Smoke requires an admin secret matching the selected deployment. Production never
creates a probe token; a selected preview can perform a write/read/delete round trip. A process
interruption can strand a `blobs-smoke-*` credential, so remove the identified token manually rather
than sweeping a prefix that another run may be using. The smoke never makes a model call.

Treat timing failures causally: compare the exact base and head under the same command/runner, with
repeated or interleaved runs for noisy gates. A repository-owned flaky harness is not a product
regression. Keep historical timing studies under `docs/scratchpad/` and remeasure the current suite
before changing capacity or budgets.
