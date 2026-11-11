# iPad stall ink: strokes started during each arm's natural busy moments

Lane: ipad-stall-ink, 2026-11-11, Claude. First run 04:02 → 04:20 EST (blocked, below); re-run 07:01
→ 08:35 EST. Device: the iPad (iPad Pro 12.9-inch 5th gen, iPadOS 26.5, 120 Hz), landscape. Arms,
best versions already installed: RN best v2 `art.splotch.app.dev.best` (`claude/best-rn` @
`e703b8b79`, probe Release) and shipping best `art.splotch.app.baseline.best`
(`claude/best-shipping` @ `f9d3b6ff6`). Both on Pen, Purple, Size 3, and dark paper: the iPad's
system appearance is Dark and both apps follow it (left as found; the same for both arms). The
Galaxy version of this lane is `stall-ink.md`. Raw data: `ipad-stall-ink/r2/` in the campaign
scratch folder (rig file); scripts in `ipad-stall-ink/bin2/`.

## Answer

* **Shipping best: nothing found on the iPad.** After Save and after an auto-saving Clear, 0 of 36
  trials were hit: 54 of 54 probe lines landed whole, on the wave, one finger and two, at 100, 300
  and 700 ms. No chord, no loss, and no hole in the app's touch log. The Galaxy's chords after Save
  do not repeat here. That fits the code: the 2× iPad takes the PNG worker path, not the GPU replay
  that stalls the Galaxy. Not measured: how late shipping's first ink is (no video, as
  pre-registered).
* **RN best: both export defects repeat on the iPad.** Save loses every stroke started 0.1–0.7 s
  after the tap (18 of 18 trials, 27 of 27 lines). The strokes reached the paper and were refused
  (cohort `strokes 0`): the Save input lock, as on the Galaxy. After an auto-saving Clear every
  stroke lands with its shape, but late: 18 of 18 trials, ink 0.34–0.77 s behind (Galaxy 0.3–1.2 s).
* **Control moment (Settings ×):** both arms lose a stroke begun ~0.1 s after the × (the known
  dialog windows) and draw every stroke from 0.3 s.
* **No hang or crash** in either arm: 63 trials each, every warm control line inked, and 72 pictures
  saved (36 Saves, 36 auto-saving Clears, half per arm).
* **Could this flip the decision?** No. The one result that could move the verdict toward RN
  (shipping chording or losing strokes on the iPad) did not happen. RN's two export defects now hold
  on the most heavily weighted device: one fixable, one unclear.

## The blocked first run (04:02 → 04:20)

No counted capture. RN best's first Save raised iPadOS's Photos prompt (it had never been granted
Photos). The lane left it unanswered, killed the app (the prompt stayed), and sent WDA `/wda/lock`
to dismiss it. The iPad has a passcode, so `/wda/unlock` stopped at "Enter Passcode" and every iPad
lane waited for the owner. Key frames: `ipad-stall-ink/keep/`. Lesson (rig file): never send
`/wda/lock` to the iPad; a permission prompt outlives the app that raised it. The owner restarted
and unlocked the iPad at ~06:15 and saved one squiggle from each best app (IMG_0858 at 06:44,
IMG_0859 at 06:46), so both hold Photos add access. The pre-registration below was written at 04:15
and is unchanged.

## Pre-registered numbers (written 04:15 EST, before any counted capture)

Same moments, delays and thresholds as `stall-ink.md`, adapted to WDA on the iPad. The
orchestrator's three round-3 corrections apply: (1) the unit is the **trial**, one independent busy
action; line counts are secondary; (2) a chord on the **primary** finger counts, as on an extra one;
(3) a lock or a late packet is not a class by itself: **fixable** only with a fix that passes its
gate, **floor** only with a demonstrated tradeoff, otherwise **unclear**.

**Moments** (dense picture first: four 2 s Crayon scribbles over the top third, then Pen):

