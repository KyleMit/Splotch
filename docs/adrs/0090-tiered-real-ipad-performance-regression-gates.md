# ADR-0090: Gate iPad Performance with In-Page Timings Driven by Real XCUITest Input

**Status:** Active — amends [ADR-0032](0032-performance-profiling-harness.md) and
[ADR-0084](0084-trusted-xcuitest-input-for-ipad-real-screen-profiling.md); amended by
[ADR-0092](0092-direct-cdp-android-browser-action-profiling.md) and
[ADR-0093](0093-two-tier-webkit-commit-gate-in-ci.md). **Date:** 2026-07

> **Amended by [ADR-0111](0111-verb-object-tool-names-and-capability-documentation.md):** the
> regression tiers and gates remain in force. Their commands are now `perf:ios:xcuitest:screen`,
> `perf:ios:xcuitest:actions`, `perf:web:actions`, and `perf:web:frames`.

> **Amended by [ADR-0142](0142-rotation-actions-anchor-at-resize.md):** rotation actions now anchor
> at `resize` alone. The transition analysis below that reads "the app still responds 23–29 ms
> later" described the old `orientationchange` anchor's view; under ADR-0142 that window is
> attributed to the browser's rotation transition, and the rotation first-frame gate's per-runtime
> meaning is stated there.

## Context

The physical-iPad campaign fixed six user-visible stalls: drawing, undo, screenshot save, theme
switch, coloring-page selection, and rotation. The repository had empirical tools for each
investigation, but they were not yet a regression system:

* `perf:ipad:xcuitest` failed input-fidelity errors while only reporting drawing starvation and undo
  threshold failures.
* The one-off action probes lived outside the repository, used a retained Appium session, and did
  not share one action or result schema.
* Playwright WebKit could validate behavior and catch JavaScript-side regressions, but ADR-0085
  established that desktop WebKit did not reproduce the iPad display-process surface cliff at any
  emulated viewport, DPR, or CPU throttle.
* CI owned no physical iPad. Adding one permanently connected self-hosted device would make a
  contributor's local setup into release infrastructure.

The drawing acceptance budget was already calibrated in ADR-0085 against MobileSafari's observed 60
Hz web cadence:

* paint P95 at most 20 ms;
* paint P99 at most 33 ms;
* paint max at most 50 ms;
* cumulative lost frame time at most 1% of in-contact time.

The drawing gate sums every late frame's time beyond the fixed 16.67 ms ceiling, even when an
already-degraded capture reports a slower observed cadence. Long-gap episodes remain a forensic
view: marked engine time is subtracted from an episode's unexplained duration, while engine share
and trusted-move count stay visible instead of removing the episode. Whole-window, in-contact, and
between-stroke populations use their own elapsed-time denominators.

The generic discrete-action budget established by ADR-0087 and ADR-0089 is a P95 frame interval at
most 20 ms, an action-to-first-frame remainder at most 33.5 ms, and a worst action-attributed
post-action interval at most 33.5 ms. The max admits two exact 60 Hz vsync intervals plus timer
precision; the next 50 ms interval is the visible freeze.

## Decision

Performance regression coverage has three tiers.

### Pure and Playwright coverage stays in ordinary CI

Vitest owns the metric definitions and threshold boundaries. Existing Playwright tests continue to
guard geometry, rendering state, interaction semantics, and the production-route architecture behind
every performance fix. `perf:frames:local` remains an advisory production-route run at iPad
geometry. A local failure is actionable; a local pass cannot approve an iPad compositor change.

`perf:desktop:actions` reuses the physical suite's exact 46-action plan, in-page probe, scorer, and
20/33.5 ms gates through a Playwright transport. It provides a headed, real-Mac regression
comparison without maintaining a second action vocabulary. Its `--url=` flag deliberately separates
the runner from the target build: the current runner can drive a historical build served from a
detached worktree, so architecture comparisons do not accidentally compare different probes or
inputs. `perf:frames:local` has the same external-URL seam and can select pen, crayon, Magic, or
eraser. These desktop results can reject a change and compare renderer architectures, but they
cannot replace the physical-iPad approval tier established by ADR-0085.

Absolute physical-device frame gates do not run on a shared headless GitHub runner. Its browser,
host load, GPU path, and timer variance are different from the shipping environment.

