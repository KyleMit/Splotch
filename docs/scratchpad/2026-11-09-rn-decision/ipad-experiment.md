# Real-iPad fair pair: harness and pre-registered plan

Lane: ipad-experiment-prep, 2026-11-10, Claude. Arms, both already installed on the iPad (iPad Pro
12.9-inch 5th gen, iPadOS 26.5): RN = `art.splotch.app.dev` (RN probe Release, RN source
`427756f14`), shipping = `art.splotch.app.baseline.main` (Release, shipping source `ef3d1eb20`). The
harness lives in `ipad-experiment/` in the campaign scratch folder (`$C`, named in the rig file).
Nothing here is evidence yet: the iPad still refuses UI automation.

## Run it

| Step            | What                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate            | Owner packet case 1: Settings › Developer › Enable UI Automation → on.                                                                                                                                                                                                                                                                                                                                                                       |
| Check           | `zsh $C/ipad-experiment/bin/check-ui-automation.zsh` prints `UI AUTOMATION ON` (exit 0) or `OFF` (exit 3). About 70 s, holds `dev-ipad.lock`.                                                                                                                                                                                                                                                                                                |
| **The command** | `zsh $C/ipad-experiment/bin/run-ipad-experiment.zsh`, unattended. Exits 3 at once if automation is still off. Extra arguments pass through, e.g. `--blocks 3,4,5`.                                                                                                                                                                                                                                                                           |
| Duration        | About 3 h of device time if no other lane holds `rig.lock`: setup, pacing gate and calibration ≈ 15 min; block 1 ≈ 40 min; block 2 ≈ 90 min (18 traced runs of ~30 s recording plus ~3–4 min of xctrace processing each, and two ~1 min prefills); blocks 3–5 ≈ 20 min (6, 2 and 8 min on the simulator); one device-log collection per block. If the gate finds bursts everywhere, blocks 1–2 are skipped and the run takes ≈ 40 min.       |
| Locks           | `dev-ipad.lock` for the whole run. `rig.lock` per timed pair in blocks 1–2 (both halves of a pair under the same host conditions), with the 60 s fairness gap between pairs. Blocks 3–5 are functional.                                                                                                                                                                                                                                      |
| Writes          | `$C/ipad-experiment/runs/device-<stamp>/`: `summary.md` (verdicts, rewritten after every block), `runs.jsonl` (every attempt), `gestures.jsonl` (every scored gesture with its request/reply times), `pacing-gate.json` and `bN-pacing.json`, `preflight.json` (with calibration), `schedule.json`, `experiment.log.txt` (UTC clock), the collected device logs, and per run its screenshots, `run.trace`, exported tables and `score.json`. |
| Disk            | Each trace is ~0.5–1 GB (30 traces ≈ 25 GB). The run refuses to start under 35 GB free and drops freeze-free traces once free space falls under 15 GB.                                                                                                                                                                                                                                                                                       |
| Device state    | Orientation goes back to what it was before the run after block 5 (blocks 1–4 run in landscape). Both canvases are cleared at the end. Sound is switched on if found off (recorded in `preflight.json`). The store app is never touched: the harness refuses `art.splotch.app` on the device.                                                                                                                                                |

## Method common to every block

* **One OS touch path.** WebDriverAgent (the prebuilt runner the setup lane installed, started with
  `xcodebuild test-without-building`, reached through `iproxy`) receives W3C pointer actions over
  HTTP, without Appium. XCTest synthesizes the touches in both apps identically. The same scripts
  drive both arms by accessibility label (RN exposes brush options as buttons, shipping as switches;
  both mark the current one with value 1).
* **Finger cadence.** Paths are designed at 16 ms resolution and re-timed to the gesture shape the
  pacing gate picks: `move32` (32 ms waypoints, XCTest interpolating touches between them), `pause8`
  (instant moves with explicit 8 ms pauses) or `move8` (8 ms timed moves). Geometry and speed are
  the same in every shape and both arms; a zigzag keeps its vertices (one leg per step, so with
  `move32` it runs at ~3,300 pt/s, 15 reversals a second).