| Code | Busy moment                                                   | Delay measured from      | Needs                        |
| ---- | ------------------------------------------------------------- | ------------------------ | ---------------------------- |
| N    | none (input-path control), 3 one-finger + 3 two-finger trials | –                        | –                            |
| D    | Settings opened, closed with × (known-window control)         | the × tap's release      | –                            |
| S    | Save (camera button)                                          | the Save tap's release   | Photos add access in the app |
| C    | Clear with Auto-Save on Delete on (switched back off after)   | the Clear drag's release | Photos add access in the app |
| U, R | Undo burst, resume (only if time is left)                     | as on the Galaxy         | –                            |

Delays 100, 300 and 700 ms; per moment and delay 3 one-finger and 3 two-finger trials per arm, arms
alternating per trial set.

**Building a delay with WDA.** XCTest drops idle time between contacts that do not overlap inside
one request (the next touch lands 1–3 frames after a lift), and two requests leave 0.46–0.58 s
between them (`ipad-input-loss.md`). So a trial is one request: the busy tap (60 ms hold), then a
rest contact on the Purple swatch (the current colour, so its tap changes nothing) held D − 2 joins,
then the probe. The rest-contact trick is how block 7 reached ~0.3 s after a dialog
(`ipad-best-retest.md`). The N trials use the same request with the busy tap on Purple too, so they
also control for the rest contact.

**Probe strokes.** One finger: a 600 ms left-to-right wave, x 300 → 780 pt (800 pt/s), amplitude 16
pt, wavelength 160 pt, as 32 ms waypoints (`move32`: XCTest interpolates touches at the display rate
between them; the device pacing gate measured 8.3 ms). Two fingers: the same wave twice, 90 pt
apart, in lockstep (down and up together), because XCTest moves a touch onto another contact's
position when contacts lift one at a time (`ipad-experiment.md`, probe 9). A warm control stroke on
its own row 1.5 s after the probe. Scoring screenshot 2.5 s after the probe lifts, after both apps'
save polaroid has gone.

**Timing on iOS without video or Instruments**, per quantity:

| Quantity                    | Source                                                                                                                                      | Error                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Achieved delay              | UIKit `EventDispatch` touch frames in the unified log, collected after each batch (stages nothing on the iPad): busy lift → probe down      | ±1 frame (8.3 ms) per end. UIKit logs on the app's main thread, so a main-thread stall makes it read long |
| Fallback delay              | Planned offsets plus the two joins measured in the N trials                                                                                 | ±2 frames                                                                                                 |
| RN lateness                 | Probe cohort: `firstDotMs` (first sample → first dot handed off) and max `receiptLag` (native touch timestamp → JavaScript receipt)         | ms; independent of the host clock and of main-thread logging                                              |
| RN lost vs refused          | Cohort present with `strokes 0` = reached the paper and refused; no cohort = never reached it                                               | exact                                                                                                     |
| Shipping first-ink lateness | **Not timeable** here (no video, no Instruments, release WebView not inspectable)                                                           | –                                                                                                         |
| Shipping stall witness      | A chord's x extent ÷ 0.8 pt/ms = how long into the stroke the samples were dropped                                                          | ±1 waypoint (32 ms)                                                                                       |
| WDA pacing                  | Every probe's touch frames: span 0.8–1.25× planned, median ≤ 12 ms, ≥ 80% of 100 ms bins hit; else the trial is invalid (burst), not scored | –                                                                                                         |

**Scoring per line** (final screenshot; RN also its cohort): **lost** < 20% of the x span inked;
**cut** 20–90%; **chord** < 80% of inked columns within 4 pt of the wave's centre line, where the
arm's own N controls score ≥ 90%; **late** (RN only) `firstDotMs` or max `receiptLag` ≥ 100 ms above
the N controls' median. A trial is **hit** when any of its lines is lost, cut, chord or late.

**Positive controls before counting.** Per arm: N trials inked and chord-free (3/3 + 3/3); D at 300
and 700 ms shows the known windows (RN best inks, shipping inks from ~0.25 s); a chord control (a
wave whose middle 60, 120 and 200 ms are one straight segment) must be flagged 3/3 in both arms. If
the two-finger N trials fail in an arm, two-finger trials are dropped there.

