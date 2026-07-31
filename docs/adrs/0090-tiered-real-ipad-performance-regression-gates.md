# ADR-0090: Gate iPad Performance with In-Page Timings Driven by Real XCUITest Input

**Status:** Active — amends [ADR-0032](0032-performance-profiling-harness.md) and
[ADR-0084](0084-trusted-xcuitest-input-for-ipad-real-screen-profiling.md). **Date:** 2026-07

## Context

The physical-iPad campaign fixed five user-visible stalls: drawing, undo, screenshot save, theme
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
* render starvation at most 10 ms per drawing-second.

The generic discrete-action budget established by ADR-0087 and ADR-0089 is a P95 frame interval at
most 20 ms and a first/worst frame interval at most 32 ms. Thirty-two milliseconds allows one missed
60 Hz presentation; a longer gap is visible as a freeze.

## Decision

Performance regression coverage has three tiers.

### Pure and Playwright coverage stays in ordinary CI

Vitest owns the metric definitions and threshold boundaries. Existing Playwright tests continue to
guard geometry, rendering state, interaction semantics, and the production-route architecture behind
every performance fix. `perf:frames:local` remains an advisory production-route run at iPad
geometry. A local failure is actionable; a local pass cannot approve an iPad compositor change.

Absolute physical-device frame gates do not run on a shared headless GitHub runner. Its browser,
host load, GPU path, and timer variance are different from the shipping environment.

### Physical drawing and undo runs fail their calibrated gates

`perf:ipad:xcuitest` scores every captured phase through `drawing-gates.mjs`. After the
trusted-input fidelity gate passes, the command exits nonzero when any paint/starvation budget
fails, or when a requested undo run fails its existing engine/next-frame budget. `--report-only` is
the explicit diagnostic mode for finishing a broken run and retaining its artifact.

### Physical discrete actions share one suite and scorer

`perf:ipad:actions` opens the production route and repeats these families:

* action drawer, palette, brush selection, and stroke width;
* first Parent Center open, every section, theme changes, and close;
* coloring picker, book, page selection, and page removal;
* screenshot export, undo, drag-to-clear, both blank/ink rotation directions, and undoing both clear
  and its restored older stroke after a blank rotation.

Splotch's Scribble-guarded drawing controls are activated by native XCUITest pointer sequences.
Ordinary `onclick` controls inside dialogs use WebDriver's semantic element click. Treating those as
one mechanism is invalid: a WebDriver element click deliberately does not satisfy `scribbleTap`,
while coordinate tapping a dialog tile needlessly depends on Safari chrome geometry.

`action-probe.js` records requestAnimationFrame intervals inside the page. Mac-to-device WebDriver
latency is therefore outside the frame score. It reports action-to-first-frame, post-action frame
P95/max, and the raw worst intervals with their start/end relative to the input event. The interval
that straddles input delivery is scored by its action-to-frame remainder, not by time that elapsed
before the app received the event. This is material for Appium rotation: iPadOS can begin a 40–53 ms
system transition interval 15–27 ms before MobileSafari delivers `orientationchange`, while the app
still responds 23–29 ms later and every fully post-action interval remains below 25 ms. The
first-observed readiness time is retained as an upper bound, not a gate: native actions must return
from the native context before the driver can observe a DOM completion condition, so that number
includes automation round-trip time.

The command repeats the suite three times by default, writes raw samples and grouped summaries, and
fails the 20/32 ms action gates. `--report-only` lets an exploratory sweep rank every failure
instead of stopping at the first one. `--actions=` selects a focused family for one-change trials.

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

## Consequences

* \+ The budgets used to approve the iPad fixes are executable gates rather than prose in an ADR.
* \+ One action artifact can rank regressions, preserve noisy samples, and drive serial focused
  trials without rewriting probe scripts.
* \+ Provider choice is isolated to an endpoint and capabilities file; local physical-device runs
  remain the authoritative fallback.
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

## Reproducing

Local physical iPad:

```sh
npm run perf:ipad:actions --ignore-scripts -- \
  --device-id=<udid> \
  --url=http://<mac-lan-ip>:4173/ \
  --repeats=3
```

Focused diagnostic:

```sh
npm run perf:ipad:actions --ignore-scripts -- \
  --device-id=<udid> \
  --actions=coloring,screenshot,undo,rotation \
  --report-only
```

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
