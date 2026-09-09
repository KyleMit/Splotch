# Use-case matrix: every `perf:*` script against the draft surface

`splotch/scripts.ts` is the type-checked version of this table. Script names survive verbatim
(ADR-0019); the implementation behind each becomes a call into the package or stays a Splotch script
that composes package calls.

| Script                                               | Shape      | Endpoint                  | Package call                                   | Stays in Splotch                                    |
| ---------------------------------------------------- | ---------- | ------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `perf:web` / `perf:web:raw`                          | session    | desktop                   | `capture` + `cdp-cpu-throttle`, `cdp-tracing`  | the toddler beats                                   |
| `perf:web:webkit`                                    | session    | desktop                   | `capture`                                      |                                                     |
| `perf:android`                                       | session    | android WebView over CDP  | `capture` with `channel: cdp-evaluate`         |                                                     |
| `perf:web:mount`                                     | mount      | desktop                   | `capture` + network emulation                  |                                                     |
| `perf:web:settings`                                  | first-show | desktop                   | `capture`                                      | the two shells                                      |
| `perf:web:frames`                                    | frames     | desktop                   | `capture`                                      | gesture plan, phases                                |
| `perf:ios:webkit:frames`                             | frames     | ios-inspector             | `capture` with `input: human`, `hud: true`     | suppression sweep                                   |
| `perf:ios:xcuitest:screen`                           | frames     | ios-appium                | `capture`                                      | brush ids, eraser prime, storage seed               |
| `perf:ios:bundled:frames`                            | frames     | ios-bundled               | `capture` with `channel: preferences-mailbox`  |                                                     |
| `perf:device:frames`                                 | frames     | android-split / ios-split | `capture` with `channel: http-upload`          |                                                     |
| `perf:device:hand`                                   | frames     | android-split, human      | `capture` with `input: human`                  | operator instructions                               |
| `perf:android:bundled:frames`                        | frames     | android-bundled           | `capture`                                      |                                                     |
| `perf:web:actions`                                   | actions    | desktop                   | `capture`                                      | the action groups and labels                        |
| `perf:ios:xcuitest:actions`                          | actions    | ios-appium                | `capture`                                      | allowances                                          |
| `perf:android:browser:actions`                       | actions    | android-cdp-actions       | `capture` + `android-refresh-pin`              |                                                     |
| `perf:web:undo` / `:webkit` / `:fast`                | engine     | desktop                   | `capture` + `evaluateCommit`, fast-set helpers | the seven cases, `FAST_UNDO_SCENARIO_KEYS`, history |
| `perf:web:replay`                                    | engine     | desktop                   | `capture`                                      | the replayer (a product API adapter)                |
| `perf:ios:webkit:gates`                              | engine     | ios-inspector             | WebKit Inspector session, `waitForGlobal`      | the whole script; `engine-gates.js`                 |
| `perf:serve`                                         | —          | —                         | `serve`                                        |                                                     |
| `perf:device:serve`                                  | —          | —                         | `serveProbeHost`                               |                                                     |
| `perf:device:floor`                                  | diagnostic | android-split             | `perf-rig floor-control`                       |                                                     |
| `perf:device:verify-android`                         | preflight  | android-split             | `perf-rig verify input`                        | gesture plan                                        |
| `perf:device:verify-android-rotation`                | preflight  | android-split             | `perf-rig verify rotation`                     |                                                     |
| `perf:device:probe-overhead`                         | diagnostic | android-split             | `perf-rig probe-overhead`                      |                                                     |
| `perf:preflight`                                     | rig        | —                         | `preflight`                                    | rig definition                                      |
| `perf:operator`                                      | rig        | —                         | `operatorSession`                              | the three steps                                     |
| `perf:release`                                       | rig        | —                         | `planRelease`, `release`                       | rig definition                                      |
| `perf:campaign`                                      | campaign   | per target                | `runCampaign`                                  | modes, items, artifact paths, undo-evidence rule    |
| `perf:campaign:status`                               | campaign   | —                         | `campaignStatus`                               |                                                     |
| `perf:campaign:sources`                              | campaign   | —                         | `inspectCell`                                  | fold into the matrix manifest                       |
| `gen:performance-matrix`                             | report     | —                         | `renderMatrix`, `stalenessOutcome`             | the model, gate policy, preserved evidence          |
| `check:matrix-staleness`                             | report     | —                         | `stalenessOutcome`                             | `MEASURED_SURFACE`                                  |
| `perf:rescore`                                       | evidence   | —                         | `rescore`                                      | `cellOf`, the score projection                      |
| `perf:evidence:keep`                                 | evidence   | —                         | `keepEvidence`                                 | `keyOf`, evidence root                              |
| `perf:analyze:frames` / `:chrome` / `:web-inspector` | analysis   | —                         | `perf-rig analyze <kind>`                      | measure-name narration                              |
| `perf:build` / `perf:build:cap`                      | build      | —                         | provenance stamp                               | unchanged npm scripts                               |
| `check:device-identifiers`                           | hygiene    | —                         | `scanForDeviceIdentifiers`                     | the tracked-tree walk                               |

Three scripts under `tools/perf` are not harness at all and are untouched: `gen:crayon-glaze-sheet`
(a pixel proof sheet), `perf:centerline-tracing` (a Python benchmark), and
`capture-crayon-appearance` (a screenshot tool).

## Capabilities the surface had to add to cover the table

Reading the scripts against the first draft found these gaps, now closed:

* `options.transport` overrides, because the same target captures over different channels
  (`ipad-device-native` over Appium and over the preferences mailbox; `android-device-web` over
  `adb-input` and, for a hand capture, `human`).
* A `human` input transport as a first-class member, not a flag, so the artifact records it.
* `FirstShowScenario` and `MountScenario`, which no other shape expressed.
* `Control.canvasKinds` for the actions probe's mutation classification.
* `GesturePlan.id` and `primeBetweenPasses` so acceptance can refuse a cell recorded under a
  different plan.
* `AcceptanceRule.spendsAttempt`, because an uncalibrated runtime must never spend a retry.
* `rescore.cellOf` and `keepEvidence.keyOf` as required callbacks, replacing a silent `pen` fallback
  that once discarded twenty-six crayon captures.

## Gotcha coverage

`package/docs/gotchas.md` maps every catalogued trap to the guard, refusal, preflight check,
acceptance rule or scoring rule that catches it, and names the ones that stay documented-only.
