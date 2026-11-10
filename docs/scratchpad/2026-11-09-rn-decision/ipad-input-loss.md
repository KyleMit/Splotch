# iPad input loss: Settings → stroke and Eraser → Clear → stroke

Lane: ipad-input-loss, 2026-11-10, Claude. Question: does the iPad lose ink in the two ordinary
sequences where RN loses it on the Galaxy (`perf-galaxy-brushes.md` 3 and 4b)? Simulator only; the
real-iPad run waits for UI Automation (owner case 1), and the exploratory block 7 added to it is
described in `ipad-experiment.md`.

**Builds and rig.** The shared simulator builds: RN plain Release `427756f14`
(`art.splotch.app.dev`) and shipping Release `ef3d1eb20` (under the store ID, allowed on a simulator
only). This lane's own simulator, iPad Pro 12.9-inch 5th gen, iPadOS 26.5, landscape, Pen, Auto-Save
on Delete off in both arms (read from the switch, the fresh-install default). Touch through the
experiment harness's own path (WDA + XCTest W3C actions, no Appium) and its new block-7 functions
(`ipad-experiment/lib/inputloss.mjs`), driven by `ipad-input-loss/bin/check.mjs`. Arms alternate
ABBA, RN first. Raw output: `$C/ipad-input-loss/runs/` (rig file names `$C`).

## Answer

