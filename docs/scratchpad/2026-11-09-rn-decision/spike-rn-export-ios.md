# Spike: RN export off the input path on the iPad (Save from frozen ink, worker, Skia ink compose)

Lane M, 2026-11-11, Claude, from 08:27 EST. Device: the iPad (iPad Pro 12.9-inch 5th gen, iPadOS
26.5, 120 Hz), landscape. Base: `claude/spike-rn-export` @ `e19904a36` (the Android spike, on RN
best v2 `claude/best-rn` @ `e703b8b79`). Spike branch: `claude/spike-rn-export-ios` (local, never
pushed). Raw data and scripts: `spike-rn-export-ios/` in the campaign scratch folder (rig file).

## Answer

* **The iOS half works on the iPad.** On the gate build (B), Save loses no stroke (0 of 27 lines; RN
  best 27 of 27), and every S and C line is on time at 100, 300 and 700 ms (54 of 54; RN best inked
  all 27 C lines 0.34–0.77 s late). No probe saw a main-thread gap ≥ 50 ms (worst 25 ms; RN best
  74–92 ms). The export's 0.9–1.0 s of pixel work runs on the worklets worker. Neither the
  JavaScript thread (first dots on time) nor the main thread (no touch-log hole) shows it.
* **The main-thread stall was react-native-svg, and it moves.** An Instruments Time Profiler trace
  of configuration A (below) puts the old ~85 ms hole inside `RNSVGSvgView getDataURLWithBounds`:
  CoreGraphics drawing the ink image and PNG-encoding it (62–64 ms together; the encoder pulls the
  drawing lazily), then ~28 ms of Core Animation layout, all on the main thread, while the
  JavaScript thread sat idle waiting for the callback. Composing the ink in Skia on the worker (7
  changed lines) removes it.
* **Configuration A** (my own build error: the first bundle lacked the compose change, amendment 9)
  is `e19904a36` on iOS: Save from frozen ink plus the worker, with the ink still composed by
  react-native-svg. It already fixed Save (0 of 27 lost) but kept the ~85 ms main-thread hole at the
  ink hand-off, which made 6 of 9 C lines late at 300 ms (100–110 ms). A against B isolates exactly
  that one change.
* **Gate (B): fixable.** Save loss pass; late ink fixable (18 of 18 S and 18 of 18 C at 300/700 ms);
  main thread pass; fidelity pass on the registered tolerance, with one honest caveat (below);
  controls pass. Worker memory measured.
* **Fidelity caveat.** Paper and grain are pixel-identical to RN best's export (AE 0 away from the
  ink). The stroke edges are not: RN best's iOS export draws a dark 1–2 px fringe along every stroke
  (the react-native-svg route), and B does not. The on-screen ink has no fringe either, so B matches
  what the child saw. 25% of near-ink pixels differ (max 107 of 255); B has 8.7% fewer "ink" pixels.
* **Could this flip the decision?** No. It turns RN's iPad export item from "unclear" into "fixable"
  and removes a floor candidate from RN's bones. Shipping best was already clean at these moments
  (lane F: 0 of 36 trials hit), so the best this reaches is parity there, not "clearly better". RN
  still has to pay for landing it (below).

## What changed

| Commit (`claude/spike-rn-export-ios`, local, never pushed) | Change                                                                                                                                                                                           | Size    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| `b10897eda3d24bb12e1b3f32c80ad7c1972b061b`                 | `src/drawing/PictureCapture.tsx`: `composesInk(target)` is true on iOS when the capture exports a picture, so the ink PNG goes straight into the worker compose and a blank page has no SVG pass | +7/−5   |
| `ab548c167cd68e60c76f733b55f181efdec38c17` (tip)           | `tools/tests/native-physical-paper-capture.test.mjs`: iOS blank and coloring page compose the ink, never through an SVG image (both cases fail on `e19904a36`)                                   | +15/−10 |