ADR-0093 adds a narrower shared-runner WebKit gate for catastrophic commit-path shape regressions.
Its 25 ms threshold is deliberately far above healthy desktop measurements and does not approve any
physical-device frame budget; the real-iPad tiers in this record remain authoritative for those.

### Physical drawing and undo runs fail their calibrated gates

`perf:ipad:xcuitest` scores every captured phase through `drawing-gates.mjs`. After the
trusted-input fidelity gate passes, the command exits nonzero when any paint/lost-frame budget
fails, or when a requested undo run fails its existing engine/next-frame budget. `--report-only` is
the explicit diagnostic mode for finishing a broken run and retaining its artifact.

Before a trusted gesture, the runner persists the Install Banner's dismissed state, unregisters
existing service workers and caches on both sides of the cache-busted navigation, and blocks
service-worker registration in the measured page. The artifact records both pinned PWA conditions.
Probe installation is an immediate gate, and SIGINT/SIGTERM cleanup closes an owned WebDriver
session and preview server before exiting. `perf:frames:local` passes brush selection through the
probe config, so every brush uses the same closed-drawer page shape and records its brush in the
probe report.

### Physical discrete actions share one suite and scorer

`perf:ipad:actions` opens the production route and repeats these families:

* action drawer, palette, brush selection, and stroke width;
* first Settings open, every section, theme changes, and close;
* coloring picker, book, page selection, and page removal;
* screenshot export, undo, drag-to-clear, both blank/ink rotation directions, and undoing both clear
  and its restored older stroke after a blank rotation.

Splotch's Scribble-guarded drawing controls are activated by native XCUITest pointer sequences.
Ordinary `onclick` controls inside dialogs use WebDriver's semantic element click. Treating those as
one mechanism is invalid: a WebDriver element click deliberately does not satisfy `scribbleTap`,
while coordinate tapping a dialog tile needlessly depends on Safari chrome geometry.

Trusted setup determines whether ink exists from the Screenshot button's enabled state, not Undo.
Clear is itself undoable, so enabled Undo can describe a blank canvas and silently turn a with-ink
rotation into a blank-path sample.

`action-probe.js` records requestAnimationFrame intervals inside the page. Mac-to-device WebDriver
latency is therefore outside the frame score. It reports action-to-first-frame, post-action frame
P95/max, and the raw worst intervals with their start/end relative to the input event. The interval
that straddles input delivery is scored by its action-to-frame remainder, not by time that elapsed
before the app received the event. This is material for Appium rotation: iPadOS can begin a 40–53 ms
system transition interval 15–27 ms before MobileSafari delivers `orientationchange`, while the app
still responds 23–29 ms later and every fully post-action interval remains below 25 ms.

Every raw post-action frame remains in the artifact, split into response and settle fields. The P95
and maximum gates apply only while work is attributable to the action. The scorer opens an
observation window at input, reopens it for later DOM or canvas mutation, engine measures,
resize/orientation activity, and keeps it open while a transition or animation is active. Each
signal carries the stable-frame tail owned by `ACTION_SETTLE_TAIL_FRAMES`, so the frame that
presents the work and an immediate pacing recovery remain scored. A late requestAnimationFrame
omission after a static quiet window remains visible in the raw distribution without diluting or
failing the product action. Deferred work cannot hide behind an earlier quiet period because its
activity reopens the window; the scoring-window rule has no action-name exceptions. (The P95
*budget* gained one calibrated, capture-scoped exception in 2026-08 — see the amendment below.)

The first-observed readiness time is retained as an upper bound, not a gate or attribution signal:
native actions must return from the native context before the driver can observe a DOM completion
condition, so that number includes automation round-trip time. Readiness without a corresponding
page activity does not extend the scored window.

The command repeats the suite four times by default. The first repeat is an unscored warmup retained
in the artifact; every label then needs at least three scored samples. An uncaptured or explicitly
untrusted activation fails its group, and a label established by the warmup cannot disappear from
the scored repeats. Selecting rotation always exercises both blank and ink paths, including the
clear/undo setup that makes the blank path meaningful. The runner writes raw samples and grouped
summaries and fails the 20/33.5 ms action gates. `--report-only` lets an exploratory sweep rank
every failure instead of stopping at the first one. `--actions=` selects a focused family for
one-change trials. Parent-setting actions normalize known baselines around every sound, auto-save,
advanced-control, and button-visibility round trip, then restore the device's observed initial
preference in a `finally` block, including after a measurement failure. Settings navigation uses
each section's stable `data-section` id rather than its position in the list.