* **No accessibility queries before a stroke.** WDA resolves each pointer action's coordinate
  through an accessibility snapshot of the app before XCTest plays anything: 15 ms per action in RN
  and 5 ms in shipping on the simulator at the default depth, so a 20 s stroke waited ~27 s and the
  app's main thread answered those queries just before contact. The harness sets `snapshotMaxDepth`
  to 1 for gestures (the cost drops to ~0, ink unchanged) and back to 50 for element lookups.
* **Contact windows.** With `animationCoolOffTimeout` and `waitForIdleTimeout` at 0, a stroke's
  window is anchored on WDA's reply: [reply − shift − planned × ratio + 80 ms, reply − shift − 50
  ms]. Before block 1 a **calibration** traces three lines of 0.64, 1.9 and 3.8 s per arm and
  measures where the ink's display-swap burst ends relative to the reply (`shift`, signed, ±1,000 ms
  cap) and how long playback takes relative to plan (`ratio`, 0.5–1.5). Both are recorded in
  `preflight.json`. If the median gap before every window's end exceeds 100 ms in both arms, the
  windows are misaligned and block 2 is "unknown".
* **Counterbalancing.** ABBA inside every block: pair *i* runs lead→other when *i* is even and
  other→lead when odd. The lead arm alternates by block: 1 RN, 2 shipping, 3 RN, 4 shipping, 5 RN.