On top of `e19904a36` (Save from frozen ink; the worklets export worker; Android blank-page skip;
probe stage lines). Total against RN best v2 `e703b8b79`: that commit's src +186/−70 and tests
+52/−26, plus the two above.

| Check (scratch export, rig.lock)                                       | Result                                                    |
| ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `npm run check`                                                        | exit 0                                                    |
| `npm run lint`                                                         | 0 errors, the same 3 warnings as RN best                  |
| 34 tool test files (capture, export, ink scan, Save, probe, placement) | 348 pass                                                  |
| 6 RSD files (Save flight, Save to Photos, toolbar, failure banner)     | 65 pass                                                   |
| Negative control                                                       | both new iOS cases fail on `e19904a36`'s `PictureCapture` |

| Build (probe Release, `art.splotch.app.dev.export`, Apple Development signing)                                  | Probe tag   | App binary sha256 | JS bundle (Hermes header source hash)                     |
| --------------------------------------------------------------------------------------------------------------- | ----------- | ----------------- | --------------------------------------------------------- |
| A, 08:33–08:36, installed 08:42 (new app; drawer expanded once; Pen, Purple, Size 3; Auto-Save off by default)  | `b10897eda` | `f636dd33…ca57`   | equals a bundle of `e19904a36`'s `PictureCapture` (base)  |
| B, 13:32–13:35 under rig.lock, reusing `ios-dd-best-rn`; installed over A at 13:37 (data and Photos grant kept) | `ab548c167` | `1d842365…1557`   | equals a bundle of the branch tip, checked before install |

## Pre-registered gate (copied verbatim from the orchestrator's brief, before any counted capture)

> Moments, delays and trial counts exactly as lane F ran them for RN (N, S, C; 100/300/700 ms; 3
> one-finger + 3 two-finger per delay; C with Auto-Save on Delete on), on the spike build only. Lane
> F's RN best numbers are the comparison; do not re-run RN best or shipping.
>
> 1. **Save loss:** pass if 0 of 27 S probe lines are lost (RN best: 27 of 27 lost).
> 2. **Late ink:** a line is late when its first dot or max `oldestToSubmission` is ≥ 100 ms above
>    this build's own N medians (lane F amendment 1). **Fixable** if 27 of 27 S lines and 27 of 27 C
>    lines are on time. **Unclear** if 1–3 lines in either set are late and the residual is named
>    and movable. **Floor evidence** if the heavy steps run off both the JS thread and the main
>    thread yet ≥ 4 lines in a set stay late because of work that must remain on the JS or main
>    thread (or Skia cannot run off-thread on iOS).
> 3. **Main thread:** report every UIKit touch-log gap ≥ 50 ms during S and C probes (RN best had
>    74–92 ms). Pass if none ≥ 50 ms.
> 4. **Fidelity:** a fixed scripted drawing's saved PNG matches RN best's export of the same drawing
>    within the tolerance `spike-rn-export.md` used. Report the numbers.
> 5. **Controls:** N controls and the warm control lines all ink; WDA pacing gate as in lane F.
>
> Report the worker's memory only if `ipad-memory.md`'s method is cheap and safe; otherwise mark it
> unmeasured. No Instruments unless you first confirm ≥ 12 GB free on the iPad.

### Amendments from the orchestrator (Codex round 4, received ~08:45 EST, before any counted capture)

1. Score symmetric with the Android spike: **fixable** on late ink = every S and C line on time at
   the 300 and 700 ms delays (18 of 18 each). The 100 ms delay is reported separately, with any late
   line there named; it does not decide the class.
2. Count trials hit as well as lines in every cell.
3. Add one moment, **O**: plain Clear with Auto-Save on Delete **off** (no export), at 100/300/700
   ms, same trial counts. It separates the Clear's own commit lateness from the export's.
4. Floor evidence is no longer automatic at ≥ 4 late lines. It needs a diagnosis of what holds the
   JS or main thread (hand-offs, React commits, allocation, scheduling) and a demonstrated tradeoff
   for removing it. Late lines without that diagnosis stay **unclear**, with the residual named.