The first full-suite campaign separated genuine action-local failures from native intervals that
began before event delivery, then fixed the genuine cases one at a time:

| Ranked action                                        | Baseline ms | Final ms | Owning decision |
| ---------------------------------------------------- | ----------: | -------: | --------------- |
| Blank rotation immediately after clear               |     111–129 |       23 | ADR-0089        |
| Ink return after that blank/undo sequence            |         131 |       24 | ADR-0089        |
| Drag-to-clear                                        |       75–83 |       20 | ADR-0086        |
| Cold What's New first response                       |       40–65 |       16 | ADR-0061        |
| Magic-brush selection (first response / post-action) |     92 / 66 |   8 / 18 | ADR-0043        |
| Cold custom-color picker open                        |          41 |       18 | ADR-0048        |
| Crayon-brush selection                               |       29–45 |       20 | ADR-0065        |

“Final” is the maximum fully post-action interval except for What's New, whose problem and final
value are action-to-first-frame; Magic shows both because both failed. The final production
candidate ran all 46 actions three times: every action passed; first-response P95 was at most 29 ms,
post-action P95 was 17 ms throughout, and post-action maxima were at most 32 ms. One coloring-book
open reached that hard-max boundary; its immediate five-repeat follow-up measured 17 ms P95 and 20
ms max, so it was not a reproducible failure. The slower repeatable passing tails were custom-color
selection at 29 ms, coloring-page selection at 27 ms, What's New at 25 ms, ink-color selection at 24
ms, and rotations at 20–22 ms. The added Settings setting round trips measured 17 ms P95 throughout
and at most 24 ms in their five-repeat audit. These remain ranked watchpoints rather than additional
fixes because they pass both action gates and have no repeated P95 miss.

### Hosted-device CI uses the same Appium protocol

The runner accepts `--appium-url=` with HTTP basic credentials and a `--capabilities-file=`
containing provider capabilities. No provider SDK is part of the app, and credentials never enter
the repository.

The recommended hosted workflow is:

1. run the pure/Playwright tier on every pull request;
2. run three repeats of the full real-iPad suite nightly and before a release;
3. allow a manual focused run on a performance-sensitive pull request;
4. pin one iPad model and OS per baseline, store the JSON artifact, and recalibrate rather than
   silently comparing different hardware;
5. host the preview at a reachable review URL or use the provider's secure local tunnel.