**What would change the decision** (RN must be clearly better for users; a tie goes to shipping):

| Finding                                                                                                                                             | Severity and effect                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| An arm has **≥ 2 of 6 trials hit** at 300 or 700 ms for one moment (1 of 6: 3 more trials, pooled ≥ 2 of 9), or RN late ≥ 250 ms in ≥ 2 of 3 trials | **major** for that arm                                                                                   |
| The same at 100 ms only                                                                                                                             | **minor**, unless the other arm is clean there                                                           |
| Shipping chords or loses in ≥ 2 of 6 trials after one moment on the iPad (WebKit)                                                                   | the only result here that could move the verdict toward RN, and only with a class better than "unclear"  |
| RN major on the iPad                                                                                                                                | adds to RN's bill; floor only if moving export off the JavaScript thread is shown to need a big tradeoff |
| Any hang or crash in either arm                                                                                                                     | reported per arm with its rate; blocker-class if it loses the drawing                                    |
| Neither arm crosses a line                                                                                                                          | no change                                                                                                |

## Amendments (written 07:11 EST on 2026-11-11, before any counted capture)

Found while setting up the re-run. No threshold above changes; these fix what the plan could not do
as written.

1. **RN lateness source.** os_log cuts the probe's cohort line at ~1 KB on iOS. `receiptLag` comes
   last and is cut (`<…>`) in most lines (`ipad-memory.md` saw the same). `firstDotMs` survives. In
   place of max `receiptLag`, "late" uses max `oldestToSubmission`: hand-off time minus the oldest
   sample it carries. It includes the receipt lag of those samples plus the JavaScript work after
   it. Same rule: ≥ 100 ms above the arm's N median is late; ≥ 250 ms counts toward "major".
   `receiptLag` p95 is reported where the line keeps it.
2. **Chord metric.** The reference line is the path WDA plays: 32 ms waypoints, joined by straight
   moves (XCTest interpolates between them; each 25.6 pt chord cuts a crest by ≤ 2 pt). The wave is
   `y = row + 16 sin(2π(x − 300)/160)`, as on the Galaxy. Two problems with the plan as written:
   * The stroke's middle (x 540 pt) is a zero crossing. There a 60 ms straight segment stays within
     1 pt of the wave, so no shape test can see it. The chord controls' straight segments are
     centred on the nearest crest instead (x 500 pt, 250 ms into the 600 ms stroke).
   * The on-wave share alone cannot flag a 60 or 120 ms chord: it moves under 10% of a 480 pt line's
     columns. So the Galaxy scorer's second test (`CHORD_RUN_PX`) is added: a line is also a chord
     when ≥ 24 pt of consecutive inked columns (ignoring the first and last 12 pt) sit > 4 pt off
     the reference. 24 pt is 30 ms of stroke.
   * Limit: a dropped stretch shorter than ~30 ms, or one centred on a zero crossing, can stay
     invisible.
3. **Pacing gate attribution.** UIKit logs touch frames on the app's main thread. A main-thread
   stall in the app opens a hole in the log, and the bin test would call that a WDA burst. A burst
   is compression: the whole contact squeezed into a short span with no long gap. So a probe that
   fails the gate counts as **invalid (burst)** only when its span is < 0.8× planned and no gap
   between frames is ≥ 100 ms. When it fails because of one or more gaps ≥ 100 ms, and the frames on
   either side are finger-paced (median ≤ 12 ms), it is **scored** and labelled "main-thread hole",
   with the hole's length reported. N and D probes must pass the gate as written.
4. **N rest lengths.** Each finger count's 3 N trials use the rest holds of the 100, 300 and 700 ms
   delays, one each, so the N set controls every rest length used later.