5. Keep the 50 ms main-thread guard. Also report packet age within each stroke (not only the first
   dot), check the saved picture's content, and report worker memory if cheap.

Everything else stands, including the Photos-prompt stop rule.

### Lane amendments (method only, written ~08:50 EST, before any counted capture)

1. **Driver.** Lane F's `bin2/` scripts copied to `spike-rn-export-ios/bin/` and pointed at
   `art.splotch.app.dev.export` only (every other bundle ID refused). Changes: the bundle map;
   moment **O** runs C's steps (dense picture drawn on the previous trial's page, the 400 ms Clear
   drag as the busy contact, blank-page scoring reference) with Auto-Save off; the scorer treats O
   like C. Coordinates, waves, rest hold (delay − 5 ms, lane F amendment 7), screenshots and
   thresholds unchanged.
2. **Order.** N (with its warm controls) → O (Auto-Save off, as installed) → S → C (Auto-Save on,
   switched off after, both checked by screenshot). S and C need Photos add access, so a dry Save
   (not counted) comes first, before any counted capture, per the stop rule.
3. **Late reference.** This build's own N medians (`firstDotMs`, max `oldestToSubmission`), as the
   gate says. "Packet age within each stroke" (amendment 5) is reported as max `oldestToSubmission`
   (the oldest sample a hand-off carries) and the cohort's `longestGap`, with `receiptLag` p95 where
   os_log keeps it.
4. **Main-thread guard (item 3).** As lane F: the largest interval between consecutive touch-phase
   frames of the probe in the app's UIKit `EventDispatch` log. Also reported: the largest interval
   between any two frames (held touches log every 8.3 ms) from the busy contact's lift to the
   probe's lift, so a stall during the rest shows too.
5. **Fidelity (item 4).** One fixed scripted drawing on a cleared page: five Pen strokes (two
   horizontal, two vertical, one diagonal; straight, 100 ms holds at both ends) and two horizontal
   Crayon strokes, then Save. Twice in the spike, twice in RN best (`art.splotch.app.dev.best`, the
   reference the gate names; Save is a fidelity reference here, not a stall re-run), pulled from the
   iPad's DCIM over AFC. The Android spike's tolerance: same size; **AE 0 away from the strokes**
   (pixels more than 16 px from any pixel that differs from the paper by > 40 summed RGB in either
   picture); differences only where the ink is; ink present. Inside the ink, reported (not gated):
   differing pixels, max and mean channel difference, for spike vs RN best and for the same-build
   pairs (run-to-run floor).
6. **Content check (amendment 5).** Each Save's picture should hold the dense picture drawn before
   it and never the probe after it; checked on pictures pulled from a sample of S trials.
7. **Chord control** (lane F's X) is not re-run: it calibrated the shape metric, which is unchanged,
   and the gate does not list it.
8. **Fidelity ink mask (written 12:31 EST, before any fidelity capture).** Lane amendment 5's
   "differs from the paper by > 40 summed RGB" cannot work: the exported grain lifts dark paper from
   `#211f29` to a median of (50, 51, 60), so 97% of a nearly blank picture (IMG_0935, the second
   uncounted Save) reads as ink. Paper and grain sit within 40 of the picture's own per-channel
   median for 99.9% of pixels, with a thin tail to 60. So an ink pixel is one more than **60**
   summed RGB from its picture's own median colour; the 16 px margin, AE 0 and the rest stand.
9. **Build correction (written 13:36 EST, after the first counted set, before any capture of the
   corrected build).** The first counted set (N, O, S, C, 12:23–13:00) and the 13:18 profiler trace
   ran on a bundle **without** the iOS compose change. My negative-control test swapped the base
   commit's `PictureCapture.tsx` into the build source at 08:35:33, while Xcode's Metro step
   (08:33–08:35:52) was bundling. Proof: the installed Hermes bundle's header (magic, version, SHA-1
   source hash; bytes 1–32) is identical to a bundle compiled from `e19904a36`'s
   `PictureCapture.tsx` and differs from one compiled from `b10897eda`'s. That set is kept and
   reported as **configuration A**: Save from frozen ink plus the worker, with the ink still
   composed through react-native-svg on the main thread. That is `e19904a36` on iOS, and the
   fallback the brief named. The gate is scored on **configuration B**, the rebuilt bundle (source
   hash checked against `b10897eda` before install), with N, S and C re-run on it. O makes no export
   and touches no changed code, so A's O rows stand for B. Thresholds and methods are unchanged.