[BrowserStack's real-iOS Playwright service](https://www.browserstack.com/docs/automate/playwright/playwright-ios/nodejs)
supports real iPhones/iPads and CI, and its
[device catalog](https://www.browserstack.com/list-of-browsers-and-platforms/app_automate) includes
12.9-inch iPad Pro models. Its
[Local integration](https://www.browserstack.com/docs/automate/playwright/github-actions) can reach
a CI preview. It is the preferred first evaluation because the device catalog matches the affected
form factor and it leaves open both Appium and real-iOS Playwright workflows.

[Sauce Labs Real Device Cloud](https://docs.saucelabs.com/mobile-apps/automated-testing/appium/real-devices/)
supports Appium mobile-web Safari, tablet-only dynamic allocation, and
[Sauce Connect](https://docs.saucelabs.com/secure-connections/sauce-connect-5/quickstart/). It is
the direct Appium alternative if its account's device API exposes a stable equivalent iPad.

[AWS Device Farm remote access](https://docs.aws.amazon.com/devicefarm/latest/developerguide/appium-endpoint-interaction.html)
exposes an Appium endpoint and supports Safari mobile-web sessions. It can run the protocol, but its
remote-session setup and preview reachability make it a less direct developer/CI loop.

Firebase Test Lab is not selected. Its iOS automation path is XCTest/XCUITest rather than a remote
Appium session, and its
[official troubleshooting guide](https://firebase.google.com/docs/test-lab/troubleshooting) states
that Appium support is not committed. Reusing this JavaScript runner would require a second test
implementation.

No account, credential, paid plan, or CI workflow is created by this decision. Provider evaluation
must first prove that in-page requestAnimationFrame timing is stable on a pinned tablet and that
rotation, native trusted touch, and local-tunnel preview access all work.

### Cross-platform snapshots reuse the transport, not the iPad baseline

The Appium endpoint and capability-file seam also supports Android Chrome, iOS/Android simulators,
and native Capacitor WebViews. `--native-app` attaches to the app-owned WebView without navigating
it to an HTTP URL, `--native-webview-class` supplies the platform accessibility class, and context
selection accepts both `WEBVIEW_*` and Android's `CHROMIUM` name. CSS canvas coordinates are mapped
through browser chrome for mobile web and directly through the edge-to-edge WebView for native apps.
The action runner supports both Settings' tablet sidebar and phone drill-in shell.

This is transport and metric-schema reuse, not baseline inheritance. Safari's trusted-input
calibration does not approve simulator input, Android automation with missing contact geometry, or a
Capacitor WebView whose coalescing signature differs from MobileSafari. Those captures are advisory
until each physical deployment target has its own hand-calibrated fidelity bounds.

A deployment-matrix report may combine retained full sweeps with later focused recaptures only when
it preserves product-commit provenance for every drawing run, undo result, and action result. Action
sources are applied in manifest order, and a focused source replaces only its declared labels. The
report must identify its final performance-affecting commit and must not relabel older device
evidence as current-build evidence when a target cannot be recaptured.

The iOS Simulator is nevertheless a rejection tier for the known renderer architecture. A negative
control served and installed the pre-tiling commit `2769ceae` while retaining the current runner and
input plan. On the same iPad Pro 13-inch Simulator, the historical web build measured Crayon at
37/59/81 ms P95/P99/max with 79.52 ms/s starvation and Magic at 1371/1604/1653 ms with 650.69 ms/s
starvation. Historical native measured Crayon at 75/94/117 ms with 185.74 ms/s starvation and Magic
at 1046/1246/1296 ms with 767.63 ms/s starvation. The current tiled web/native builds measured Magic
at 15/16/17 and 16/18/20 ms respectively, and both historical undo paths missed the next-frame gate.
The Simulator therefore catches a reintroduction of the original drawing-starvation and async-undo
classes without physical hardware. It may reject a candidate before the device run; only calibrated
physical input may approve one.

Native Splotch defaults to a persisted orientation lock. A rotation sweep opens the real Settings
Appearance section, disables the lock through `#lockRotationToggle`, reloads so the Capacitor plugin
releases the Activity/controller lock, and restores the setting through the same UI before closing
the session. Forcing Appium orientation while leaving the product lock active is invalid: it either
fails at the driver or measures a state the app intentionally prevents. A profiling-only preference
mutation seam was rejected because it would measure a state transition that no parent performs and
would need a second implementation of product persistence semantics.

Native screenshot profiling has one narrower seam at the external persistence boundary. A
`PERF_MARKS` build may provide `window.__screenshotSaveSink` so the action suite observes completion
without writing benchmark images to Photos or blocking on a system permission sheet. It receives the
already-produced PNG and does not alter rendering. Normal builds dead-code-eliminate it, and a
post-build release scan fails if the screenshot sink, drawing-debug seams, or `engine.*` mark names
survive in the client bundle.

## Consequences

* \+ The budgets used to approve the iPad fixes are executable gates rather than prose in an ADR.
* \+ One action artifact can rank regressions, preserve noisy samples, and drive serial focused
  trials without rewriting probe scripts.
* \+ Static renderer omissions remain in raw action artifacts while the gate distinguishes them from
  input-, render-, transition-, and deferred-work intervals attributable to the action.
* \+ Provider choice is isolated to an endpoint and capabilities file; local physical-device runs
  remain the authoritative fallback.
* \+ The same probe and scorer can produce deployment-matrix snapshots across mobile web and native
  shells without forking performance definitions.
* \+ Normal CI keeps deterministic behavior and metric-definition tests without pretending a Linux
  runner can approve iPad compositing.
* − The full suite takes several minutes because each measured tap uses the real native path and
  observes settling frames.
* − Hosted-device gates cost money and still require baseline discipline. A provider changing the
  allocated model or OS invalidates direct timing comparisons.
* − requestAnimationFrame measures browser scheduling, not photons at the glass. System-level
  verification still uses Instruments frame-lifetime traces when a gap's attribution is ambiguous.
* − First-observed readiness is useful for finding gross regressions but includes driver return
  latency and cannot be compared to a local JavaScript duration.
* − Simulator and non-calibrated platform rows are comparative evidence, not release approval for a
  physical device.

## Reproducing

Local physical iPad:

```sh
npm run perf:ipad:actions --ignore-scripts -- \
  --device-id=<udid> \
  --url=http://<mac-lan-ip>:4173/ \
  --repeats=4
```

Focused diagnostic:

```sh
npm run perf:ipad:actions --ignore-scripts -- \
  --device-id=<udid> \
  --actions=coloring,screenshot,undo,rotation \
  --report-only
```

## Amendment (2026-08): a documented, capture-scoped P95 allowance

PR #1124's Settings prewarm left `open Settings` with two irreducible ~21-25 ms frames on the
physical iPad — the `showModal` flip itself (paint-independent: an opacity-hidden A/B still measured
it) and the heaviest section's staged reveal — while halving the action's worst frame against the
tap-mount baseline (25 ms vs 47 ms). Rather than loosen the shared 20 ms P95 budget, the scorer now
takes per-action allowances as an argument: `IOS_ACTION_FRAME_P95_ALLOWANCES_MS` in
`tools/perf/lib/action-stats.mjs` is the documented exception ledger for the calibrated physical-iOS
capture only, `perf:ios:xcuitest:actions` passes it and records it into each capture as
`gateAllowances`, and `gen-performance-matrix` re-scores a capture under its own recorded metadata.
Desktop and Android actions harnesses pass no allowances, and historical captures carry no
`gateAllowances` field, so both stay on the base gates — keeping this ADR's principle that
cross-platform snapshots reuse the transport and schema, never the iPad baseline. A regression past
an allowance still fails; the full measurements live in ADR-0049's amendment.

## Amendment (2026-08-26): a max-frame allowance for the same action, attributed off-app

`open Settings` breached the separate 33.5 ms max-frame gate at 44-55 ms on every theme-focused
automated physical run since 2026-08-17, identically at base and branch, while staying inside its
P95 allowance (issue 1130). Two independent instruments attribute the frame off the app: the issue's
Time Profiler capture found no saturated `com.apple.WebKit.WebContent` main-thread run under it, and
a 2026-08-26 Animation Hitches trace over a focused six-open sweep put every hitch in
`AutomationModeUI`, `pointeruid` (the synthetic-touch pointer overlay), SpringBoard, and
MobileSafari chrome — WebContent never hitched. The stall is the automation apparatus's own
compositor contention around the `showModal` flip, so the exception ledger gains a max-frame half
under the same rules: `IOS_ACTION_GATE_ALLOWANCES` carries `{ p95, max }`, `open Settings` is
allowed 56 ms (the observed three-beat frame plus jitter), a flat legacy `gateAllowances` map
re-scores exactly as it always did (P95 allowance only), and every other action and target stays on
the base max gate. A real finger's open should not show the frame at all — worth a spot-check
whenever an operator is at the device.

## Amendment (2026-08): theme switches activate by trusted native tap

The dialog-controls rule above ("ordinary `onclick` controls inside dialogs use WebDriver's semantic
element click") carries one measured exception: the two theme switches. A WebDriver element click
executes as an Inspector-evaluate atom on the page's main thread, and a theme switch is gated on the
single frame the entire document restyles in — a Time Profiler capture on issue #976 attributed
10-15 ms of the ~38 ms dark-to-light worst frame to that atom plus the element click's focus-driven
`scrollToFocusedElement` layout, against ~15-22 ms of actual product cost. For every other dialog
control the atom runs in a frame nobody scores, so the convention stands; for the theme rows the
activation mechanism itself was the largest line item in the gated number. They now use the default
trusted native tap (like Settings open/close), accepting the chrome-geometry dependence the rule
avoids because a mis-aimed tap self-reports: native-touch activation requires captured trusted
events, so a missed button fails activation rather than polluting the distribution.

Hosted Appium endpoint:

```sh
npm run perf:ipad:actions --ignore-scripts -- \
  --appium-url=https://<user>:<access-key>@<provider-endpoint>/wd/hub \
  --capabilities-file=/path/outside/repo/ipad-capabilities.json \
  --url=https://<reachable-preview>/
```

The capability file is provider-owned input. It must select Safari on one explicit real iPad model
and OS, name the build/session for provider dashboards, and enable the provider's local tunnel only
when `--url` points at the CI runner.