5. **Layout and pace.** Landscape 1366 × 1024 pt. Dense Crayon: four 2 s scribbles at y 95–290 pt.
   Probe rows y 450 pt (and 540 pt for the second finger), control row y 700 pt, all x 300 → 780 pt.
   Rest contact on Purple (42, 74), Save (366, 962), × (1065, 184), Clear drag from (1341, 87) to
   (273, 666) in 400 ms, the same in both arms. Coordinates are fixed because one accessibility
   lookup in shipping's WebView took ~100 s on the device. Every N, D and S trial starts from a
   plain Clear (Auto-Save off) and a fresh dense picture; every C trial draws a fresh dense picture
   on the previous trial's page, and its own Clear wipes both. Rest hold = delay − 40 ms (two joins
   of ~20 ms, from block 7's device spans); the achieved delay is measured.
6. **Scoring images.** Changed pixels between the screenshot just before the trial (C: a blank
   reference page of the same arm) and the scoring screenshot. A column is inked at ≥ 4 changed
   pixels (2 pt).
7. **Added 07:23, after the N and chord-control batch, before any D, S or C trial.**
   * Joins on the device are 1–8 ms, not ~20 ms. UIKit marks each touch-phase change with
     `shouldSend: 1` (a held, still touch only adds `shouldSend: 0` frames), and a lift and the next
     touch-down land in the same or the next frame. N's achieved delays were therefore 68–73,
     268–275 and 668–677 ms. From D on, rest hold = delay − 5 ms.
   * Chord control: the 120 and 200 ms straight segments were flagged in both arms; the 60 ms one
     was not (longest off-wave run 23 pt, on-wave 0.95, identical in both arms). So the 3/3 control
     fails at 60 ms. The 24 pt line stays: no tuning after seeing a control. Chords from drops
     shorter than ~120 ms may go uncounted, and every probe's longest off-wave run is reported so a
     bend below the line still shows.

## Method as run (07:01 → 08:18 EST on the iPad)

* **Locks and rig.** `dev-ipad.lock` for the whole lane; `rig.lock` per timed batch (N + chord
  control, D, S, C), released before each log collection. Free space 119 GB at the start (stop line
  12 GB). Own WebDriverAgent on a free local port, stopped at the end; the borrowed Appium tunnel
  untouched. No Instruments, no reboot, no install.
* **One trial = one WDA request**: the busy contact (a 60 ms tap on Purple, ×, or Save; for C the
  400 ms Clear drag), a rest contact on Purple held delay − 5 ms, then the probe: one finger, or two
  in lockstep 90 pt apart. Then a warm control wave on its own row (1.4–1.6 s after the probe lifts)
  and the scoring screenshot ~2.7 s after the probe lifts. Every trial starts from a fresh dense
  picture (four 2 s Crayon scribbles), then Pen. Arms alternate per set of 6 trials; the arm that
  goes first alternates per delay.
* **Timing** (`bin2/score.mjs`): the iPad's unified log, collected after each batch
  (`pymobiledevice3 syslog collect`, then deleted). UIKit's `Evaluating dispatch of UIEvent` lines
  with `shouldSend: 1` are the touch-phase changes, on the device clock; the host and device clocks
  agree to a few ms (every trial's frames sit inside its request → reply interval). Achieved delay =
  probe touch-down − busy lift. RN: the probe's cohort line (`strokes`, `firstDotMs`, max
  `oldestToSubmission`).
* **Stop checks** after every trial: the front app must be the arm's bundle ID (all batches), and
  from D on the screen must not be dimmed (a system prompt dims the White swatch; tested on the
  04:06 prompt frame). Neither fired.

## Positive controls (07:12 → 07:20, before any D, S or C trial)