## Method as run (12:21 → 14:23 EST on the iPad)

* **Locks.** `dev-ipad.lock` 08:41–08:44 (install, dry Save), held with a BLOCKED owner line while
  the Photos prompt waited for the owner (08:43–12:21), then held for the run. `rig.lock` per timed
  batch, per build and per heavy host step, with a `rig.queue` waiting line while lane N ran on the
  Galaxy. Own WebDriverAgent on 127.0.0.1:5300; the borrowed Appium tunnel untouched.
* **Photos.** The owner allowed the prompt (~12:15). The uncounted Save before it landed as
  IMG_0934, and a second Save at 12:22 landed IMG_0935 with no prompt.
* **Trials** exactly as lane F's `bin2` (one WDA request: busy contact, rest on Purple held delay −
  5 ms, probe one finger or two in lockstep; warm control 1.4–1.6 s later; scoring screenshot), 6
  trials per moment and delay, one arm. Scoring by lane F's `score.mjs`; late per `summary2.mjs`
  against the build's own N medians.
* **Export stage lines** (`{"export":"start|ink|outline|composed"}`) are logged under category
  `SplotchPerf` without that word in the message, so lane F's log predicate missed them. From 12:45
  the collector also takes `category == "SplotchPerf"` (a superset; re-scoring S on it changed no
  number).
* **Build B's N** first landed in A's folder (macOS paths ignore case: `B1-N` is `b1-N`). It was
  split back by trial, and B's later folders use distinct names. A's N log was overwritten after A
  had been scored; A's numbers below come from that scoring.

## Positive controls

| Control                                         | A                                                       | B                                                       |
| ----------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| N: 3 one-finger + 3 two-finger trials (9 lines) | 9/9 inked, on-wave 1.00, delays 101 / 301–309 / 701–702 | 9/9 inked, on-wave 1.00, delays 101 / 301–302 / 701–702 |
| N medians (the "late" reference)                | first dot 14.5 ms, max `oldestToSubmission` 30.6 ms     | first dot 13.5 ms, max `oldestToSubmission` 31.8 ms     |
| WDA pacing gate (all probes)                    | 59 of 60 paced; 1 C-100 probe a burst (invalid)         | 60 of 60 paced (N, O, S, C)                             |
| Warm control lines                              | 60/60 inked                                             | 60/60 inked                                             |
| RN best's N (lane F, for reference)             | first dot 13 ms, max `oldestToSubmission` 26 ms         |                                                         |

## Results: build B (the gate)

Cell: trials hit of valid · lines lost/cut/chord/late. Late = first dot or max `oldestToSubmission`
≥ 100 ms above B's N medians. "lateBy" = the larger excess over the medians. Probe gap = largest
interval between the probe's touch frames (gate item 3). Rest+probe gap = the largest interval
between any two touch frames from the busy lift to the probe's lift.

