# Boundary map: what moves, what splits, what stays

The disposition of every `tools/perf`, `tools/app-driver`, and `tools/perf/probes` file, decided by
reading each module rather than by keyword (issue #1523's first done-when item). The three verbs:

* **moves** — ships in the harness package as-is or with a parameter replacing a hard-coded value.
* **splits** — the mechanism moves; the Splotch data (selectors, thresholds, ids, paths) stays and
  is passed in through the declared contract.
* **stays** — Splotch scenario, gate, vocabulary, or product knowledge. Consumes the package.

Line counts are from the 2026-09-09 tree. The surveys behind this table are summarised in
`critique-rounds.md`; the raw agent reports were session scratch and are not retained.

## `tools/perf/lib/` (42 files, 7,211 lines)

| Module                       | Verb   | What crosses the seam                                                                                                                                                                                                            |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `error-classification.mjs`   | moves  | Nothing to inject.                                                                                                                                                                                                               |
| `host-quiet.mjs`             | moves  | Threshold becomes a named option with the same default.                                                                                                                                                                          |
| `capture-attribution.mjs`    | moves  | Nonce minting and audit.                                                                                                                                                                                                         |
| `performance-thresholds.mjs` | moves  | `LONG_TASK_MS` joins the package constants.                                                                                                                                                                                      |
| `performance-units.mjs`      | moves  |                                                                                                                                                                                                                                  |
| `profile-devices.mjs`        | moves  | Viewport presets; the campaign's desktop viewports stay with the Splotch target table.                                                                                                                                           |
| `cli-args.mjs`               | moves  | Drops the `PORT_ROLES` import; default port comes from the rig definition.                                                                                                                                                       |
| `frame-stamps.mjs`           | moves  | Epoch vocabulary is a package schema constant.                                                                                                                                                                                   |
| `timeline-records.mjs`       | moves  |                                                                                                                                                                                                                                  |
| `webkit-inspector.mjs`       | moves  | The only npm dependency (`ws`) travels with it.                                                                                                                                                                                  |
| `webdriver-client.mjs`       | moves  | The Playwright-over-WebDriver facade is the `desktop` transport's client.                                                                                                                                                        |
| `chrome-trace-capture.mjs`   | moves  | Comments mention `engine.*`; code is generic.                                                                                                                                                                                    |
| `refresh-regime.mjs`         | moves  | Already takes the target table as an argument — the pattern the rest follows.                                                                                                                                                    |
| `undo-gate-failures.mjs`     | moves  | Fingerprint format for gate breaches; the `no-commit-samples` token becomes a caller-named cause.                                                                                                                                |
| `device-identifiers.mjs`     | splits | Scanner moves; the Samsung serial pattern and fake ids are rig config.                                                                                                                                                           |
| `instruments-trace.mjs`      | moves  | Temp filename loses its prefix; its private `percentile` is reconciled with the shared one.                                                                                                                                      |
| `input-fidelity.mjs`         | splits | The verdict engine, check vocabulary and tri-state (`failed` / `uncalibrated` / `not-applicable`) move; `RUNTIME_EXPECTATIONS` and the two thresholds stay, because ADR-0139 calibrates them against the tracked Splotch corpus. |
| `real-screen-stats.mjs`      | splits | ~95% moves. Injected: `{commit, draw}` measure names and the namespace prefix; phase passthrough fields (`paperActive`, `halos`); the `'page'` baseline key.                                                                     |
| `capture-readiness.mjs`      | splits | All decisions move; `PORT_ROLES` becomes the rig definition's port table; the probe-host protocol probe is injected.                                                                                                             |
| `action-stats.mjs`           | splits | Scorer moves. `ACTION_GATE_ALLOWANCE_LEDGERS`, the label-keyed allowance tables, `rotationFirstFrameNa`'s label regex, and the `action-applicability` import stay as Splotch gate policy.                                        |
| `campaign-ledger.mjs`        | moves  | Status names become caller-declared; "spends an attempt" is a set passed in.                                                                                                                                                     |
| `drawing-gates.mjs`          | splits | `scoreDrawingPhase`/`scoreDrawingRun` move; the thresholds and the `target:brush` exception table stay.                                                                                                                          |
| `campaign-reference.mjs`     | splits | Drift report moves with `measureOf(artifact)` and metric name injected; `'blank'` and `lostFrameTimeShare` stay in the Splotch campaign definition.                                                                              |
| `instrument-fingerprint.mjs` | splits | Hashing/comparison move; the command → files map is app config (paths inside the package resolve through `import.meta.resolve`).                                                                                                 |
| `profile-preview.mjs`        | splits | Served-build digest engine and `buildAndPreview` move behind a `BuildContract`: entry/chunk matchers, build dir, build command, remedy text are app-declared.                                                                    |
| `profile-device-session.mjs` | splits | Moves; server spawner and freshness assertion are injected instead of imported upward.                                                                                                                                           |
| `profile-artifacts.mjs`      | splits | Writer moves; analyzer is composed by the caller, filenames come from a name map.                                                                                                                                                |
| `profile-paths.mjs`          | moves  | Output root is a required option; the `perf-profiles/` default is Splotch config.                                                                                                                                                |
| `profile-warnings.mjs`       | stays  | Five lines about `PERF_MARKS`; the package's `doctor` reports the same condition from the build contract.                                                                                                                        |
| `build-provenance.mjs`       | splits | `buildDir` becomes required.                                                                                                                                                                                                     |
| `build-variant.mjs`          | splits | `buildDirHoldsVariant(dir, {markerFile, absentFiles})` moves; the SvelteKit static-export file list stays with `tools/mobile`.                                                                                                   |
| `grant-log.mjs`              | splits | Path and salt are rig config.                                                                                                                                                                                                    |
| `undo-action-stats.mjs`      | splits | Renamed to an action-response summariser with the three gates injected; the undo naming and thresholds stay.                                                                                                                     |
| `undo-fast-set.mjs`          | splits | Selection algorithm moves fully parameterised; defaults, validator and appender keep their Splotch bindings on the Splotch side.                                                                                                 |
| `campaign-plan.mjs`          | splits | Three files in one. Host-reachability classifier (L378–496) and the plan expander move; the target registry, item vocabulary, artifact-path scheme, gesture contract and the eraser/undo evidence readers stay.                  |
| `campaign-state.mjs`         | stays  | Every Settings selector; theme and rotation drivers become `SetupProcedure` data against the contract.                                                                                                                           |
| `toddler-session.mjs`        | stays  | Becomes a `session` scenario definition.                                                                                                                                                                                         |
| `eraser-fill.mjs`            | stays  | Becomes a mode `prime` procedure with injectable function source.                                                                                                                                                                |
| `undo-driver.mjs`            | stays  | Becomes a `MeasuredAction` in the contract (`engine.undo` measure, `#undoButton`).                                                                                                                                               |
| `undo-scenario-keys.mjs`     | stays  |                                                                                                                                                                                                                                  |
| `undo-commit-gate.mjs`       | stays  |                                                                                                                                                                                                                                  |
| `action-applicability.mjs`   | stays  |                                                                                                                                                                                                                                  |

## `tools/perf/split-capture/` (15 files)

| Module                        | Verb   | What crosses the seam                                                                                                                       |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/probe-host-protocol.mjs` | moves  | Protocol token is versioned by the package.                                                                                                 |
| `lib/probe-host.mjs`          | splits | Host moves; probe source path, default plan and the eraser-refill route become generic "priming request" plumbing.                          |
| `lib/chrome-tabs.mjs`         | moves  |                                                                                                                                             |
| `lib/poll.mjs`                | moves  |                                                                                                                                             |
| `lib/report-store.mjs`        | moves  | Thickness measure stays `events.length` by contract.                                                                                        |
| `lib/android-input.mjs`       | splits | Everything moves except `art.splotch.app/.MainActivity`.                                                                                    |
| `lib/input-verdict.mjs`       | splits | Shape moves; thresholds are the app's fidelity table.                                                                                       |
| `lib/page-bootstrap.mjs`      | splits | The 17-step sequence becomes the package's bootstrap compiler; every selector, hook and procedure it embeds is read from the `AppContract`. |
| `serve-probe-host.mjs`        | moves  | Ports and report dir from rig config.                                                                                                       |
| `capture-device-frames.mjs`   | splits | The `{openPage, boundsFrom, runtimeIdentity, dispatch}` driver interface and the run sequence move; brush list, bundle ids, geometry stay.  |
| `capture-hand-input.mjs`      | splits | Same; operator copy and runtime UA rules move with a runtime table.                                                                         |
| `serve-floor-control.mjs`     | splits | Floor control moves as a diagnostic; its DOM is generated from the contract's selectors.                                                    |
| `measure-probe-overhead.mjs`  | moves  | Two-arm design; brush priming becomes mode priming.                                                                                         |
| `verify-android-input.mjs`    | moves  | Gesture plan and runtime id are arguments.                                                                                                  |
| `verify-android-rotation.mjs` | moves  |                                                                                                                                             |

## `tools/perf/probes/` (5 files)

Probes cannot import Node modules, so every selector they hold is duplicated app knowledge today.
The package ships each probe as a **template** rendered from the `AppContract` at capture time (and
at `perf-rig probe render` time for the paste-into-Inspector workflow).

| Probe                         | Verb   | Notes                                                                                 |
| ----------------------------- | ------ | ------------------------------------------------------------------------------------- |
| `real-screen-probe.js`        | splits | Recorder moves as a template; selectors, phase plan and suppression CSS are app data. |
| `action-probe.js`             | splits | Moves; `canvasKind()` classification is a contract field.                             |
| `engine-gates.js`             | stays  | Drives Splotch's `/dev/engine` API directly.                                          |
| `input-recorder.js`           | splits | Recorder moves; the action recogniser table is app data.                              |
| `first-stroke-experiments.js` | stays  | A diagnostic memoir, not harness.                                                     |

## Entry points

| File                                   | Verb   | Notes                                                                                                                                           |
| -------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `web/capture-web-session.mjs`          | stays  | Thin: `capture(app, target, sessionScenario)`.                                                                                                  |
| `web/capture-web-mount.mjs`            | splits | The most generic runner; becomes the `mount` scenario kind.                                                                                     |
| `web/capture-settings-open.mjs`        | splits | Becomes the `first-show` scenario kind; the shells table stays.                                                                                 |
| `web/capture-webkit-session.mjs`       | stays  | Thin.                                                                                                                                           |
| `web/capture-desktop-actions.mjs`      | stays  | Thin: `capture` with the actions scenario over the desktop transport.                                                                           |
| `web/capture-local-frames.mjs`         | stays  | Thin.                                                                                                                                           |
| `web/replay-input-recording.mjs`       | stays  | An `engine` scenario; the replayer is a product API adapter.                                                                                    |
| `web/run-undo-scenarios.mjs`           | stays  | An `engine` scenario with the commit gate; the fast-set history helpers come from the package.                                                  |
| `android/capture-webview-session.mjs`  | stays  | Thin.                                                                                                                                           |
| `android/capture-browser-actions.mjs`  | splits | Refresh pin, tab ownership, cache eviction and the CDP touch client move as the `cdp-touch` transport and `android-refresh-pin` instrument.     |
| `android/capture-bundled-frames.mjs`   | splits | The `cdp-bundled` channel moves.                                                                                                                |
| `ios/capture-webkit-gates.mjs`         | stays  | Splotch `/dev/engine`; uses the package's WebKit Inspector session.                                                                             |
| `ios/capture-webkit-frames.mjs`        | splits | `probeConfigScript` becomes the frames-probe template's config; the HUD-guided hand flow moves.                                                 |
| `ios/capture-xcuitest-screen.mjs`      | splits | Appium client, context selection, native bounds, cache eviction, SW block and gesture-pass driving move; geometry, brush ids, storage key stay. |
| `ios/capture-xcuitest-actions.mjs`     | splits | `runActionSweep` becomes the actions runner over a declared plan; the plan itself stays as data.                                                |
| `ios/capture-crayon-appearance.mjs`    | stays  | Screenshot tool.                                                                                                                                |
| `ios/bundled-report-channel.mjs`       | moves  | Origin and bundle id come from the native contract.                                                                                             |
| `analyze-chrome-trace.mjs`             | splits | Analyzer moves; `engine.*` narration is templated from the marks contract.                                                                      |
| `analyze-frame-capture.mjs`            | moves  |                                                                                                                                                 |
| `analyze-web-inspector.mjs`            | splits | Parser moves; paired-op names are contract data.                                                                                                |
| `serve-profile-build.mjs`              | splits | `perf-rig serve` with the build contract.                                                                                                       |
| `write-build-provenance.mjs`           | moves  |                                                                                                                                                 |
| `gen-crayon-glaze-sheet.mjs`           | stays  | A pixel proof sheet, not a perf capture (ADR-0053's membership test).                                                                           |
| `run-campaign.mjs`                     | splits | Runner, ledger, resume, instrument refusal move; cell vocabulary is the Splotch campaign definition.                                            |
| `campaign-status.mjs` / `-sources.mjs` | splits | Status moves; the fold into the matrix manifest stays.                                                                                          |
| `gen-performance-matrix.mjs`           | splits | ~40% (grid/heatmap renderer) moves as `renderMatrix`; the model stays.                                                                          |
| `check-matrix-staleness.mjs`           | splits | `stalenessOutcome`, `implicitBaseWarning` move; `MEASURED_SURFACE` stays.                                                                       |
| `rescore-captures.mjs`                 | moves  | Corpus walker and re-derivation; `brushOf` becomes a required cell resolver (no silent fallback).                                               |
| `keep-capture-evidence.mjs`            | splits | Scoreability-tier selection, redaction and index writer move; layout and cell key stay.                                                         |
| `prepare-capture.mjs`                  | splits | `perf-rig preflight` over a rig definition; WDA bundle id, xcconfig path and the sandbox variable are rig config.                               |
| `release-capture.mjs`                  | splits | Ownership model moves; worktree containers and script patterns are rig config.                                                                  |
| `run-operator-session.mjs`             | splits | Grant arming and hand-capture sequencing move; paths and brushes stay.                                                                          |
| `check-device-identifiers.mjs`         | moves  | Pattern list from rig config.                                                                                                                   |

## `tools/app-driver/` (3 files)

| File                        | Verb  | Notes                                                                                                                                                            |
| --------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/app-driver.mjs`        | stays | A Playwright-bound sibling seam for marketing and store tooling. Post-extraction it reads its selectors from the same `AppContract` module the harness consumes. |
| `lib/stroke-geometry.mjs`   | moves | Pure point generators.                                                                                                                                           |
| `run-driver-smoke-test.mjs` | stays |                                                                                                                                                                  |

## `tools/lib/` dependencies

Eleven functions across three modules (`proc`, `net`, `vite-server`); six of the `proc` uses are
`ROOT` resolving a hard-coded repo path and disappear once paths are options. The package vendors
the remaining process, port and polling helpers. ADR-0108 forbids solving this by promoting anything
into `tools/lib`.

## Tests (60 files)

22 test generic mechanics and move with their modules; 24 test Splotch scenarios and gates and stay;
14 straddle (drift guards holding a Splotch value against a package mechanism, corpus-calibrated
tests). The straddlers stay in Splotch and pin the package version they were written against —
`profiling-mechanics-doc.test.mjs` is the template.

The four things that do not travel with a library: the tracked corpus under
`perf-profiles/evidence`, the committed matrix under `scrapbook/performance`, the golden
action-verdict ledger, and the production fast-set seed. Every test calibrated against them stays.
