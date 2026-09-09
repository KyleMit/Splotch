# Gotchas: where each plausible wrong number is caught

Every trap the drawing-app harness catalogued shares one shape: the capture completes, writes a
well-formed artifact, and reports a plausible number. This table says where the package catches
each one — a **guard** (recorded in the artifact's trust ledger and fatal unless tolerated), a
**plan refusal** (`--dry-run` names it before anything runs), a **preflight** check, an
**acceptance** rule a campaign applies to the artifact, a **scoring** rule, or **documented** only,
because no mechanism can see it. The last column is honest about the gaps.

| Family      | Trap                                                                             | Caught by                                                  |
| ----------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Build       | Wrapper killed, server keeps serving the old manifest; SSR selectors still resolve | guard `served-build-identity` + `route-hydrated`           |
| Build       | Another run rebuilt the output without the instrumentation seams                 | guard `build-seams-present`                                |
| Build       | A resolving manifest belongs to a different checkout                             | guard `served-build-identity` (digest against `outputDir`) |
| Build       | The device's service worker serves the previous shell                            | guard `service-worker-blocked` + `entry-module-match`      |
| Build       | A native static export overwrote the web build in place                          | guard `refused-build-variant`                              |
| Build       | Installing through the normal run path overwrote the instrumented native bundle  | guard `build-seams-present` on the attached page           |
| Build       | Build stamped after the fact to claim a newer commit                             | provenance reads the stamp written by the build step only  |
| Build       | Editing a capture module mid-campaign splits the run                             | acceptance `instrument-changed` (fingerprint per cell)     |
| Build       | A long-lived server never reloads an edited bootstrap                            | documented; `probe-host` prints its bootstrap digest       |
| Input       | Automation drives input below the hand-calibrated cadence                        | scoring `input-fidelity` (fail-closed on density)          |
| Input       | Bounds were set from the automation, not a hand                                  | expectations carry `basis`; `doctor` warns on missing hand capture |
| Input       | A check that cannot tell a hand from a robot                                     | `witness` state, never gated                               |
| Input       | Degraded adb server halves cadence on a quiet rig                                | scoring `input-fidelity`; documented remedy                |
| Input       | Heavy host work during a capture changes cadence                                 | guard `host-quiet`                                         |
| Input       | Sub-divided WebDriver actions serialise a gesture over minutes                   | plan: gesture plans are long native moves by construction  |
| Channel     | Serial touch acknowledgements slow the measured thing                            | `cdp-touch` dispatches scrolls as native gestures; records `scrollDelivery` |
| Channel     | The first debuggable WebView context is the wrong process                        | plan: context selection keyed on the app package           |
| Channel     | A suspended tab uploads near-empty tables over the real capture                  | guard `page-identity-nonce` + report store keeps the thicker report |
| Channel     | A backgrounded Safari tab hangs every command                                    | bounded responsiveness probe on tab selection              |
| Channel     | Bridge sends an unsolicited event before the first reply                         | replies matched by id                                      |
| Channel     | Single evaluate over USB fails late with hundreds of kilobytes                   | tables read in slices                                      |
| Channel     | JS heap cannot see canvas backing stores                                         | `hooks.historyDepth` rows; documented                      |
| Rig         | Two iPad identifiers; the wrong one reads as an unreachable device               | preflight classifies by shape                              |
| Rig         | Two Appium servers on one WDA port                                               | preflight resolves the `wda` role; capabilities file       |
| Rig         | Guided Access disguised as a build failure                                       | documented; preflight `verifyIosLaunch` surfaces the innermost error |
| Rig         | Automation prompt exists only during a launch                                    | `operator` arms it during a launch                         |
| Rig         | Stage Manager window smaller than the screen                                     | guard on window rect vs `screen.width`                     |
| Rig         | Full-screen OS alert with a full-size window                                     | documented                                                 |
| Rig         | Emulator snapshot boot is not a fresh boot                                       | documented; artifact records guest uptime                  |
| Rig         | Interrupted sweep leaks a 60 Hz panel pin                                        | guard `instrument-restored`; `doctor` reads the panel rate |
| Rig         | Restored browser tab holds the foreground                                        | acceptance on zero input; documented tell                  |
| Rig         | Native orientation lock rotates the page after readiness                        | guard `orientation-followed`; dimension declares unlock    |
| Rig         | A control always in the DOM cannot be probed by presence                         | procedure steps `waitVisible`/`waitHidden` use layout      |
| Rig         | The selected mode persists across navigations                                    | guard `committed-mode`, every mode selected explicitly     |
| Rig         | Ad-hoc teardown locks the phone or strands a WDA session                         | `release` drains sessions first; documented                |
| Rig         | Within-session drift looks reproducible under a fixed order                      | campaign reference cells start/middle/end                  |
| Scoring     | Beat estimated from a percentile under-reads a variable-refresh display          | scoring `observedFrameIntervalMs` (dominant interval)      |
| Scoring     | Late-then-early pairs charged as lost frames                                     | scoring `frameStats` credits the next frame                |
| Scoring     | Mixed refresh regime inside one capture                                          | scoring `refreshRegimeVerdict` refuses                     |
| Scoring     | Scheduled rAF stamp hides a main-thread overrun                                  | actions probe records both clocks; `hiddenOverruns` reported |
| Scoring     | A single capture cannot know its matrix target's exceptions                      | `evaluateDrawing(…, cell)` takes the cell; documented       |
| Scoring     | One max breach declared rather than confirmed                                    | gate `maxBreachConfirmingSamples`                          |
| Scoring     | A retry "confirms" a different failure                                           | `reproducedFailures` intersects fingerprints               |
| Scoring     | Settle timeout fires before quiescence was observable                            | `settle.stableSamples` guard                               |
| Scoring     | A focused subset is not the canonical sweep                                      | focused scenarios keep their own id; fold refuses          |
| Acceptance  | A native transport did not prove a native page                                   | acceptance `runtime-mismatch` (transport + origin + package) |
| Acceptance  | Eraser passes erased nothing after the first                                     | guard `prime-verified` per pass; acceptance `prime-failed` |
| Acceptance  | Different repeat counts are not the same cell                                    | acceptance `wrong-gesture-repeats`                         |
| Acceptance  | A fidelity-failed artifact banked because it parsed                              | acceptance `failed-input-fidelity` distinct from missing   |
| Acceptance  | Cross-run contamination through a leftover page                                  | `keepEvidence` nonce audit marks `cellAttributable: false`  |
| Acceptance  | A silent fallback when the cell cannot be resolved                               | `rescore.cellOf` and `keepEvidence.keyOf` throw            |
| Acceptance  | Trimming a preserved capture flips the fidelity verdict                          | `keepEvidence` stores whole, minified                      |
| Acceptance  | A label that was never sent to the page published as provenance                  | guard `dimension-observed`; artifact records observed value |
| Acceptance  | Hardware identifiers in a committed file                                         | `scanForDeviceIdentifiers`; redaction on promotion         |

Documented-only rows are the honest residue: the package cannot see a Guided Access screen or a
system alert, cannot know whether a human edited a file a server had already loaded, and cannot
prove a fresh boot without the caller recording uptime.