| Moment               | Delay asked → achieved (ms) | Trials hit · lines | First dot (ms) | Max `oldestToSubmission` (ms) | `longestGap` (ms) | lateBy (ms) | Probe gap (ms) | Rest+probe gap (ms) |
| -------------------- | --------------------------- | ------------------ | -------------- | ----------------------------- | ----------------- | ----------- | -------------- | ------------------- |
| S: Save              | 100 → 100–109               | 0/6 · 0/0/0/0 of 9 | 8–16           | 16–25                         | 16–19             | −5 to 2     | 9–17           | 9–17                |
|                      | 300 → 300–301               | 0/6 · 0/0/0/0 of 9 | 8–13           | 12–20                         | 13–18             | −6 to 0     | 9–17           | 9–17                |
|                      | 700 → 700–701               | 0/6 · 0/0/0/0 of 9 | 7–13           | 32–43                         | 29–35             | 0 to 11     | 10–18          | 10–18               |
| C: auto-saving Clear | 100 → 100–108               | 0/6 · 0/0/0/0 of 9 | 21–34          | 27–34                         | 27–31             | 7 to 20     | 19–25          | 40–67               |
|                      | 300 → 300–301               | 0/6 · 0/0/0/0 of 9 | 20–32          | 20–32                         | 16–19             | 7 to 19     | 8–9            | 43–54               |
|                      | 700 → 700–701               | 0/6 · 0/0/0/0 of 9 | 17–25          | 19–29                         | 14–26             | 3 to 11     | 10–19          | 34–50               |
| O: plain Clear       | 100 → 100–110               | 0/6 · 0/0/0/0 of 9 | 23–32          | 26–53                         | 26–50             | 10 to 22    | 17–21          | 42–52               |
|                      | 300 → 301–302               | 0/6 · 0/0/0/0 of 9 | 30–39          | 30–39                         | 17–23             | 16 to 25    | 8–17           | 47–51               |
|                      | 700 → 701–710               | 0/6 · 0/0/0/0 of 9 | 31–61          | 31–61                         | 17–33             | 17 to 47    | 10–16          | 37–67               |

`receiptLag` p95, where os_log kept it: 5–6 ms (S), 6–9 ms (C). Every inked line was on the wave
(on-wave 1.00). The only hole ≥ 40 ms in any B trial is the Clear's own: 41–67 ms, starting 8–43 ms
after the Clear's release, before any probe began. A's plain Clear (O, no export) shows the same
hole, 44–85 ms at 17–43 ms, and B's own O shows 42–67 ms at 24–35 ms. It belongs to the Clear, not
the export. B's auto-saving Clear (lateBy 3–20 ms) costs no more than its plain Clear (10–47 ms), so
the export adds nothing measurable after a Clear. O on B was run as an extra; amendment 9 had let
A's O stand in.

**Export timing on B** (stage lines; device clock): ink encode on the worker 231–289 ms after the
export starts. `ink` → `outline` is 0 ms (no react-native-svg pass on a blank page). The compose on
the worker brings the total to 895–985 ms. Neither the JavaScript nor the main thread shows a gap
there.

## Results: configuration A (`e19904a36` on iOS: Save fix and worker, ink still composed by react-native-svg)

| Moment               | Delay asked → achieved (ms)              | Trials hit · lines                          | First dot (ms) | Max `oldestToSubmission` (ms) | lateBy (ms)   | Probe gap (ms) | Rest+probe gap (ms) |
| -------------------- | ---------------------------------------- | ------------------------------------------- | -------------- | ----------------------------- | ------------- | -------------- | ------------------- |
| O: plain Clear       | 100 → 100–118                            | 0/6 · 0/0/0/0 of 9                          | 23–47          | 28–47                         | 9 to 32       | 18–26          | 44–85               |
|                      | 300 → 301–309                            | 0/6 · 0/0/0/0 of 9                          | 26–43          | 26–43                         | 11 to 28      | 9–17           | 46–59               |
|                      | 700 → 701–702                            | 0/6 · 0/0/0/0 of 9                          | 31–44          | 31–44                         | 17 to 30      | 9–18           | 32–65               |
| S: Save              | 100 → 100–101                            | 0/6 · 0/0/0/0 of 9                          | 7–15           | 93–102                        | 62 to 71      | **83–84**      | 83–84               |
|                      | 300 → 301–376 (main thread held the log) | 0/6 · 0/0/0/0 of 9                          | 83–106         | 90–115                        | 68 to 92      | 15–81          | 66–83               |
|                      | 700 → 701–709                            | 0/6 · 0/0/0/0 of 9                          | 6–16           | 37–44                         | 6 to 14       | 10–17          | 67–83               |
| C: auto-saving Clear | 100 → 100–108                            | 0/5 valid · 0/0/0/0 of 7 (1 burst, invalid) | 21–58          | 106–110                       | 75 to 80      | **10–87**      | 84–87               |
|                      | 300 → 300–379                            | **4/6 · 0/0/0/6 late of 9**                 | 107–125        | 107–125                       | **92 to 110** | **15–87**      | 82–86               |
|                      | 700 → 693–701                            | 0/6 · 0/0/0/0 of 9                          | 17–25          | 21–29                         | 3 to 10       | 10–17          | 83–96               |

