# Use-case matrix: every `perf:*` script against the draft surface

`splotch/scripts.ts` is the type-checked version of this table. Script names survive verbatim
(ADR-0019); the implementation behind each becomes a call into the package or stays a Splotch script
that composes package calls.

| Script                                               | Shape      | Endpoint                  | Package call                                   | Stays in Splotch                                                                                       |
| ---------------------------------------------------- | ---------- | ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `perf:web` / `perf:web:raw`                          | session    | desktop                   | `capture` + `cdp-cpu-throttle`, `cdp-tracing`  | the toddler beats                                                                                      |
| `perf:web:webkit`                                    | session    | desktop                   | `capture`                                      |                                                                                                        |
| `perf:android`                                       | session    | android WebView over CDP  | `capture` with `channel: cdp-evaluate`         |                                                                                                        |
| `perf:web:mount`                                     | mount      | desktop                   | `capture` + network emulation                  |                                                                                                        |
| `perf:web:settings`                                  | first-show | desktop                   | `capture`                                      | the two shells                                                                                         |
| `perf:web:frames`                                    | frames     | desktop                   | `capture`                                      | gesture plan, phases                                                                                   |
| `perf:ios:webkit:frames`                             | frames     | ios-inspector             | `capture` with `input: human`, `hud: true`     | suppression sweep                                                                                      |
| `perf:ios:xcuitest:screen`                           | frames     | ios-appium                | `capture`                                      | brush ids, eraser prime, storage seed                                                                  |
| `perf:ios:bundled:frames`                            | frames     | ios-bundled               | `capture` with `channel: preferences-mailbox`  |                                                                                                        |
| `perf:device:frames`                                 | frames     | android-split / ios-split | `capture` with `channel: http-upload`          |                                                                                                        |
| `perf:device:hand`                                   | frames     | android-split, human      | `capture` with `input: human`                  | operator instructions                                                                                  |
| `perf:android:bundled:frames`                        | frames     | android-bundled           | `capture`                                      |                                                                                                        |
| `perf:web:actions`                                   | actions    | desktop                   | `capture`                                      | the action groups and labels                                                                           |
| `perf:ios:xcuitest:actions`                          | actions    | ios-appium                | `capture`                                      | allowances                                                                                             |
| `perf:android:browser:actions`                       | actions    | android-cdp-actions       | `capture` + `android-refresh-pin`              |                                                                                                        |
| `perf:web:undo` / `:webkit` / `:fast`                | engine     | desktop                   | `capture` + `evaluateCommit`, fast-set helpers | the seven cases, `FAST_UNDO_SCENARIO_KEYS`, history                                                    |
| `perf:web:replay`                                    | engine     | desktop                   | `capture`                                      | the replayer (a product API adapter)                                                                   |
| `perf:ios:webkit:gates`                              | engine     | ios-inspector             | WebKit Inspector session, `waitForGlobal`      | the whole script; `engine-gates.js`                                                                    |
| `perf:serve`                                         | —          | —                         | `serve`                                        |                                                                                                        |
| `perf:device:serve`                                  | —          | —                         | `serveProbeHost`                               |                                                                                                        |
| `perf:device:floor`                                  | diagnostic | android-split             | `perf-rig floor-control`                       |                                                                                                        |
| `perf:device:verify-android`                         | preflight  | android-split             | `perf-rig verify input`                        | gesture plan                                                                                           |
| `perf:device:verify-android-rotation`                | preflight  | android-split             | `perf-rig verify rotation`                     |                                                                                                        |
| `perf:device:probe-overhead`                         | diagnostic | android-split             | `perf-rig probe-overhead`                      |                                                                                                        |
| `perf:preflight`                                     | rig        | —                         | `preflight`                                    | rig definition                                                                                         |
| `perf:operator`                                      | rig        | —                         | `operatorSession`                              | the three steps                                                                                        |
| `perf:release`                                       | rig        | —                         | `planRelease`, `release`                       | rig definition                                                                                         |
| `perf:campaign`                                      | campaign   | per target                | `runCampaign`                                  | modes, items, artifact paths, undo-evidence rule                                                       |
| `perf:campaign:status`                               | campaign   | —                         | `campaignStatus`                               |                                                                                                        |
| `perf:campaign:sources`                              | campaign   | —                         | `shellOf`, the standard undo-evidence rule     | completeness (four brushes plus the sweep), build binding across a variant, the fold into the manifest |
| `gen:performance-matrix`                             | report     | —                         | `renderMatrix`, `stalenessOutcome`             | the model, gate policy, preserved evidence                                                             |
| `check:matrix-staleness`                             | report     | —                         | `stalenessOutcome`                             | `MEASURED_SURFACE`                                                                                     |
| `perf:rescore`                                       | evidence   | —                         | `rescore`                                      | `cellOf`, the score projection                                                                         |
| `perf:evidence:keep`                                 | evidence   | —                         | `keepEvidence`                                 | `keyOf`, evidence root                                                                                 |
| `perf:analyze:frames` / `:chrome` / `:web-inspector` | analysis   | —                         | `perf-rig analyze <kind>`                      | measure-name narration                                                                                 |
| `perf:build` / `perf:build:cap`                      | build      | —                         | provenance stamp                               | unchanged npm scripts                                                                                  |
| `check:device-identifiers`                           | hygiene    | —                         | `scanForDeviceIdentifiers`                     | the tracked-tree walk                                                                                  |

Three scripts under `tools/perf` are not harness at all and are untouched: `gen:crayon-glaze-sheet`
(a pixel proof sheet), `perf:centerline-tracing` (a Python benchmark), and
`capture-crayon-appearance` (a screenshot tool).

## What the surface had to grow, and what it lost, to cover the table

Round one found these gaps; rounds two and three closed them and cut what the reviews showed was
Splotch code wearing a generic name:

* `options.transport` overrides, because one target captures over different channels
  (`ipad-device-packaged` over Appium and over the preferences mailbox; `android-device-browser`
  over `adb-input` and, for a hand capture, `human`).
* A `human` input transport as a first-class member, so the artifact records it.
* A `first-show` shape; the page-load window folded into `session` with no beats.
* `scenarioOverrides`, `server`, `viewport`, `headed`, `human`, `refreshRegime` and
  `transport.activation` on the options, for the thirty-odd flags the scripts vary per run.
* `FramesScenario.input` with three kinds, because the desktop frames path drives the probe's own
  hand and records no gesture plan.
* Multi-pointer `PointerSequence` plans, `focusActions` by group id, `resolveActionPlan`, and one
  action id per measured direction inside a `SequenceAction`.
* `AcceptanceRule.retry: 'until-calibrated'`, because an uncalibrated runtime spends its attempt and
  then stays terminal until the campaign's fidelity table changes.
* `legacy.upgrade` on `rescore`, replacing a silent `pen` fallback that once discarded twenty-six
  crayon captures.
* Cut: `EngineScenario`, `CustomScenario`, `MountScenario`, `renderMatrix`, `stalenessOutcome`, the
  default fidelity constants, the label template mini-language. The engine family is three Splotch
  scripts over `openChannel`.

## Gotcha coverage

`package/docs/gotchas.md` maps every catalogued trap to the guard, refusal, preflight check,
acceptance rule or scoring rule that catches it, and names the ones that stay documented-only.