| Control                                             | RN best                                             | Shipping best                              |
| --------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| N: busy tap and rest on Purple, 3 one-finger trials | 3/3 inked, on-wave 1.00, delays 68 / 268 / 677 ms   | 3/3 inked, on-wave 1.00, 71 / 275 / 673 ms |
| N: 3 two-finger trials (6 lines)                    | 6/6 inked, on-wave 1.00                             | 6/6 inked, on-wave 1.00                    |
| N: WDA pacing gate (span, median, bins)             | 6/6 paced: span 1.03–1.04×, median 8.3 ms, all bins | 6/6 paced, same                            |
| N: RN probe medians (the "late" reference)          | `firstDotMs` 13 ms, max `oldestToSubmission` 26 ms  | –                                          |
| Chord control: 60 / 120 / 200 ms straight middle    | not flagged (run 23 pt) / chord / chord             | identical                                  |
| Warm control lines                                  | 9/9 inked                                           | 9/9 inked                                  |

## Results (07:22 → 08:16 EST)

Each cell: trials hit of 6 (3 one-finger + 3 two-finger), then probe lines lost / cut / chord / late
of 9. Achieved delay = probe touch-down − busy lift from UIKit's touch log. Every probe passed the
WDA pacing gate (span 1.02–1.05×, median 8.3–9.4 ms, every 100 ms bin hit; seven RN probes, six at
S-300 and one at C-300, read 0.92–0.94× because RN's main thread held the log), except one RN D
trial whose touches the app never dispatched (its stroke was lost either way). No probe failed the
gate as a burst, and none showed a main-thread hole ≥ 100 ms. Every scored line that inked was on
the wave: on-wave 1.00, longest off-wave run 0 pt.

| Moment               | Delay asked → achieved (ms)                           | RN best: hit · lost/cut/chord/late | RN probe evidence                                                                                        | Shipping best: hit · lost/cut/chord/late |
| -------------------- | ----------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| N: no busy moment    | rests 100 / 300 / 700 → 68–73 / 268–275 / 668–677     | 0/6 · 0/0/0/0 of 9                 | first dot 9–17 ms, max `oldestToSubmission` 20–33 ms                                                     | 0/6 · 0/0/0/0 of 9                       |
| D: Settings ×        | 100 → 101–114                                         | **6/6 · 9/0/0/0**                  | no cohort: the strokes never reached the paper (the leaving dialog took them)                            | **6/6 · 9/0/0/0**                        |
|                      | 300 → 296–309                                         | 0/6                                | on time: first dot 9–17 ms                                                                               | 0/6                                      |
|                      | 700 → 699–714                                         | 0/6                                | on time                                                                                                  | 0/6                                      |
| S: Save              | 100 → 100–110                                         | **6/6 · 9/0/0/0**                  | cohorts with `strokes 0`: reached the paper, refused. Packets waited for JS: `receiptLag` p95 601–622 ms | 0/6 · 0/0/0/0                            |
|                      | 300 → ~300 (RN's log reads 362–373; shipping 301–303) | **6/6 · 9/0/0/0**                  | `strokes 0`; p95 609–625 ms. RN's main thread held the touch log ~65–75 ms around 0.3 s                  | 0/6                                      |
|                      | 700 → 701–715                                         | **6/6 · 9/0/0/0**                  | `strokes 0`; p95 266–296 ms                                                                              | 0/6                                      |
| C: auto-saving Clear | 100 → 100–102                                         | **6/6 · 0/0/0/9 late**             | first dot 164–183 ms, then the line froze 747–759 ms mid-stroke (max `oldestToSubmission` 746–760 ms)    | 0/6 · 0/0/0/0                            |
|                      | 300 → 300–309 (one RN trial reads 384)                | **6/6 · 0/0/0/9 late**             | first dot 752–768 ms in 3 trials; on time in 3, then a 745–763 ms freeze                                 | 0/6                                      |
|                      | 700 → 700–708                                         | **6/6 · 0/0/0/9 late**             | first dot 356–374 ms, no freeze after                                                                    | 0/6                                      |

"Late" is measured against RN's N medians (first dot 13 ms, max `oldestToSubmission` 26 ms): C
trials were 342–754 ms late. Shipping has no "late" column: its first ink is not timeable here.

**What the timings say about RN.** After Save, the JavaScript thread is busy for about a second:
packets of a stroke begun at 0.1–0.3 s wait ~0.6 s, and of one begun at 0.7 s ~0.3 s. The Save lock
refuses every stroke that starts meanwhile. A warm control stroke 2.4–3.3 s after Save inked on time
(first dot 5–13 ms), so the lock ends between 0.7 and 2.4 s after the tap (the Galaxy's ~1.6 s
fits). After an auto-saving Clear, the JavaScript thread is blocked from ~0.3 s to ~1.05 s after the
release: a stroke begun at 0.1 s draws its first dot, then freezes until ~1.05 s; one begun at 0.7 s
waits ~0.36 s for its first dot. Every sample still arrives, so the shape survives. RN's main thread
also stalls during both exports, but briefly: one 74–92 ms gap in its touch log during the S-100,
C-100 and C-300 probes, and a rest that read 65–76 ms long at S-300 (≤ 24 ms everywhere else). That
is where iOS composes the ink through react-native-svg (`spike-rn-export.md`); it stays under every
line here.

**Shipping.** Its app's touch log never paused more than 18 ms during any probe, after Save or an
auto-saving Clear. The data URL that crosses the Capacitor bridge did not stall UIKit's main thread
long enough to show. The WebContent process was not observed.

**Saves happened.** iPadOS's Photos library went from IMG_0859 (the owner's) to IMG_0931: 72 new
pictures, one per Save and per auto-saving Clear. No Photos prompt appeared.

## Verdicts by the pre-registered lines

| Finding                                                              | Arm      | Severity (pre-registered line)                                 | Class (rule 3)                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------- | -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strokes started 0.1–0.7 s after Save are lost                        | RN       | **major**: 6 of 6 trials hit at 300 and at 700 ms              | **fixable**: the input lock around `exportPng` in shared code. `spike-rn-export.md` fix (a), Save from frozen ink, passed its gate on the Galaxy (9/9 and 9/9 against 0/27). That fix was not run on the iPad; its 0.5-day price includes the iPad check                                                       |
| Ink 0.34–0.77 s late after an auto-saving Clear (every stroke lands) | RN       | **major**: late ≥ 250 ms in 6 of 6 trials at 300 and at 700 ms | **unclear**: export work on the JavaScript thread. The Android worker spike made it movable, not a floor, but missed its gate by one line. iOS also composes ink on the main thread (seen here, ~75–90 ms), and the worker is unbuilt and unmeasured on iOS (0.5–1 day). No tradeoff was shown, so not a floor |
| Stroke started ~0.1 s after closing Settings is lost                 | both     | minor: 100 ms only, and neither arm is clean there             | the known dialog windows (RN best's leaving modal, shipping's dialog fly-back); a control, as planned                                                                                                                                                                                                          |
| Shipping chords or loses after Save or an auto-saving Clear          | shipping | **not seen**: 0 of 36 trials, 0 of 54 lines                    | –                                                                                                                                                                                                                                                                                                              |
| Hang or crash                                                        | both     | none in 63 trials per arm (36 exports per arm)                 | –                                                                                                                                                                                                                                                                                                              |

## Could this flip the decision?

No. It strengthens "keep shipping" on the device that counts most.

* The plan named one result that could move the verdict toward RN: shipping chording or losing
  strokes after a busy moment on the iPad. It did not happen. The Galaxy's Save chords came from the
  full-page GPU replay (`spike-shipping-export.md`), which the 2× iPad does not take.
* RN's two export defects are not Galaxy-only. Save's stroke loss is a cheap, already-gated fix.
  Late ink after an auto-saving Clear (opt-in) stays unclear until the export worker exists on iOS,
  where the main-thread react-native-svg compose has to move too. Both add to RN's bill; neither is
  shown to be a floor.

## Not measured

* Shipping's first-ink time (no video, no Instruments), and its WebContent process.
* The U (Undo burst) and R (resume) moments: skipped for time. On the Galaxy, Undo cost nothing and
  resume only bent stroke starts during the OS's window animation, in both arms.
* Light paper, coloring pages, Apple Pencil, and delays past 0.7 s (the RN Save lock's end is only
  bounded: 0.7–2.4 s).
* Chord sensitivity below ~120 ms of dropped samples (the 60 ms control was not flagged).
* The spike builds (`spike-rn-export`, `spike-shipping-export`) on the iPad.

## What the code predicts (no device evidence)

Read at the installed commits; platform-shared code unless noted.

| Moment               | RN best (`e703b8b79`)                                                                                                                                                                                                                                                                                                                                                          | Shipping best (`f9d3b6ff6`)                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save                 | `useSaveAction` runs `capturePicture` (`surface.exportPng`) inside `runCommand`: the input lock covers the export, then is released before `savePicture` asks Photos. No platform branch, so iOS should also **lose** strokes begun during the export; how long that is on the iPad is unmeasured (Galaxy ~1.1 s of JS work). The prompt seen at 04:06 came after this capture | PNG encode in a Web Worker, then `FileReader.readAsDataURL` and `Media.savePhoto({ path: dataUrl })` (`web/src/lib/drawing/imageSave.ts`): a multi-MB string crosses the Capacitor bridge, parsed on the app's main thread, where UIKit takes touches. Whether that bends, delays or drops samples on WebKit is the open device question |
| Auto-saving Clear    | Clear wipes at once (`keepDepartingPicture`, no lock) and exports the departing picture on the JS thread: ink should land **late**, not lost (Galaxy 0.3–1.2 s)                                                                                                                                                                                                                | Same export and bridge path as Save, without the polaroid                                                                                                                                                                                                                                                                                |
| Photos never granted | Both moments end in the Photos prompt on first use, so neither can be measured on the best builds until the owner answers it                                                                                                                                                                                                                                                   | Not tested; probably the same (no earlier lane saved from this bundle ID on the iPad)                                                                                                                                                                                                                                                    |

`useSavePicture.ts` is identical in the frozen RN probe (`427756f14`), whose app on the iPad
(`art.splotch.app.dev`) holds Photos access since owner case 1 (2026-11-10), as does frozen shipping
(`art.splotch.app.baseline.main`). The export internals differ (best changed `DrawingSurface`,
`skiaInkScene` and others), so a Save run on the frozen builds would test the lock, not the best
version's export time, and frozen RN's Clear still has the lock the best version removed.

**Against the device.** RN's Save row held: strokes begun during the export were lost. Its Clear row
held: every stroke landed, late. Shipping's open question resolved in its favour: neither Save nor
an auto-saving Clear bent, dropped or (as far as the app's touch log shows) delayed a stroke. The
Photos row no longer applies: the owner granted both apps before the re-run.

## State left behind

* The iPad, 07:01 → 08:18 under `dev-ipad.lock` (`rig.lock` per timed batch: 07:12–07:20,
  07:22–07:40, 07:40–07:58, 08:01–08:16). Unlocked throughout; never locked; no system prompt seen.
  Free space 118.8 GB at the end.
* Both best apps: page cleared, Pen, Purple, Size 3 (read from their menus at 08:17), Auto-Save on
  Delete **off** (on 08:00–08:16 for C only; switch screenshots before and after each change in
  `r2/c-setup/`), dark paper (system appearance, unchanged), Sound untouched. Shipping best in
  front.
* Photos: 72 new pictures, IMG_0860 → IMG_0931 (36 Saves, 36 auto-saving Clears, 36 per arm).
  Nothing deleted. The owner's IMG_0858 and IMG_0859 untouched.
* The store app, the frozen builds and every other app: never touched. No Instruments, no reboot, no
  install. Own WebDriverAgent stopped; the borrowed Appium tunnel untouched.
* Scratch: `ipad-stall-ink/r2/` (screenshots, `marks.json` and `score.json` per batch, the extracted
  touch logs) and `ipad-stall-ink/bin2/` (`trial.mjs`/`trial2.mjs` driver, `batch.zsh`,
  `collect.mjs`, `score.mjs`, `summary.mjs`, `autosave.mjs`). Log archives deleted after export.