| Sequence (Galaxy result)                                                                                                                 | RN on the iPad simulator                                                                                                                                               | Shipping on the iPad simulator     |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Stroke ~0.3 s after closing Settings (Galaxy: RN lost 5/5)                                                                               | **lost 5/5** (stroke 0.28–0.30 s after the × release)                                                                                                                  | landed 5/5                         |
| Stroke ~0.6 s after closing Settings (Galaxy: fine from 0.5 s)                                                                           | landed 5/5 (0.60–0.83 s)                                                                                                                                               | landed 5/5                         |
| Clear released 0.5–1.0 s after an Eraser lift, pressed at once, then a stroke (Galaxy: every try hit by one failure or the other, 10/10) | **Clear failed 20/20** across two runs, each with "Something went wrong. A picture observation is still settling."; a stroke 1–3 frames after the release **lost 8/8** | cleared 20/20, every stroke landed |
| Clear pressed 0.7–2 s after the Eraser lift (the Galaxy's press time), released 1.1–2.4 s after it                                       | cleared 4/4, then the stroke **and** a control stroke ~2.5 s later **lost 4/4**                                                                                        | cleared 4/4, every stroke landed   |
| The same Clear request after a Pen line instead of the Eraser (control)                                                                  | cleared 3/3, stroke landed 3/3                                                                                                                                         | cleared 3/3, stroke landed 3/3     |
| The first stroke ~3 s after a plain Clear that follows a failed Clear                                                                    | **missing 20/22** (0/9 when the Clear before had worked)                                                                                                               | 0/27                               |

So the iPad (simulator) has **both** Galaxy defects, RN only, and the Clear one is wider than on the
Galaxy: pressed at once after the Eraser lift, every RN Clear up to at least 3 s fails with the
error card (5 s worked); pressed 0.7–2 s after it, every Clear works but RN then drops every stroke
for at least 2.5 s. Shipping drew and cleared every time.

## Pacing achieved

XCTest on the simulator delivers touches at the 60 Hz display rate (UIKit touch frames every 16.7
ms; the harness's `move32` shape), half a real finger's rate. Gaps between contacts are constrained
by two harness facts found here (below): the closest contacts can be is 1–3 frames (32–44 ms
measured) inside one request, and two requests sent back to back leave 0.46–0.58 s. Achieved values
per condition, from UIKit's touch frames (one-request gaps from the request's span minus its
contacts' planned lengths):

| Gap                                       | Planned                               | Achieved                                                 |
| ----------------------------------------- | ------------------------------------- | -------------------------------------------------------- |
| × release → stroke A, "rest-300"          | 1–3 frames + 250 ms rest + 1–3 frames | 282–299 ms                                               |
| × release → stroke A, "host-600"          | own request, ~0.6 s                   | 600–834 ms                                               |
| × release → stroke A, "host-min"          | own request at once                   | 464–584 ms                                               |
| × release → stroke A, "same"              | same request                          | 32–44 ms                                                 |
| Eraser lift → Clear release (d1)          | 500–1000 ms                           | ≈ planned (contact joins ~36–40 ms, from the spans)      |
| Clear release → stroke (d2), same request | 100–400 ms asked                      | 1–3 frames (≈ 35 ms): XCTest drops the idle time         |
| Clear release → stroke (d2), own request  | 500–1000 ms                           | 483–961 ms (RN 717–917: its error-card lookup ran first) |

Nothing here reaches +100–400 ms after a lift directly. "rest-300" gets there by putting the finger
back down on the × at once and resting it 250 ms before the stroke; its control (the same touches
with Settings never opened) drew stroke A in both arms, 2/2 each, so the rest touch is not what
loses RN's stroke.

## Settings → stroke

Gear tap, 1.5 s, × tap, stroke A (0.6 s), 1.5 s, control stroke B on its own row, screenshot 0.5 s
later. A stroke "landed" when the witness finds new ink on ≥80% of its path and it reaches its end.
Every control stroke B landed (all 28 tries valid). Run `settings-072246`.

| Condition (pairs)             | Achieved × → A | RN: A lost | Shipping: A lost |
| ----------------------------- | -------------- | ---------- | ---------------- |
| rest-300 (5)                  | 282–299 ms     | **5 / 5**  | 0 / 5            |
| host-min (2)                  | 464–584 ms     | 0 / 2      | 0 / 2            |
| host-600 (5)                  | 600–834 ms     | 0 / 5      | 0 / 5            |
| same (2)                      | 32–44 ms       | 2 / 2      | 2 / 2            |
| rest-control, no Settings (2) | ≈ 290 ms       | 0 / 2      | 0 / 2            |

At ~35 ms both arms lose the stroke (the closing sheet still covers the paper in both); at ~0.3 s
only RN does; from ~0.46 s both draw. The Galaxy's boundary (lost at 0.3 s, fine from 0.5 s) holds
on the iPad simulator.

## Eraser lift → Clear → stroke

Clear, two Red Pen strokes, Brushes › Eraser, one request: a vertical erase across both, Purple
tapped (back to Pen), the Clear button pressed and dragged 300 ms onto the paper, held so the
release lands d1 after the erase lift; the Purple stroke d2 after the release; screenshot 1.5 s
later; the error-card lookup; a control stroke on its own row. Runs `eraser-071057` (first) and
`eraser2-073056` (with an error-card lookup straight after the release when the stroke is its own
request, a redraw of a missing first Red stroke, and the Pen control).

Per arm, both runs (20 tries per arm on the Galaxy schedule: d1 = 500…1000 ms, d2 = 100…1000 ms; d2
below 450 ms became 1–3 frames, see pacing):

| Arm      | Clear failed | Error card                                                                     | Stroke lost, d2 ≈ 35 ms | Stroke lost, d2 0.48–0.96 s | Control stroke lost |
| -------- | ------------ | ------------------------------------------------------------------------------ | ----------------------- | --------------------------- | ------------------- |
| RN       | **20 / 20**  | **20 / 20** (first run 4 seen, 6 hidden by the screenshot time; rerun 10 seen) | **8 / 8**               | 0 / 12                      | 0 / 20              |
| Shipping | 0 / 20       | 0 / 20                                                                         | 0 / 8                   | 0 / 12                      | 0 / 20              |

Pen control (rerun, the same request after a Pen line, d1 500–700, d2 1–3 frames): RN cleared 3/3,
stroke landed 3/3; shipping the same.

**Galaxy-style press time** (run `split-074342`): the Eraser lift and the Purple tap in one request,
the Clear drag (300 ms, no hold) in the next, so Clear is pressed 0.72–2.05 s after the Purple tap
(release 1.1–2.4 s after the lift), the stroke 1–3 frames or ~0.6 s after the release:

| d1 achieved (lift → Clear release) | d2         | RN: Clear / stroke / control ~2.5 s later | Shipping: Clear / stroke / control |
| ---------------------------------- | ---------- | ----------------------------------------- | ---------------------------------- |
| ≈ 1.1 s                            | 1–3 frames | cleared / **lost** / **lost**             | cleared / landed / landed          |
| ≈ 1.2–1.25 s                       | 583–600 ms | cleared / **lost** / **lost**             | cleared / landed / landed          |
| ≈ 1.7–1.8 s                        | 1–3 frames | cleared / **lost** / **lost**             | cleared / landed / landed          |
| ≈ 2.4–2.5 s                        | 584–666 ms | cleared / **lost** / **lost**             | cleared / landed / landed          |

* **With the Clear pressed at once, it never worked in RN after an Eraser lift** within the Galaxy's
  0.5–1.0 s: 20 of 20 tries failed with the error card (in the own-request tries the card was up at
  the release and then gave way to the next stroke's notice by the screenshot, so the first run's
  "not cleared, no card" rows were the same failure). Shipping cleared all 20.
* The stroke 1–3 frames after the release was lost in RN 8 of 8 (shipping 0 of 8 at the same
  timing); from 0.48 s on it landed in both. The Galaxy's other mode (Clear works, then the next
  stroke is lost) needs the Clear pressed later; with the Galaxy's press time it appeared every time
  (the split table above).
* The Pen control (the same request after a Pen line, no Eraser lift) cleared in RN 3/3 with the
  stroke at 1–3 frames landing: the gesture and its timing are valid for RN; the Eraser lift is what
  breaks it.
* How long the window lasts (RN, one try each, drag end held so the release lands d1 after the lift,
  stroke 0.55–0.82 s later): 1.5, 2.0 and 3.0 s still failed with the error card (seen at the
  release); 5.0 s cleared and the stroke landed (`d1window-074052`). With the press 0.7–2 s after
  the lift instead (table above), Clear works but strokes are dropped for at least 2.5 s.
* **After a failed Clear, the next Clear eats the stroke that follows it.** Each try starts with a
  plain Clear and draws its first Red stroke ~3 s later. In RN that stroke was missing in 20 of 22
  tries that followed a failed Clear (all Eraser runs), and in 0 of 9 that followed a working Clear
  or opened a run. After a fresh launch 0 of 5 were lost; after one failed Clear only the next try
  lost it (1 of 5; `diag-red1-071855`). Shipping: 0 of 27.

## Harness facts found on the way

Simulator, WDA + XCTest. They constrain what any harness block can time, and they explain the
approximations above.

1. **A `pointerMove` after a `pointerUp` on one pointer is applied to the lifted path.** The finger
   is not lifted between that pointer's contacts: a tap followed by a move never presses its button
   (the × tap left Settings open in 2 of 2 arms; probe `dbg-close`). Block 7 gives each contact its
   own pointer (`app.mjs` `sequence`). Block 2's lifted-run witness control is built this way, so
   its "lifted" middle is a stationary hold and a jump, not a lift; the witness still finds no ink
   along the skipped part, which is what that control checks.
2. **Inside one request XCTest drops idle time between non-overlapping contacts.** A second stroke
   planned 1.5 s after the first lift started 1–3 frames after it, with one pointer or two
   (`dbg-multi`). Contacts planned exactly back to back overlap at the boundary, a two-finger
   instant that cancels a button press, so block 7 plans 50 ms between them (dropped anyway).
3. **Two requests sent back to back leave 0.46–0.58 s** between the last touch of one and the first
   of the next (WDA's reply ~0.3 s after the last touch, then the next request's pre-playback).

## Block 7 on the real iPad

Added to the harness after every pre-registered block, marked "added after pre-registration,
exploratory, not scored" in the code, the summary and `ipad-experiment.md`. Per arm: 6 Settings
tries (3 rest-300, 3 host-600), 10 Eraser→Clear tries on the Galaxy schedule, 2 Pen controls; ABBA,
RN first. It refuses to touch an app with an open system prompt, switches Auto-Save on Delete off
where found on and back after, restores the orientation, and stops starting tries after 17 minutes.
Device time ≈ 15 min (36 tries took ≈ 10 min on the simulator; device screenshots and the log
collection add the rest), so the full run is now ≈ 4.75 h.

**Not dry-run end to end (incomplete).** Every block-7 function ran on the simulator through the
harness's own libraries (all the tables above), and the summary's block-7 section was rendered from
recorded rows. The whole-harness dry run F (fresh simulator, `--reps quick`, blocks 1–7) stopped in
the pre-registered preflight, before block 1: shipping's first launch on the fresh simulator showed
no Settings control 3 s after activation (`ipad-experiment/runs/sim-F-074729`). The campaign was
paused before a retry, so `experiment.mjs` has not run block 7 itself, and the pre-registered blocks
have not been re-run since the edit. The edit to pre-registered code is additive only: four lines
extended (default block list, flag map, lead table, block-function map), one new `app.mjs` method,
nothing removed; `node --check` passes for every changed file.

## Defects

| Defect                                                                                                                                                                 | Arm | Severity                                              | Evidence (simulator)                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ----------------------------------------------------- | ---------------------------------------------------------- |
| A stroke ~0.3 s after closing Settings draws nothing (5/5; fine from 0.46 s)                                                                                           | RN  | major (Galaxy lane: blocker by its first-stroke rule) | `settings-072246`, `restctl-*`                             |
| Clear within at least 1 s of an Eraser lift fails with "Something went wrong. A picture observation is still settling." (20/20); a stroke right after it is lost (8/8) | RN  | **major**                                             | `eraser-071057`, `eraser2-073056`, `split-*`, `d1window-*` |
| Clear pressed 0.7–2 s after an Eraser lift works, then every stroke for ≥2.5 s is dropped (4/4)                                                                        | RN  | **major**                                             | `split-074342`                                             |
| After a failed Clear, the next (plain) Clear drops the first stroke drawn ~3 s after it (20/22)                                                                        | RN  | major (same root as the rows above)                   | `eraser-*`, `d1window-*`, `diag-red1-071855`               |

Shipping: no defect in this lane (every Clear cleared and every stroke landed in 64 tries, except
the "same" Settings condition, where both arms lose a stroke 35 ms after the × release).

**Could this flip the decision?** Not toward RN. The iPad carries the same two RN-only ink-loss
defects as the Galaxy, on the simulator, with the Clear one wider (every Clear within a second of an
Eraser lift failed); block 7 will confirm them on the real iPad once UI Automation is on.
