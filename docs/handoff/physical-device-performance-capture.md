# Handoff — physical-device performance capture

> 2026-08-21 · branch `codex/performance-matrix-2026-08-20` · PR
> [#1191](https://github.com/KyleMit/Splotch/pull/1191) · Capture the physical iPad and physical
> Android cells the non-physical pass could not reach, and close the one product defect it surfaced.

## Objective & non-goals

Every non-physical target is measured. What remains needs hardware attached: the 16 physical-iPad
mode cells, the 4 physical-Android landscape action cells, and a hand-check of the defect that
blocks 2 simulator cells.

**Non-goals:** do not recapture cells that already hold results, do not rerun a valid red gate to
turn it green, do not treat simulator or emulator evidence as the physical-iPad release gate, and do
not reintroduce a scratch shell script — `npm run perf:campaign` is the queue now.

## State

| Item             | Value                                                                         |
| ---------------- | ----------------------------------------------------------------------------- |
| Branch           | `codex/performance-matrix-2026-08-20`                                         |
| PR               | [#1191](https://github.com/KyleMit/Splotch/pull/1191) (draft)                 |
| Measured product | `6961e50b685d441e88b37d20d3f38a27136572fb`                                    |
| Coverage         | drawing 36/44 modes, undo 36/44, actions 30/44                                |
| Gate results     | 119/144 drawings pass, 36/36 undo probes pass, 1,280/1,430 comparable actions |
| Release decision | still unavailable — no calibrated physical-iPad capture exists                |

The report is committed at `scrapbook/performance/2026-07-31-deployment-target-matrix/`.
`sources.json` remains the source of truth for availability.

### Exactly what remains

| Target/scope                    | Remaining evidence                                   | Count | Blocker                                                                 |
| ------------------------------- | ---------------------------------------------------- | ----: | ----------------------------------------------------------------------- |
| Physical iPad · web             | 4 modes × (pen+undo, crayon, Magic, eraser, actions) |    20 | iOS 26 device discovery needs XCUITest's root-owned RemoteXPC tunnel    |
| Physical iPad · native          | 4 modes × (pen+undo, crayon, Magic, eraser, actions) |    20 | same tunnel blocker                                                     |
| Physical Android · web/native   | landscape light+dark action sweeps for each          |     4 | none known — the harness fix landed; the device was simply out of scope |
| iPad Simulator · native actions | 2 landscape modes                                    |     2 | product defect [#1192](https://github.com/KyleMit/Splotch/issues/1192)  |

The physical-Android cells are the cheapest remaining work: the compact-shell fix that blocked them
is landed and verified on the emulator, so they should capture without harness changes.

### Physical-iPad restart information

Hardware UDID `00008103-0006202E3CF1001E`; CoreDevice reports
`BF6A40F5-B68E-5029-9BF8-7798D202F71C`. Appium needs the CoreDevice identifier while the gate needs
the hardware identity for calibrated provenance; that dual-identity handling is already in the
driver. The tunnel command that reached an administrator-password prompt was:

```sh
sudo node /Users/kylemit/.appium/node_modules/appium-xcuitest-driver/scripts/tunnel-creation.mjs --udid 00008103-0006202E3CF1001E --disconnect-retry-max-attempts 3
```

Start it in a dedicated terminal, keep it alive, run one physical-web probe, then queue the rest.
Launching the app with `devicectl` is **not** proof that Appium discovery works — those paths
diverged. No credential was obtained or stored.

### Local-only evidence

Raw captures are gitignored. This pass wrote 38 artifacts under
`perf-profiles/2026-08-21-campaign-gaps/`, and its ledgers are in the session scratchpad. The
2026-08-20 campaign's raw captures are **gone** — those cells are carried forward through
`preservedEvidence` in `sources.json` and must not be treated as re-runnable. Transfer raw artifacts
before changing host or worktree.

## Decisions made

* Product stays pinned at `6961e50b685d441e88b37d20d3f38a27136572fb`; later commits are harness and
  report only.
* Preserve the first valid result, red gates included. Acceptance is a parseable artifact, never a
  child exit code — `BUILD FAILED` reached this session with exit code 0.
* Run device campaigns serially, one target at a time.
* **Detach every viewer before capturing.** A mirrored or recorded screen adds host load the
  measured baseline never had. Three cells were captured against a live 60 FPS mirror and were
  discarded and retaken.
* ADR-0090 holds, but the control surface varies by mode — see
  [ADR-0133](../adrs/0133-capture-the-control-surface-the-product-actually-offers.md). Native
  tablets expose no in-app rotation lock, so device rotation is the product path; a landscape phone
  renders the compact Settings shell, so that mode measures its quick toggles under compact-specific
  labels.
* A mode is comparable only against the same shell. A differing action label set is a shell
  difference, not a regression.

## Unverified assumptions

* Starting the root-owned RemoteXPC tunnel makes physical-iPad discovery work end to end. The helper
  has still never been run past its password prompt.
* The physical Android device behaves like the emulator for the compact-shell landscape sweeps. The
  fix is verified only on `Pixel_7_Pro_API_33`.
* Defect [#1192](https://github.com/KyleMit/Splotch/issues/1192) reproduces by hand and on web and
  Android. It is confirmed only through the harness on iPad Simulator native.
* The simulator-degradation finding — heavier brushes lose the probe as sessions accumulate, a
  reboot restores it — is based on this session's runs on one machine. `--reboot-simulator`
  mitigates it; the underlying cause was never identified.

## Done & verified

* Mac: Firefox drawing 16/16 and mode-aware undo 12/12, all passing, on the same probe, viewports,
  and gates as the rest of the desktop row.
* iPad Simulator native: all 8 landscape drawing cells and both landscape undo probes pass; both
  portrait action sweeps captured.
* Android emulator: all 4 landscape action cells captured. Native passes all 36 actions in both
  modes; web fails 3 and 4, which are real measured results.
* Five harness defects found and fixed, each with tests: the ADR-0090 rotation guard, the compact
  Settings shell, a hydration race opening Settings, a three-valued rotation provenance field, and
  two `runActionSweep` callers broken by a shape change.
* `npm run perf:campaign` replaces the scratch queue, with 14 tests over expansion, unique paths,
  retry, resume, and P1 continuation.
* Green: 2,015 tools tests, `npm run lint`, `npm run format:check`, `npm run ruler:check`,
  `npm run check:skill-refs`, `npm run scrapbook:check`.

## Risks & next 3 steps

1. **Capture the physical Android landscape actions.** Cheapest remaining work and needs no harness
   change. Attach the device, serve the instrumented preview, `adb reverse`, force-stop Chrome, then
   `npm run perf:campaign -- --target=android-device-web --items=actions --modes=landscape-light,landscape-dark …`
   and the same for `android-device-native`. Verify each artifact says
   `transport: native-capacitor-webview` before accepting it — with Chrome running, a native capture
   can attach to Chrome's WebView and still exit zero.
2. **Recover the calibrated release gate.** Start the RemoteXPC tunnel, run one physical-iPad web
   probe, then queue all 40 physical cells. If discovery still fails, keep the driver log and update
   the unavailable reason rather than claiming a release result.
3. **Close [#1192](https://github.com/KyleMit/Splotch/issues/1192), then recapture the 2 blocked
   simulator cells.** Undo restores cleared strokes into the pre-rotation paper geometry instead of
   letterboxing them into the new orientation. `setCanvasEmptyState` in
   `web/src/lib/drawing/engine.ts` handles entering the empty state but not leaving it after a
   viewport change.

Regenerate with `npm run gen:performance-matrix -- <sources.json>`, then dprint the emitted
`index.md`. Consume this packet through the `resume-handoff` skill when the work is done.

## Reread first

* `.agents/skills/run-performance-matrix/SKILL.md` and its `references/platforms.md`
* `.agents/skills/profiling/SKILL.md`, `.agents/skills/mobile/SKILL.md`
* `docs/PROFILING-IPAD.md`
* `docs/adrs/0090-tiered-real-ipad-performance-regression-gates.md` and
  [ADR-0133](../adrs/0133-capture-the-control-surface-the-product-actually-offers.md)
* `tools/perf/run-campaign.mjs`, `tools/perf/lib/campaign-plan.mjs`,
  `tools/perf/lib/campaign-ledger.mjs`
* `scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json`
