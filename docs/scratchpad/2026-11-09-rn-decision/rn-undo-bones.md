# Is RN's slow Undo bones or a bug?

2026-11-10, Claude. Device: the Galaxy (S21 FE, Android 16). Frozen = `art.splotch.app.dev`, the
installed RN probe Release `427756f14`. Spike = `art.splotch.app.dev.undo`, probe Releases of the
local branch `claude/spike-rn-undo` off `427756f14` (never pushed), installed beside it and
uninstalled at the end. Raw data: `rn-undo/` in the campaign scratch folder (rig file).

## Pre-registered pass bar (written 08:55 EST, before any build or capture)

The prototype: per-commit **tile snapshots** on the native ink layer, as shipping keeps. The first
time a commit's ink writes a 32 px tile, the layer copies that tile's pixels as they stood at the
last commit. Undo draws those copies back, newest first, and replays only the strokes the restored
checkpoint lacks, instead of a fresh raster and a replay of every op. The copies are capped at the
history depth (`MAX_UNDO_DEPTH` = 20) and at a byte budget of **24 MB**. An Undo past the oldest
copy falls back to today's full replay, and counts in the timing below. An estimate from the lane's
`undo-switch` input put a dense 2 s Crayon stroke at ~1.2 MB of 32 px tiles (64 px: 1.6 MB; 256 px:
3.7 MB).

| # | Criterion                  | Method                                                                                                                                                                                                                                                                                                       | Pass                                                                                                                                 |
| - | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1 | Undo speed on dense Crayon | The lane's dense Crayon picture (Size 3, the `undo-switch` strokes: 19 × 2 s, ~47 s), then **12 Undos 1.0 s apart**. Video witness: the first frame where the paper changes after each Undo tap's release, aligned to `getevent` through the strokes' ink onsets. 2 runs on the spike, 1 on the frozen probe | **p90 ≤ 100 ms** over the spike's ≥24 Undos                                                                                          |
| 2 | Taps after an Undo burst   | The same picture, Undo ×3 at 400 ms spacing, Brushes tapped 0.5 s after the last Undo, then Magic, then a probe stroke; and the lane's long variant (5 min of Crayon, Undo ×3 every 60 s, then the same switch 2.0 s after the last burst). Spike and frozen                                                 | **0 ignored taps** on the spike: the brush switches and the probe stroke inks in Magic, every run                                    |
| 3 | Undo stays correct         | (a) In-app oracle in a verify build: after each fast Undo, the layer's pixels against a full replay of the same strokes, byte by byte, on the device. (b) Unit tests over CanvasKit: Pen, Crayon (glaze), Magic, Eraser, multi-touch, Undo mid-stroke, Undo past the budget                                  | (a) **0 differing bytes** on every Undo over ≥10 Undos; (b) 0 differing bytes against a fresh replay in every case                   |
| 4 | Snapshot memory            | The layer's own count of retained snapshot bytes, logged at each commit and Undo; `dumpsys meminfo` TOTAL PSS before and after the timing runs, spike vs frozen                                                                                                                                              | **≤ 30 MB** of snapshots at the default depth (20) on the dense Crayon picture, and PSS after the Undos not above the frozen build's |

