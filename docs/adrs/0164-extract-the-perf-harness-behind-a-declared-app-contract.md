# ADR-0164: Extract the Performance Harness Behind a Declared App Contract

**Status:** Proposed — the seam is drafted and type-checked, not yet implemented; issue #1523 tracks
the extraction. **Date:** 2026-09

## Context

`tools/perf` is 41k lines across 136 files driving 40 npm scripts, the largest code mass in the repo
after the component tree, and most of it is not about drawing. It is a cross-platform frame-timing
capture-and-scoring harness spanning desktop engines, iOS web and native, and Android web and
native, with WebDriver, WebKit Inspector, CDP, `adb`, and WebDriverAgent transports. Issue #1523
asks for the generic half to live in its own repository, consumed as a pinned `devDependencies`
entry, leaving Splotch's scenarios, gates and campaign orchestration behind.

Reading every module (rather than classifying by keyword) found the boundary is not where the file
names put it. Most `lib/` modules are a generic mechanism with a Splotch value welded in: a
selector, a mark name, a package id, a repo path, an exception table keyed by target id; the
per-file dispositions are in the draft's `boundary.md`. `real-screen-stats.mjs` is 95% generic with
six literal `engine.*` sites; `refresh-regime.mjs` is entirely generic and already takes the target
table as an argument; `campaign-plan.mjs` is three files wearing one name. The probes cannot import
anything and so carry a third copy of every selector. Two entry points under `ios/` are
simultaneously entry points, plan owners and the Appium client for five other runners.

What is actually missing is the thing the issue named: a scenario contract. Today scenario knowledge
and capture mechanics are interleaved because there is no declared place for the app's knowledge to
enter. Four copies of the brush selectors exist (one already drifted), and the split-capture
bootstrap re-implements the same interactions as the WebDriver helpers because it has no script
channel and the route's CSP forbids eval.

Alternatives considered:

* **Extract by directory, as the issue's table suggests.** Rejected: the keyword classification puts
  calibration-bearing modules on the generic side and generic mechanisms on the app side, and moving
  files without a declared contract moves the coupling with them.
* **An in-repo pnpm workspace package.** Rejected, as the issue notes: `pnpm-workspace.yaml`
  deliberately has no members because `cap sync` writes resolved paths into committed native files
  (ADR-0119, ADR-0053).
* **Leave the harness in place and only document the seams.** Rejected: prose does not stop the
  fourth copy of a selector, and the issue's payoff is the contract, not the tidiness.

## Decision

The harness is extracted behind one declared object, an **app contract**, and the extraction
proceeds along ADR-0053's escalation path in that order: the contract lands in place and the
existing runners read it, then a nested independently installed package under `tools/` (not a
workspace member, its `node_modules` off Capacitor's resolution path), and only when a second
consumer or an independent release cadence exists, a separate repository consumed as an exact-pinned
`devDependencies` entry. The nested rung is the first packaging step because it keeps every drift
guard, corpus test and script in one commit while forcing the self-containment a separate repo
needs.

The contract and the surface around it are drafted as typed declarations in
`docs/scratchpad/perf-rig-api-draft-2026-09/`, with Splotch's forty scripts written against them and
type-checked. The draft fixes these properties of the seam:

* **Everything app-specific enters through `defineApp`.** Selectors, hooks, mark names, build seams,
  native ids, storage seeds, dimensions such as theme and orientation, selectable modes and
  measurable controls. The package holds none of its own. The in-page probes are rendered from the
  contract, so the copy the probe carries is the same copy the Node side reads.
* **Page interactions are data, compiled per channel.** A small procedure vocabulary (click, tap,
  press, type, wait for presence or layout, poll until, branch, retry that checks before its first
  run, settle, evaluate app-supplied function source) lets one declared procedure run through
  Playwright, Appium, and the injected same-origin bootstrap. A postcondition is evaluated in the
  channel that ran the steps, which on the plan-polled split channel means inside the page; a
  procedure without one is recorded as unverified. Tool priming is a protocol (apply, verify-only
  after the settle, repair and record, acknowledge between passes), not a boolean.
* **Targets are data; transports are proved pairings.** A target names its drawing transport, its
  actions transport and its measurement channel independently (ADR-0135), and the package refuses a
  pairing it has not proved. Splotch's eleven targets stay in Splotch, drift-guarded against the
  docs table as today.
* **Every guard is a named entry in the artifact's trust ledger.** Served-build identity, seams
  present, page-identity nonce, route hydrated, committed mode, hit-test, dimension observed,
  painted output, host quiet, instrument restored, and the rest: recorded as verified, failed,
  unrecorded, or not-applicable. A failure stops the capture before measurement and still writes the
  artifact. The plausible-wrong-number catalogue in `docs/PROFILING-CAMPAIGNS.md` maps onto this
  ledger, and the draft names which traps remain documented-only.
* **Calibration stays with the app.** Fidelity expectations, gate thresholds, exceptions and
  allowances are Splotch's, with a basis string on each, because ADR-0139 calibrates them against
  the tracked corpus that does not travel with a library. The package ships the check vocabulary and
  the tri-state (failed, uncalibrated, not-applicable) from ADR-0141.
* **One artifact inspector.** The campaign runner and the matrix generator call the same acceptance
  function; two conforming implementations once disagreed on absent-data boundaries.
* **Scripts keep their names.** ADR-0019's catalogue is the public API; every `perf:*` script
  survives verbatim as a few lines over the package or as a Splotch script composing package calls.

## Consequences

* \+ The boundary is a type, not a directory. Adding a fifth transport or a second app means writing
  a contract, and `doctor` says which hook is missing before a capture runs.
* \+ The Splotch side shrinks to what is about Splotch: the contract, targets, gates, scenarios, the
  campaign definition, the matrix model, the corpus, and the tests calibrated against it.
* \+ Under ADR-0070 the package lands in `devDependencies`, which Netlify skips.
* − The procedure vocabulary is a constraint on what a scenario can do without an app hook. That is
  deliberate: an interaction the vocabulary cannot express is a missing hook, not a missing branch.
* − Versioning crosses the seam once the package is published. The `COMPAT` policy is the answer,
  and the reason the separate repository is the last rung rather than the first.
* − The release-seam guard derives its forbidden tokens from the app's own source; mark emission
  stays inline in the app, and the contract only names the marks.
* The draft's `critique-rounds.md` records what the adversarial review rounds changed and what was
  declined; `migration.md` names the proof each phase must produce, ending with a real capture on a
  physical target and a campaign resume against a pre-extraction ledger.