In every A export, one main-thread hole of 80–87 ms opens 2–5 ms after the `ink` stage line and
closes within 2 ms of the `outline` line. Late C-300 lines are probes that began inside it (lateBy ≈
the hole plus the Clear's own ~20 ms). Stages: ink encode 281–337 ms, `ink` → `outline` 80–89 ms,
compose 668–717 ms, total 1,053–1,118 ms.

## Diagnosis of A's hole (Instruments Time Profiler, uncounted)

All-process Time Profiler, 70 s, two Saves on build A (13:18; the iPad had 118 GB free, the host 177
GB; `rig.lock` held; trace 183 MB). Samples of the app between each Save's `ink` and `outline` lines
(±10 ms):

| Thread                                 | Save 1 (25.49–25.57 s)                                                                                                                                                                                                                                                      | Save 2 (50.39–50.48 s) |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| Main                                   | 94 samples (~1 ms each): 64 in `RNSVGSvgViewModule toDataURL` → `RNSVGSvgView getDataURLWithBounds` (PNG encode pulling a CoreGraphics draw of the ink image: `ripc_DrawImage` in ~40 samples, `deflate` in ~39, inclusive counts), 28 in Core Animation layout and display | 91: 62 in the same, 29 |
| JavaScript                             | 2 (idle run loop): waiting for the capture's callback                                                                                                                                                                                                                       | 1                      |
| Export worker (`splotch-export_queue`) | starts the compose right after the window                                                                                                                                                                                                                                   | same                   |

Only two `toDataURL` bursts in 70 s, one per Save. So A's hole is react-native-svg composing the ink
on the main thread, the step lane F named. That step is the one B removes. The Hermes bundle check
that exposed A (amendment 9) came from this trace: the code path it shows should not exist in the
intended build.

## RN best for comparison (lane F, `ipad-stall-ink.md`; not re-run)

| Moment               | RN best v2 (`e703b8b79`)                                                                                                   | Spike B                                  |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| S: Save              | 18/18 trials hit, 27/27 lines lost (the Save input lock); packets waited 0.27–0.62 s; main-thread hole 77–81 ms at ~0.29 s | 0/18 hit; 27/27 inked on time; no hole   |
| C: auto-saving Clear | 18/18 hit, 27/27 lines late by 0.34–0.77 s (export on the JavaScript thread); main-thread hole 67–92 ms at ~0.30–0.34 s    | 0/18 hit; 27/27 on time (lateBy ≤ 20 ms) |

RN best's holes were read from lane F's own logs with this lane's `winpos.mjs` (no new capture).

## Fidelity (item 4)

Fixed drawing (5 straight Pen strokes, 2 straight Crayon strokes, cleared page, then Save), pulled
over AFC. Size 2564 × 1984 in every case.

| Pair                                   | Away from ink (4.56 M px): AE · max Δ | Near ink (~525 k px): differing · max Δ · mean Δ | Ink pixels (A / B side) |
| -------------------------------------- | ------------------------------------- | ------------------------------------------------ | ----------------------- |
| B vs RN best (4 pairs)                 | **0 · 0**                             | 129,536–129,911 · 107 · 3.13                     | 160.8 k / 176.1 k       |
| B vs B (run-to-run)                    | 0 · 0                                 | 3,801 · 32 · 0.02                                | 160.8 k / 160.8 k       |
| RN best vs RN best (run-to-run)        | 0 · 0                                 | 9,220 · 20 · 0.04                                | 176.1 k / 176.1 k       |
| A vs RN best (4 pairs; same SVG route) | 0 · 0                                 | 5,282–12,884 · 20 · 0.02–0.05                    | 176.1 k / 176.1 k       |

By the registered tolerance (same size, AE 0 away from the strokes, differences only at the ink, ink
present) B **passes**. Inside the ink, B differs from RN best systematically, not by run-to-run
noise. Crops at 4× show why: RN best's (and A's) export draws a dark 1–2 px fringe along every
stroke edge, which the react-native-svg route adds. B's edges are clean, like the on-screen ink in
both apps' pre-Save screenshots (`look/fid-pen-RB.png`, `look/fid-pen-screens.png` in the scratch
folder). The fringe pixels are B's 8.7% "missing" ink.