**Verdict rule.** **Bug** if all four pass and landing the change costs ≤ 3 agent-days. **Bones** if
passing needs a big tradeoff: snapshot memory over 30 MB at depth 20, or a change to the ink model
(ADR-0178's "the same ops paint a rebuild"). **Unclear** otherwise, with what would settle it.

## What I built

Branch `claude/spike-rn-undo` off `427756f14`, local only, built from a `git archive` export in the
campaign scratch folder (`rn-undo/src`; a session here cannot write into a second worktree) and
committed through a temporary index.

| Commit      | Adds                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `764d43a6a` | Per-commit 32 px tile snapshots in `skiaInkLayer.ts` (`createUndoTiles`); `skiaInkScene.ts` rewinds to the nearest checkpoint instead of `rebuild()`; spike-only `.dev.undo` suffix, log line, verify build |
| `be6ed6674` | A Clear wipes the layer in place after keeping the raster whole, so Undo of a Clear draws it back; the spike logger tolerates the Node tests' react-native mock                                             |

**How it works.** The layer keeps a stack of checkpoints, one per clean commit (no live ink, glaze
group closed): the stroke list the raster then held, plus every 32 px tile ink has written since,
copied (`makeImageSnapshot(tile)`) just before its first write. The two raster write sites are the
plain-brush op paint and the Crayon glaze stamp; both now call `keep(box)` on the box they already
compute for presentation. An Undo (any change to a stroke list the layer has held) finds the
checkpoint with the longest prefix of the target, draws back every tile kept since it newest first
(`BlendMode.Src`), releases the open glaze group, and paints only the target's strokes past that
checkpoint, then the live cohort's ops, exactly as `rebuild()` would after the same prefix. The
checkpoints are capped at `MAX_UNDO_DEPTH + 1` and 24 MB; past the cap the oldest go, and an Undo to
them falls back to `rebuild()`. A Clear keeps the whole raster in one image (the same pixels the
departing-ink snapshot already holds) before wiping it in place.

ADR-0178's ink model is unchanged: ops are still the record, a rebuild still replays them, and the
kept tiles are a cache of pixels those ops already produced. Byte identity with a replay is what the
tests check.

## Runs

Builds: the spike timing Release (`be6ed6674`, APK sha256 `56c87f43…8b2e`) and its verify build
(`239fbb67…4c00`), both verified on the device by hash before use; frozen = `art.splotch.app.dev`
(`7e6af612…28bb`). One run of the frozen and one of the spike's 12-Undo picture ran 09:33–09:37. The
final batch ran 16:45–16:59 under one hold of the Galaxy and rig locks: the second spike 12-Undo
run, the 400 ms Undo burst on both apps, the spike's 5-minute long run, then the verify build's
12-Undo and Clear-Undo runs. Every Undo time below is the first frame where the paper changes after
the Undo tap's release, from the video witness aligned to `getevent`.

## Results against the bar

| #  | Criterion                  | Result                                                                                                                                                                                                                                                                                                                      | Pass |
| -- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1  | Undo speed on dense Crayon | Spike, 24 Undos over 2 runs: **p50 59.5 ms, p90 79 ms**, max 90 ms (run 1: 64 / 79; run 2: 58.5 / 65). Frozen, 12 Undos: p50 480 ms, p90 621 ms, max 644 ms. The spike's rewind took 4–17 ms of JS each                                                                                                                     | Yes  |
| 2  | Taps after an Undo burst   | Spike burst (Undos 43, 43, 79 ms; Brushes 0.5 s after): the probe stroke inked in Magic. Spike long run (101 strokes, 18 Undos in six bursts, Brushes 2.0 s after the last): Magic. Frozen burst (Undos 713, 313, 565 ms): the probe inked Crayon, so a tap was lost                                                        | Yes  |
| 3a | Correct on the device      | Verify build, 12 Undos: 8 byte-by-byte comparisons with a full replay, **0 differing bytes** in each. The oracle holds the JS thread ~1.5 s, so four pairs of taps landed as one two-step rewind; every state the layer reached was compared                                                                                | Yes  |
| 3b | Correct in unit tests      | The spike suite, 19 of 19 (Pen, Crayon glaze, Magic, Eraser, Undo mid-stroke, Clear, depth cap), plus two tests added at the device's plane: two-contact cohorts with an Undo while both contacts draw (5 states, 0 bytes) and 26 dense strokes past the 24 MB budget (20 Undos, 19 rewinds and 1 fallback replay, 0 bytes) | Yes  |
| 4  | Snapshot memory            | Kept tiles peaked at **22.45 MB** (18 checkpoints) on the dense picture and 23.97 MB in the long run, where the budget held them. PSS after the 12 Undos: spike 394.5 and 415.0 MB, frozen 443.0 MB                                                                                                                         | Yes  |

All four pass. The two 3b tests exist only in the lane's scratch copy, not on
`claude/spike-rn-undo`. The probe check first called the long run "Crayon": Magic's hue cycle
happened to start near the default purple. The stroke drifts 47° in hue along its length, where
Crayon drifts 0°, and the check now tests that drift.

Outside the bar's measure: after the three-Undo burst the spike's PSS was 414.0 MB against the
frozen 381.5 MB. The ~22 MB of kept tiles shows there; the frozen build's 12 full replays push its
PSS past the spike's.

## What else the runs showed

* **Undo of a Clear still replays everything on the device.** The two Undos after a Clear took 883
  and 890 ms of JS, and the paper changed 943 and 962 ms after release. The device log has no
  `clear` line, so the in-place wipe from `be6ed6674` never ran. The unit test passes because it
  keeps one scene throughout. Unconfirmed cause: a cleared picture's paper is unadopted, which
  changes the ink view's key, so the layer and its tiles do not survive the Clear.
* **After any full replay, every later Undo is a full replay too** until new strokes commit: a
  replay leaves one checkpoint. That follows an Undo of a Clear, a theme or page change, a resize or
  rotation, and an Undo past the budget. Those Undos are only as slow as the frozen build's.
  Relaunch is not affected: Undo history starts empty.
* At 24 MB the dense Crayon picture keeps 18–19 checkpoints, not 21, so an Undo 19–20 steps deep
  falls back to a replay. About 26 MB would cover depth 20, still under the 30 MB bar.
* The spike's log line breaks four `native-perf-probe` tests, because it writes through the perf log
  module with the probe off. They pass again once the logger is removed.

## Verdict: bug

All four criteria pass with the ink model unchanged, so slow Undo is a bug, not bones. The kept
tiles are a cache of pixels the ops already produced, and a replay is still the reference they match
byte for byte.

**Price: about 2–2.5 agent-days**, within the rule's 3:

| Work                                                                                                                                                                                  | Agent-days |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Land the spike: drop the log line, verify mode and `.dev.undo` suffix; move the two scratch tests in; keep the perf-probe tests green; raise the budget to ~26 MB; one device recheck | 1          |
| Keep the layer through a Clear so Undo of a Clear draws back on the device, with a device check                                                                                       | 0.5        |
| Checkpoint during a full replay so Undo stays fast after a Clear-Undo, theme or page change, rotation, or past the budget. Optional: without it those cases stay at today's speed     | 0.5–1      |
