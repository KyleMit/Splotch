# Handoff — performance campaign gaps

> 2026-08-21 · branch `codex/performance-matrix-2026-08-20` · PR
> [#1191](https://github.com/KyleMit/Splotch/pull/1191) · Finish the deployment-target performance
> campaign without weakening its device, orientation, theme, or provenance requirements.

## Objective & non-goals

Capture the requested matrix cells that infrastructure or harness limitations left unmeasured, merge
them into the schema-v3 report, and leave PR #1191 with a complete and reviewable campaign.

**Non-goals:** do not optimize product failures, rerun valid red results until they turn green,
bypass the real orientation-lock setting, or treat advisory simulator/emulator evidence as the
physical-iPad release gate.

## State

| Item                 | Value                                                                                    |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Branch               | `codex/performance-matrix-2026-08-20`                                                    |
| Draft PR             | [#1191](https://github.com/KyleMit/Splotch/pull/1191)                                    |
| Handoff base         | `68b38b8e7ceb9dafabcd828e0b240f2370f32201`                                               |
| Measured product     | `6961e50b685d441e88b37d20d3f38a27136572fb`                                               |
| Requested matrix     | 11 targets × 4 orientation/theme modes = 44 mode cells                                   |
| Current coverage     | 30/44 full-brush drawing modes, 22/44 mode-aware undo modes, 24/44 discrete-action modes |
| Current gate results | 95/120 drawings pass, 22/22 undo probes pass, 124/1,164 comparable discrete actions fail |
| Release decision     | unavailable: neither physical-iPad transport produced a calibrated release-gate capture  |

The current normalized report is committed at
`scrapbook/performance/2026-07-31-deployment-target-matrix/`. Its `sources.json` is the source of
truth for target/mode availability and the 14 candidate follow-on action families.

### Exactly what remains unmeasured

| Target/scope                           | Remaining evidence                                                                       |  Count | Blocker                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | -----: | ------------------------------------------------------------------------------------------------------------------- |
| Physical iPad · web                    | 4 modes × (pen+undo, crayon, Magic, eraser, full actions)                                |     20 | iOS 26 device discovery needs XCUITest's root-owned RemoteXPC tunnel                                                |
| Physical iPad · native                 | 4 modes × (pen+undo, crayon, Magic, eraser, full actions)                                |     20 | same RemoteXPC tunnel blocker                                                                                       |
| iPad Simulator · native                | 2 landscape modes × 4 brushes, plus all 4 action modes; landscape pen files include undo |     12 | Settings does not expose the persisted rotation-lock product control required by ADR-0090                           |
| Android physical/emulator · web/native | landscape light+dark full-action sweeps for each of the four targets                     |      8 | repeated sweep-1 `Timed out waiting for Settings navigation`; valid landscape drawing/undo evidence is already kept |
| Mac · Firefox drawing                  | 4 modes × 4 brushes                                                                      |     16 | local frame runner supports Chromium and WebKit only                                                                |
| Mac · mode-aware undo                  | Chrome, WebKit, Firefox × 4 modes                                                        |     12 | standalone undo artifacts lack orientation/theme and the schema-v3 top-level undo shape                             |
| **Total requested-matrix gaps**        |                                                                                          | **88** |                                                                                                                     |

The Mac undo gap can be closed either by mode-aware captures or a truthful adapter that preserves
mode provenance. Do not relabel the existing standalone Chromium/WebKit runs as mode-aware results.

### Physical-iPad restart information

The physical iPad hardware UDID is `00008103-0006202E3CF1001E`; CoreDevice reports
`BF6A40F5-B68E-5029-9BF8-7798D202F71C`. The exact tunnel command that reached the administrator
password prompt was:

```sh
sudo node /Users/kylemit/.appium/node_modules/appium-xcuitest-driver/scripts/tunnel-creation.mjs --udid 00008103-0006202E3CF1001E --disconnect-retry-max-attempts 3
```

Start that helper in a dedicated terminal, keep it alive, then run one physical-web probe before
restarting the 40-cell physical queue. No password was obtained or stored during this campaign.

### Local-only evidence that must be preserved

Raw captures are intentionally gitignored. Before regenerating, verify these directories still exist
on this workstation:

* `perf-profiles/2026-08-20-campaign/mac/`
* `perf-profiles/2026-08-20-campaign/ios/`
* `perf-profiles/2026-08-21-overnight/android-device-web/`
* `perf-profiles/2026-08-21-overnight/android-device-native/`
* `perf-profiles/2026-08-21-overnight/android-emulator-web/`
* `perf-profiles/2026-08-21-overnight/android-emulator-native/`

The retry ledgers are also local-only:

* `/private/tmp/splotch-android-campaign-2026-08-20/checkpoints.tsv`
* `/private/tmp/splotch-performance-campaign-2026-08-20/ios/checkpoints.tsv`
* `/private/tmp/splotch-performance-campaign-2026-08-20/ios/repeated-failures.tsv`
* `/private/tmp/splotch-performance-campaign-2026-08-20/ios/IOS-RESULTS.md`

`data.json` preserves the normalized published evidence, but the generator does not reconstruct or
incrementally merge missing raw inputs from it. Transfer the scratch artifacts before changing host
or worktree.

### Follow-on exploratory coverage

After the 88 requested-matrix gaps, the highest-value new interactions are:

* sound-source and drag-to-clear state combinations, including volume drag and cancel/reverse paths;
* all brushes on an active coloring page, with dense content, theme swaps, and rotation;
* continuous Settings pane/sidebar scrolling, quick switches, sliders, hub back navigation, and
  individual tool toggles;
* cold/warm coloring picker flows, double-tap guard, progressive pack arrival, and Active Page Chip;
* deterministic AI, Parental Gate, cold/warm screenshot, richer rotation, lifecycle, true color
  drag, Settings pinch zoom, Apple Pencil, Android fullscreen/install, and desktop Ctrl+Z flows.

The structured rationale, priority, and applicability for all 14 families is already in
`scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json`; keep that inventory
instead of creating a second competing list.

## Decisions made

* Keep the product fixed at `6961e50b685d441e88b37d20d3f38a27136572fb`; later commits are
  harness/report changes and must stay separate in provenance.
* Preserve the first valid result, including red gates. Do not rerun-to-green.
* Run device campaigns serially. Concurrent native or full performance runs invalidate the host
  capacity model and compete for Appium, simulators, ports, and CPU.
* ADR-0090 is a validity constraint: native rotation must use the real persisted product setting.
  External rotation, direct preference mutation, or a profiling-only setting seam was deliberately
  rejected.
* The invalid Android landscape-dark pen file whose device metadata said `iPad/unknown` is
  quarantined as `real-screen.invalid-device-metadata.json`; use its corrected sibling only.
* Count only pen files as mobile undo sources. Non-pen `count=0, passed=false` undo objects mean not
  requested, not a failed gate.
* Exclude idle controls and zero-count warmup-only action summaries from comparable action totals.
* Android landscape action timeouts and the iOS rotation-lock absence are unmeasured infrastructure
  or activation failures, not zero-cost passes and not product performance failures.

## Unverified assumptions

* The gitignored raw directories above will still be present when this handoff is resumed.
* Starting the root-owned RemoteXPC tunnel will make physical-iPad Appium discovery work end to end;
  the helper could not be tested beyond its administrator-password prompt.
* The Android landscape Settings timeout is a harness targeting/scroll problem rather than a product
  responsive-layout defect. Diagnose the visible state before changing either side.
* Firefox can expose the same frame timing signals as Chromium/WebKit without changing the metric
  definition. If not, keep Firefox drawing explicitly unavailable rather than inventing a proxy.

## Done & verified

* iPad Simulator web: all 20 artifacts complete; 10/16 drawings pass, all 4 undo probes pass, and
  all four action aggregates contain valid measured results.
* iPad Simulator native: portrait light/dark drawings and undo complete; all 8 drawings and both
  undo probes pass.
* Android: all four targets have all 16 drawing artifacts and all four pen undo probes. Portrait
  actions are complete. Drawing passes are 0/16 physical web, 16/16 physical native, 15/16 emulator
  web, and 16/16 emulator native.
* Mac: every action mode passes on Chromium, WebKit, and Firefox. Chromium drawing is 14/16; WebKit
  is 16/16. Standalone WebKit undo passed and Chromium undo completed as advisory evidence.
* Recovered harness defects include trusted desktop coloring scroll, WebKit page readiness, and
  Appium borrowed-session W3C/provenance handling. Exact post-fix cells completed.
* Report generation and focused harness tests passed (172 tests), followed by `npm run check`,
  `npm run lint`, `npm run format:check`, and `npm run scrapbook:check`.

## Risks & next 3 steps

1. **Recover the calibrated release gate.** Verify scratch artifacts, start the RemoteXPC tunnel,
   run a single physical-iPad web probe, then capture all 40 physical-iPad artifacts. If discovery
   still fails, preserve the driver log and update the existing unavailable reason rather than
   claiming a release result.
2. **Close platform activation gaps.** Inspect the iPad Simulator native Settings surface under the
   real app state and the Android landscape Settings surface. Fix harness targeting only when the
   visible product control exists; otherwise report the product/UI blocker. Backfill 12 iPad
   Simulator native and 8 Android landscape action artifacts.
3. **Close desktop gaps and republish.** Add Firefox frame support or retain explicit N/A, make undo
   mode-aware, update `sources.json`, run `npm run gen:performance-matrix -- <sources.json>`, repeat
   the focused/full validation above, commit, push, and update PR #1191 with the final release-gate
   disposition. Consume/delete this handoff through the `resume-handoff` skill when complete.

## Reread first

* `.agents/skills/resume-handoff/SKILL.md`
* `.agents/skills/run-performance-matrix/SKILL.md`
* `.agents/skills/profiling/SKILL.md`
* `.agents/skills/mobile/SKILL.md`
* `docs/PROFILING.md` and `docs/PROFILING-IPAD.md`
* `docs/adrs/0090-tiered-real-ipad-performance-regression-gates.md`
* `scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json`
* `tools/perf/gen-performance-matrix.mjs`
* `tools/perf/ios/capture-xcuitest-actions.mjs`
* `tools/perf/ios/capture-xcuitest-screen.mjs`
* `tools/perf/web/capture-local-frames.mjs`