## Saved picture content (amendment 5)

All 18 of B's Save pictures (IMG_0989–0999, IMG_1001–1007): 2564 × 1984; the dense picture's band
holds 193,444–193,464 ink pixels, and the probe and control bands 0. Each Save keeps the ink drawn
before it and never the stroke after it. Positive control: B's auto-saved Clear pictures IMG_1009
and IMG_1010 carry the previous trial's waves (17,273–17,287 ink pixels per band).

## Worker memory (`ipad-memory.md`'s sampler, cheap: sysmontap, no Instruments)

Cold launch (a fresh process has no worker runtime), a dense picture, 30 s idle, then 7 auto-saving
Clears ~13 s apart on fresh dense pictures, then 30 s idle. `phys_footprint` of the app every 2 s.

| Build | Before any export      | Peak during exports | 20–30 s after the last export (page cleared) |
| ----- | ---------------------- | ------------------- | -------------------------------------------- |
| A     | 236 MB, 13 threads     | 428 MB              | 336 MB, 18 threads                           |
| B     | 244–250 MB, 12 threads | 365 MB              | 332 MB, 17 threads                           |

The worker's own share is not separable from the Photos save and the picture strings: after the
exports the process keeps ~5 more threads and ~85 MB more footprint than before the first one (B).
B's peak is 63 MB below A's (no react-native-svg bitmap). No memory warning in the samples; the app
process survived every export (45 on B, 53 on A).

## Verdicts against the pre-registered gate (build B)

| Item           | Line                                                                                  | Result                                                                                                                           | Verdict                   |
| -------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1. Save loss   | 0 of 27 S lines lost                                                                  | 0 of 27 (RN best 27 of 27)                                                                                                       | **pass**                  |
| 2. Late ink    | fixable: 18/18 S and 18/18 C on time at 300 and 700 ms (amendment 1); 100 ms reported | S 18/18, C 18/18; at 100 ms S 9/9 and C 9/9; worst lateBy 20 ms                                                                  | **fixable**               |
| 3. Main thread | no UIKit touch-log gap ≥ 50 ms during S and C probes                                  | worst probe gap 25 ms. Outside the probes: the Clear's own 41–67 ms hole, over by 94 ms after release, also there without export | **pass**                  |
| 4. Fidelity    | Android spike tolerance                                                               | AE 0 away from the ink; ink differs by RN best's edge fringe (above)                                                             | **pass**, caveat reported |
| 5. Controls    | N and warm controls ink; pacing gate                                                  | all inked; all B probes paced                                                                                                    | **pass**                  |
| Memory         | if cheap and safe                                                                     | measured, above                                                                                                                  | –                         |

**Class: fixable.** Configuration A, scored the same way, would have been **unclear**: 6 late lines
at C-300, with the residual named (react-native-svg on the main thread) and shown movable by B.