* **Trace.** One `xcrun xctrace record --template 'Animation Hitches' --all-processes` per timed
  run, started before the first gesture and stopped by SIGINT 1.5 s after the last reply (the time
  limit is only a cap); `devicectl … ddiServices` is touched first; `toc`, `hitches-frame-lifetimes`
  and `hitches` are exported (the perf lane's method). A trace with no frame lifetimes is invalid,
  never a freeze. Animation Hitches does not run on simulators ("Hitches is not supported on this
  platform").
* **Lost in-contact time** = the sum over display-swap gaps inside the window of (gap − 16.7 ms),
  i.e. against one 60 Hz frame. A steady 60 Hz arm (WKWebView's default) loses nothing for its
  cadence alone, so a 120-vs-60 label cannot win the rule. The 120 Hz figure is reported, never
  scored. **Freeze** = an in-contact gap ≥100 ms.
* **Pixel witness.** A WDA screenshot after every stroke set. New ink is a pixel that changed
  between the before and after shots within ±12 pt of the intended path, sampled every 4 pt; a
  stroke **reached its end** when its last inked sample is at ≥95% of the path.
* **Every attempt is kept.** An attempt whose trace failed, whose app was not in front, or whose
  window fell outside the trace is recorded as invalid with its reason, never silently dropped. Only
  block 2 replaces invalid pairs, at most two per brush.

## Input pacing control (gates every scored block)

The multi-finger spike (`spike-multitouch.md`) found that XCUITest on the simulator delivers a whole
320 ms gesture to UIKit in one 4–23 ms burst, while real fingers arrive about every 8 ms. Under a
burst WebKit keeps only the primary finger's samples, which is what produced shipping's simulator
"multi-finger ink loss". Whether the iPad bursts too is unknown until the first run, so:

| Item                | Rule                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instrument          | Both arms: UIKit's Default-level `Evaluating dispatch of UIEvent …; type: 0;` line (`com.apple.UIKit`, `EventDispatch`), one per touch frame delivered to the app process, before WebKit or RN see it. RN also: the probe's per-stroke `SplotchPerf` cohort (`packetGap` p50, `cohortMs`, `maxSamplesPerPacket`). Logs are post-collected after each block, never streamed. |
| Paced gesture       | Touch frames span 0.8–1.25× the planned contact, median spacing ≤12 ms, p90 ≤25 ms. Fewer than 0.8× is a **burst**.                                                                                                                                                                                                                                                         |
| Gate before scoring | One 1.2 s line per arm in each of `move32`, `pause8`, `move8`. The first shape both arms receive paced is used for the whole run (else the first that does not burst). If every shape bursts, blocks 1–2 are skipped (they cannot be scored) and blocks 3–5 still run, marked invalid for scoring.                                                                          |
| Block verdict       | A block is scored only if both arms have pacing data for ≥50% of its gestures and ≥90% of those are paced. More than 10% bursts in either arm → **INVALID: burst**. Missing data → **INVALID: unknown**. The tables stay as diagnostics; the verdict line is withheld. Block 4 is descriptive and only reports its pacing.                                                  |
| Diagnostic          | Timed runs also report the display-swap span over the window (≈1.0 when ink presents across the contact, as in the perf lane's replay traces: 1.03–1.04). Not part of the gate.                                                                                                                                                                                             |

Simulator evidence for the shape order (this lane's probes 7–8, own simulator, UIKit log streamed;
the simulator display is 60 Hz):

| Shape (150-step line, planned 1.2 s)       | Touch frames UIKit delivered (RN / shipping) | Span ÷ planned | Median spacing |
| ------------------------------------------ | -------------------------------------------- | -------------- | -------------- |
| `move8`, `move16`, `pause8`, `pause16`     | 4–5 / 4–5                                    | 0.01–0.03      | burst          |
| 150 ms hold after touch-down, then `move8` | 16 / 16                                      | 0.14           | the hold only  |
| `move8`, then a 600 ms hold before lift    | 41 / 40                                      | 0.33           | the hold only  |
| 30 ms waypoints (38 moves)                 | 78 / 80                                      | 1.11–1.13      | 16.7 ms        |

XCTest plays holds and ≥30 ms waypoints in real time and interpolates touches at the display rate,
but collapses moves of 8–16 ms. On the 120 Hz iPad, `move32` may therefore deliver every ~8 ms; if
it delivers every 16.7 ms instead, the gate reports "60 Hz delivery" and the blocks are withheld
(the rule asks for real-finger pacing).

## Blocks and pre-registered scoring

Written before any device run. A tie or an unknown keeps shipping.

| Block                                | Workload, per arm                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Scored as                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Cold first strokes, sound on       | 6 attempts, 12 interleaved (R S S R …). Both apps terminated, 2 s, trace starts, WDA launches the app, 3 s, a 0.6 s Pen line, 1.5 s, a second identical line (control), screenshot.                                                                                                                                                                                                                                                                                                                                                                          | **Hold** = stroke-1 in-contact gap ≥100 ms. **Major** if ≥2 of 6 attempts hold; **blocker** if ≥2 of 6 first strokes miss ink (coverage <0.8 or not reaching the end). One of 6 = "seen once, unconfirmed". Cannot award RN a win.                                                                                                                                         |
| 2 Dense Crayon (decisive)            | 200-stroke prefill (100 Pen Blue, 100 Crayon Green, same seeded geometry in both), then 6 pairs of one continuous 20 s Red Crayon contact: 2.5 s slow loops (700 pt/s) alternating with 2.5 s scribbles (1,500 pt/s).                                                                                                                                                                                                                                                                                                                                        | Codex's rule. **RN wins** only if all of: 6 valid pairs; shipping freezes ≥100 ms in ≥4 of 6 runs; RN in none; RN's lost time ≤ half of shipping's in **every** pair; median paired reduction ≥100 ms per run. **RN loses** if RN freezes where shipping does not in ≥2 pairs. Otherwise tie → shipping. A run is valid only if the witness finds ink on ≥80% of the path. |
| 2 Dense Magic brush (supporting)     | 3 pairs, same path and picture, Magic brush.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Same metrics. Can only show an RN loss (≥2 pairs where only RN freezes); cannot award a win.                                                                                                                                                                                                                                                                               |
| 3 Multi-finger                       | 10 two-finger and 10 three-finger parallel horizontal lines (all pointers in lockstep), 3 zigzags (one leg per step; ~3,300 pt/s with `move32`), each on a cleared canvas in Red.                                                                                                                                                                                                                                                                                                                                                                            | Per line: reached its end or cut. Per trial: stray ink = ≥50 changed samples (3 pt grid) farther than 24 pt from every finger's path (loops, chords, lines joining fingers). **Defect reproduced** (major if a finger confirms it) when ≥2 trials of a kind are cut or stray.                                                                                              |
| 4 Palm                               | **WDA cannot synthesize a large contact**: XCTest's pointer events carry only position, pressure and time (no radius in `XCPointerEvent` or anywhere in XCTest). Proxy: five small contacts rest in a cluster while a sixth draws a line; 5 trials.                                                                                                                                                                                                                                                                                                          | Descriptive only: finger-line reach, ink inside the resting cluster, stray ink. Not a palm test; owner case 4 stays the only palm evidence. Stray ink here is **not** evidence about either app: XCTest's multi-contact synthesis moves a touch onto another contact's position when contacts lift (probe 9 below).                                                        |
| 5 Rotate → Clear → draw; Undo → draw | 9 tries, alternating landscape→portrait and back. **Before tries 1, 4 and 7 in each arm, page and theme churn** (the rotation spike's precondition: 0 of 18 right after launch): portrait, apply a Farm coloring page, Settings › Appearance → Dark, then → Light (in-app, not `simctl ui`), clear the page. Then each try: Red zigzag, rotate, 1.5 s, Clear, a Blue line (the journeys-lane sequence), Undo, a Purple line; each new line screenshotted at once and again at 3 s. Each arm's theme is restored at the end (System if it could not be read). | **Fail** = a new line is not inked (coverage ≥0.8 and reaching its end) in the first screenshot taken ≤500 ms after its stroke ended; "late" if inked at 3 s, "invisible" if not. A first shot later than 500 ms is "uncertifiable", not a pass. **Major** if ≥2 of 9 tries fail.                                                                                          |

## Dry run on the simulator

Harness proof only: simulator timing is not evidence. Own simulator `ipad-experiment-dryrun` (iPad
Pro 12.9-inch 5th gen, iPadOS 26.5, deleted afterwards) with the shared simulator builds (RN plain
Release `427756f14`; shipping Release `ef3d1eb20`, under the store ID, which is allowed only on a
simulator). Four runs, each holding `rig.lock`: **A** blocks 1–2, quick repetitions, traces on,
forced calibration; **B** blocks 3–5, full repetitions; **C** blocks 2–5, quick, after the fixes;
**D** block 5 with churn, 12 tries per arm, on a second fresh simulator (also deleted).
`--ignore-pacing` made the timed blocks run despite the gate. Raw output:
`$C/ipad-experiment/runs/sim-{A,B,C}-*`.

| Part             | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight        | Both arms: landscape, Sound on (read from the switch), Pen + Purple, canvas cleared, WDA pre-playback ≈5 ms/action at depth 1.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Pacing gate      | `move32`: half-rate (60 Hz), 69–80 UIKit touch frames per 1.2 s line, span 1.04–1.06×, median 16.7 ms (the simulator's display rate). `pause8` and `move8`: burst. Every block's verdict was withheld, as designed.                                                                                                                                                                                                                                                                                                                                                                    |
| Traces           | Animation Hitches cannot record on a simulator, so every trace and both calibrations were marked invalid with a reason and never scored as freezes. The scorer was proven on a real iPad export instead (the perf lane's `hitch-rn-1`): it reproduces the 126 ms first-stroke freeze; swap span 1.03–1.04.                                                                                                                                                                                                                                                                             |
| Block 1          | Terminate both, WDA launch, 3 s, two strokes: both strokes inked in both arms (coverage 0.99, reach 0.99).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Block 2          | Prefill 48–52 s per arm (61–66% of the canvas inked). Each 20 s run: WDA round trip ~29 s; 1,156–1,255 UIKit frames spanning 1.04× the plan, so playback was real time. Witness coverage 0.82–0.95 per run (shipping Magic brush lowest, 0.82–0.88).                                                                                                                                                                                                                                                                                                                                   |
| Block 3          | 0 of 50 lines cut and 0 stray trials in both arms, 10 two-finger, 10 three-finger and 3 zigzag trials each.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Block 4          | Finger line complete in both arms. RN drew a stray segment toward the resting contacts in 6 of 6 trials (149 stray samples); shipping drew only the contacts' dots (0). Probe 9 shows this is a harness artefact (below).                                                                                                                                                                                                                                                                                                                                                              |
| Block 5          | Without churn (runs B, C): new ink at the first screenshot (124–184 ms) in 22 of 22 tries per arm. **With churn (run D, fresh simulator, 12 tries per arm, churn before tries 1, 4, 7, 10): RN 1 of 12 invisible** (try 4, portrait→landscape, straight after a churn: both the post-Clear and post-Undo lines stayed invisible at 3 s while Undo was enabled; flat paper, as in the spike); **shipping 0 of 12**. Every churn applied and cleared the page and flipped Dark→Light in both arms. RN's theme selection could not be read back, so the end-of-block restore uses System. |
| Counterbalancing | `schedule.json` and the run order matched ABBA; the lead arm alternated by block.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Fixed on the way: shipping's brush options are switches, not buttons; strokes now draw at depth 1;
traces stop on SIGINT after the last reply (a 20 s run's request took ~29–47 s); a trace with no
frame lifetimes is invalid, not a freeze; dense runs cycle colour and offset per pair (identical
runs had hidden their own ink from the witness: coverage fell 0.95 → 0.11); blocks 3–5 select Pen;
block 5 draws straight after Clear, because the Undo-first sequence could mask the journeys-lane
defect.

**Leads from the simulator (not evidence):**

1. With paced input, shipping's multi-finger cuts and zigzag loops vanish, as `spike-multitouch.md`
   predicted.
2. Block 4's RN stray segment is a **harness artefact** (probe 9: seven palm-proxy variants, twice
   per arm). When the drawing finger lifts while other contacts stay down, or the resting contacts
   lift mid-stroke, **both** arms draw the same diagonal from one contact's position to another's
   (stray RN 241/639, shipping 250/474). Two unrelated input stacks drawing identical shapes means
   the jump is in XCTest's synthesized touches, not in either app. When all six lift together only
   RN draws it (149–258 vs 0): RN renders every coalesced sample, and shipping's stroke-end
   smoothing drops the final half-chord (`spike-multitouch.md`), which hides the jumped last sample.
   One resting contact or the finger alone: 0 in both. Real held contacts need owner cases 4–5.
3. RN's invisible ink after rotation needs churn, as the rotation spike found: 0 of 22 tries without
   it, 1 of 12 with page and theme churn (spike's frozen control: 1 of 12). Shipping 0 of 34. On the
   device, 9 tries per arm with 3 churns can easily miss a ~1-in-12 defect, so a clean RN result
   there is weak evidence.
4. On the simulator WDA replies ~300 ms after the last touch reaches UIKit; the device calibration
   measures the same shift (capped at ±1 s).

## Readiness probe (physical iPad)

2026-11-10 02:17:48–02:18:55 EST, holding `dev-ipad.lock` (the only time this lane touched the
iPad): `xcodebuild test-without-building` on the WDA runner started it at 02:17:51, and it failed at
02:18:52 with **"Timed out while enabling automation mode"** (exit 3). Owner case 1 is still
pending. `check-ui-automation.zsh` repeats this check for any lane (command in the rig file).

## What the experiment still cannot measure

* **Touch-to-photon latency and first-dot time.** Display swaps say when *something* was presented,
  not when the finger's ink was; host-clock alignment is ±tens of ms. Codex's 50/75 ms first-dot
  limits cannot be certified (as Codex said).
* **A shipping freeze the compositor hides.** If WebContent stalls while UIKit keeps animating
  something else, the display still swaps and the gap is missed. The pixel witness only checks the
  final ink.
* **Palm rejection.** No synthesized contact has a radius, so iPadOS and both apps see the "palm" as
  fingers. Owner case 4 stays the only palm evidence.
* **Input pacing is unknown until the device runs.** If XCTest bursts on the iPad too, blocks 1–3
  and 5 are withheld; if it delivers at 60 Hz rather than ~8 ms, they are withheld as "half-rate"
  (the data stay for anyone who chooses to relax the rule). If UIKit's dispatch lines do not persist
  in the iPad's log, shipping's pacing is unknown and its blocks are withheld. RN's probe log and
  the trace's swap span remain as secondary evidence.
* **Per-pointer timestamps.** UIKit's line is one per touch frame for all fingers together; the RN
  probe reports per-stroke packet gaps. Neither names the finger.
* **Rotation mid-stroke.** WDA serializes requests, so a rotation cannot land during a stroke.
* **Sound.** "Sound on" is the setting; nothing records that the sound actually played.
* **Shipping attribution.** Time Profiler is in the trace, but a shipping freeze's cause inside
  WebKit needs the trace opened by hand.
