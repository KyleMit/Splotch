# Handoff — physical-device performance capture

> 2026-08-21 · branch `codex/performance-matrix-2026-08-20` · PR
> [#1191](https://github.com/KyleMit/Splotch/pull/1191) · Capture the physical iPad and physical
> Android cells the non-physical pass could not reach. The product defect it surfaced
> ([#1192](https://github.com/KyleMit/Splotch/issues/1192)) is fixed and merged.

## Objective & non-goals

Every non-physical target is measured. What remains needs hardware attached: the 16 physical-iPad
mode cells and the 4 physical-Android landscape action cells. The 2 iPad-Simulator cells that a
product defect blocked need no hardware — [#1192](https://github.com/KyleMit/Splotch/issues/1192) is
fixed, and they are a plain recapture.

**Non-goals:** do not recapture cells that already hold results *unless* the #1192 fix is the reason
(see below — that call is deliberate and must be written down), do not rerun a valid red gate to
turn it green, do not treat simulator or emulator evidence as the physical-iPad release gate, and do
not reintroduce a scratch shell script — `npm run perf:campaign` is the queue now.

## State

| Item              | Value                                                                         |
| ----------------- | ----------------------------------------------------------------------------- |
| Branch            | `codex/performance-matrix-2026-08-20`                                         |
| PR                | [#1191](https://github.com/KyleMit/Splotch/pull/1191) (draft)                 |
| Measured product  | `6961e50b685d441e88b37d20d3f38a27136572fb` — every committed cell             |
| Product on branch | `ce88c8e587ac45847c419e05ef7a79d282bc747a` — adds the #1192 fix               |
| Coverage          | drawing 36/44 modes, undo 36/44, actions 30/44                                |
| Gate results      | 119/144 drawings pass, 36/36 undo probes pass, 1,280/1,430 comparable actions |
| Release decision  | still unavailable — no calibrated physical-iPad capture exists                |

The report is committed at `scrapbook/performance/2026-07-31-deployment-target-matrix/`.
`sources.json` remains the source of truth for availability.

### Exactly what remains

| Target/scope                    | Remaining evidence                                   | Count | Blocker                                                                 |
| ------------------------------- | ---------------------------------------------------- | ----: | ----------------------------------------------------------------------- |
| Physical iPad · web             | 4 modes × (pen+undo, crayon, Magic, eraser, actions) |    20 | iOS 26 device discovery needs XCUITest's root-owned RemoteXPC tunnel    |
| Physical iPad · native          | 4 modes × (pen+undo, crayon, Magic, eraser, actions) |    20 | same tunnel blocker                                                     |
| Physical Android · web/native   | landscape light+dark action sweeps for each          |     4 | none known — the harness fix landed; the device was simply out of scope |
| iPad Simulator · native actions | 2 landscape modes                                    |     2 | none — [#1192](https://github.com/KyleMit/Splotch/issues/1192) is fixed |

The physical-Android cells are the cheapest remaining work: the compact-shell fix that blocked them
is landed and verified on the emulator, so they should capture without harness changes.

### The blank-rotation undo surface is open again

[#1192](https://github.com/KyleMit/Splotch/issues/1192) is closed by
[#1193](https://github.com/KyleMit/Splotch/pull/1193), merged upstream as
`ce88c8e587ac45847c419e05ef7a79d282bc747a` and merged into this branch. Undo units now carry the
paper geometry they were recorded against, and an idle undo that refills an empty canvas restores
that paper before reconciling it with the live viewport — ADR-0050's 2026-08 amendment. The harness
needs no change for either consequence below.

**The 2 blocked cells are capturable.** `iPad Simulator · native actions` landscape light and dark
failed only because the landscape-start plan tripped the defect at
`undo clear after blank rotation`. That target is the only one whose landscape action modes are
missing; every other target captured all four.

**90 committed measurements now describe a path that no longer ships.** The action plan in
`tools/perf/ios/capture-xcuitest-actions.mjs` times three labels around the blank rotation —
`undo clear after blank rotation`, `undo restored stroke after blank rotation`, and
`clear restored drawing after blank rotation` — and all three are present in **30 captured modes**:
four each on `ipad-simulator-web`, `android-emulator-web`, `android-emulator-native`, `mac-chrome`,
`mac-safari`, and `mac-firefox`; two each on `ipad-simulator-native`, `android-device-web`, and
`android-device-native`. Every one was measured at the pinned commit, where undo skipped the resize
because it never restored the recorded paper. Post-fix that step performs a `resizeCanvas()`, so a
recapture is expected to read slower on those labels. **That is a behavior change, not a
regression** — do not let a gate score it as one, and do not diff a new landscape iPad-Simulator
cell against the old portrait numbers as if they measured the same code.

Deciding whether to recapture those 30 modes is the next session's call, not a settled plan. The
cheap read is that only the three blank-rotation labels moved and the other ~33 actions per sweep
are untouched; that is an assumption, not a measurement (see below).

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

* Product was pinned at `6961e50b685d441e88b37d20d3f38a27136572fb` for every committed cell, and
  until 2026-08-21 later commits were harness and report only. Merging
  `ce88c8e587ac45847c419e05ef7a79d282bc747a` ends that: the branch now carries product code the
  matrix has never measured. Record the product commit on any cell captured from here, and do not
  silently mix it into the pinned rows.
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
* The #1192 fix moves only the three blank-rotation action labels and leaves the rest of each action
  sweep unchanged. Nothing has been re-measured; the merge was verified with `npm run check` and the
  unit test only.
* The 2 previously blocked `ipad-simulator-native` landscape cells now capture cleanly. The fix is
  confirmed by its own E2E and unit coverage, never by a campaign run.
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
3. **Capture the 2 unblocked `ipad-simulator-native` landscape action cells.**
   [#1192](https://github.com/KyleMit/Splotch/issues/1192) is fixed and merged, so this is now a
   plain capture:
   `npm run perf:campaign -- --target=ipad-simulator-native --items=actions --modes=landscape-light,landscape-dark`.
   Record the product commit as `ce88c8e587ac45847c419e05ef7a79d282bc747a`, not the pin, and replace
   the `#1192` unavailability reason in `sources.json` rather than leaving it beside a result. Then
   decide — and write down — whether the 30 modes above get recaptured against the new product or
   stay pinned with a note that their blank-rotation labels are historical.

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