## The residual and its price

| Item                                                                                                                     | Status                                                                                  | Agent-days                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------- |
| iOS ink compose in Skia on the worker (this spike)                                                                       | done in 7 lines plus tests; production landing needs review and the coloring-page check | 0.25                      |
| Coloring pages: line art still captured by react-native-svg (draw + PNG encode) on the main thread on iOS, as on Android | not measured here (blank pages only); the same Skia outline item as Android's           | 0.5 (shared with Android) |
| The Clear's own main-thread hole (41–85 ms, 8–43 ms after release; no export involved)                                   | unchanged; strokes 0.1 s after a Clear were still on time here (lateBy ≤ 32 ms)         | not priced                |
| Export memory: ~85 MB and ~5 threads stay after a burst of exports                                                       | unexplained; not compared with RN best in the same state                                | unclear                   |
| `spike-rn-export.md`'s other items: (a) Save from frozen ink 0.5; (b) worker 1; the named residual 0.5                   | (a) and the worker now also hold on the iPad                                            | 2                         |

The iPad line in `spike-rn-export.md` (0.5–1 day) drops to ~0.25 day. Export off the input path,
both platforms: about **2.25–2.75 agent-days** to land.

## Not measured

* Coloring pages, light paper, Apple Pencil, delays past 0.7 s, the U and R moments.
* RN best and shipping not re-run (lane F's numbers are the comparison). Shipping's first-ink
  lateness remains untimed on the iPad.
* The worker runtime's own memory apart from the process total; a long session of exports.
* Whether the fringe in RN best's iOS export is visible to the owner at normal size (it is a 1–2 px
  edge on a 2× picture).

## Could this flip the decision?

No. It removes a reason against RN's bones on the most heavily weighted device: the export stall
after Save and an auto-saving Clear is movable work on iOS too. It was not a floor, and the fix was
7 lines on top of the Android spike. It does not make RN clearly better for users there. Shipping
best already showed 0 of 36 trials hit after Save and Clear on the iPad, so the most this reaches is
parity on these moments once ~2.5 agent-days of export work land.

## State left behind

* **The iPad**, held 08:41–08:44 and 12:21–14:23 under `dev-ipad.lock` (BLOCKED in between, with the
  prompt up). Never locked, no reboot, no settings changed, no prompt answered by the lane. Free
  space 118.7 GB.
* **`art.splotch.app.dev.export`** = build B (tag `ab548c167`): page cleared, Pen, Purple, Size 3,
  tool drawer open, Auto-Save on Delete **off** (on only for the C and memory runs; screenshots of
  each switch in `r/c-setup/`), Photos add access (granted by the owner).
* **`art.splotch.app.dev.best`**: drew and saved the fixed fidelity drawing twice. Its page is
  cleared, Pen selected, Auto-Save off (looked at, never toggled). The store app, `.dev`,
  `.baseline.*`, `.spike` and shipping best were not touched.
* **Photos**: 100 new pictures, IMG_0934–IMG_1034 (IMG_1000 does not exist). 98 are from
  `.dev.export` and 2 from `.dev.best` (IMG_0986, IMG_0988). Nothing deleted. No crash reports.
* **Branch** `claude/spike-rn-export-ios` @ `ab548c167cd68e60c76f733b55f181efdec38c17`, local, never
  pushed. The worktree I created first was removed: this session's hook refuses edits in a second
  worktree, so the branch was edited in a scratch export and committed through a temporary index, as
  `spike-rn-export` was.
* **Scratch** (`spike-rn-export-ios/`, 4.3 GB, 4 GB of it the source export with pnpm-linked deps
  and Pods): scripts in `bin/`, scored batches in `r/` (score.json, gzipped log extracts, marks),
  pulled pictures in `pics/` and `r/fid/`, key frames in `look/` and `keep/`. Trial screenshots and
  the profiler traces were deleted once scored. Builds A and B in `builds/spike-rn-export-ios/`.
