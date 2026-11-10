# Galaxy brushes, first strokes and instrument calibration

2026-11-10, Claude. Device: the Galaxy (S21 FE, Android 16, 120 Hz). Arms, both Release: RN =
`art.splotch.app.dev` with the **plain** RN Release swapped in (probe compiled out, APK sha256
`371533dd…`, RN source 427756f14); shipping = `art.splotch.app.baseline.main` (APK sha256
`df2529e2…`, shipping source ef3d1eb20). The RN probe build is restored at the end. Raw media,
scripts and logs: `perf-galaxy-brushes/` in the campaign scratch folder (rig file).

Closes three gaps that `perf.md` left (Pen only, `gfxinfo` never calibrated, first strokes only
after a cold launch), plus two orchestrator additions from Codex's review (long Crayon/Magic memory,
Clear right after an Eraser lift).

## Pre-registered decision numbers (written 2026-11-10 04:50 EST, before any capture)

Same rule as `perf.md`: a difference inside the margin is a **tie**, a tie goes to shipping, and
"not measured" is not "equal". Three runs per cell, interleaved S R R S S R unless stated.

**Input.** One OS input path for both arms: a virtual touchscreen registered through Android's
`uinput` shell tool (kernel evdev → InputReader → the app, the same path a finger takes), driven by
pre-generated scripts whose delays run on the device, so stroke timing never depends on host or
`adb` process start-up. Fallback if `uinput` cannot be made to work: `adb shell input swipe`, as in
`perf.md`.

**Settings, both arms, checked by screenshot before measuring:** light, portrait, Sound on at 50%,
default purple, stroke width Size 3 (`medium`, the shipped default), no coloring page, Auto-Save on
Delete **off** (the default).

### 1. Calibration (Pen, the dense-scribble script below)

| Step                                                                                    | Pass / reading                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0 witness control: two deliberate 150 ms still-finger holds mid-stroke, no load, 1/arm | The video witness reports a no-new-ink interval of 150 ± 25 ms at each hold. Otherwise the witness is not trusted and only `gfxinfo` is reported                                                                                                                                                                                    |
| C1 baseline, no load, 1/arm; C2 CPU contention (busy loops on the device), 2/arm        | The stall is "known" only if the video shows it: C2's longest in-contact no-new-ink interval or count of ≥50 ms intervals clearly exceeds C1's in that arm                                                                                                                                                                          |
| `gfxinfo` catches the stall if                                                          | janky share under load ≥2× and ≥+1 pt over C1 **and**, wherever the video shows a ≥100 ms stall, `gfxinfo` records ≥1 frame ≥50 ms. **Misses** it if the video shows ≥100 ms stalls with no ≥50 ms frame and <1 pt janky rise. A miss in either arm weakens `perf.md`'s Galaxy tie: the video witness then outranks `gfxinfo` below |

### 2. Dense Crayon and dense Magic brush (3 runs per arm per brush)

Workload: cleared page, ten 2 s continuous zigzag strokes (random-direction segments of 150–600 px
at ~2,000 px/s, 8 ms samples, 60 ms lifts), ~20.6 s, filling the paper. `gfxinfo` reset 3 s after
Clear; screen recorded throughout.

| Metric                                                             | RN wins if                                                   | RN loses if                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `gfxinfo` janky share, median of 3                                 | ≥0.5 pt lower, ranges not overlapping, p99 not worse         | ≥0.5 pt higher (ranges not overlapping) **or** p99 ≥8.3 ms worse in the median    |
| Frames ≥50 ms (`gfxinfo` histogram)                                | shipping has ≥1 in ≥2 of 3 runs, RN in none                  | RN has ≥1 in ≥2 of 3 runs, shipping in none                                       |
| Video: longest in-contact interval with no new ink                 | shipping ≥100 ms in ≥2 of 3 runs, RN in none (a visible win) | RN ≥100 ms in ≥2 of 3 runs, shipping in none (**major** defect for RN)            |
| Ink delivered (paper pixels changed by the end, workload validity) | —                                                            | an arm drawing <90% of the other's ink invalidates the pair (not scored as a win) |

A `gfxinfo`-only difference is a presentation-counter result, not "clearly better for users" (same
guardrail as `perf.md`).

### 3. First strokes by kind (Pen, 5 attempts per arm per kind, every attempt kept)

Kinds: **cold** (`am start -S -W`, 3.5 s wait, as `perf.md`), **post-Clear** (Clear drag released,
then the stroke 300 ms later), **post-Settings** (gear tap, 1.5 s, Close tap, then the stroke 300 ms
later). Each attempt is one on-device script: stroke A (the first stroke, 600 ms horizontal), 1.5 s,
stroke B (identical warm reference), so A→B onset spacing is exact.

| Reading                                                                                                                                | Threshold                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Time to first visible ink, as **delay versus the arm's own warm stroke** (Δ = onset A − onset B + 2,100 ms; video, ±8 ms quantization) | **major** if Δ >100 ms in ≥2 of 5 attempts of a kind; minor if median Δ is 30–100 ms                           |
| Hold: longest no-growth interval inside stroke A                                                                                       | **major** if >100 ms in ≥2 of 5 attempts of a kind (`perf.md`'s first-stroke rule); **blocker** if A loses ink |
| Arm comparison                                                                                                                         | a kind counts against an arm only if that arm crosses a line above and the other does not                      |

Absolute touch-to-photon latency is **not** measurable here (no camera, no touch-time marker in the
recording); Δ isolates the first-stroke penalty, which is what the iPad defect was.

### 4. Orchestrator additions

| Workload                                                                                                                                                                                                                                                 | Pre-registered numbers                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Long-session memory:** cold launch, Clear, ~5 min dense Crayon then ~5 min dense Magic (the scribble script, 0.5 s lifts), 3 Undos every ~60 s, 20 s idle; TOTAL PSS before, every ~60 s, after (shipping = app + its WebView renderer). 1 run per arm | **Guardrail fails** if RN's end − start growth is >2× shipping's. Also flag (`perf.md` rule) if RN ends ≥1.5× shipping **and** >400 MB                                                                             |
| **Clear right after an Eraser lift** (Auto-Save off): two Pen strokes, Eraser, erase across one, lift, tap Purple (back to Pen), Clear drag released 0.5–1.0 s after the lift, then a stroke 0.1–1.0 s after the release. 10 tries per arm, alternating  | Every stroke must land and the Clear must have cleared. **Major** if ≥2 of 10 strokes are lost (default setting, ordinary sequence); 1 of 10 = rerun 10 more (second and last attempt) and report the pooled count |

## Method notes from the pilot (before any scored run; thresholds unchanged)

* **`uinput` works and is exact.** A virtual touchscreen ("Splotch perf touch") maps 1:1 onto the
  display; `getevent` shows samples every 8.08 ms median (max 9.0 ms) with no load. The tool sends
  the first injected event as soon as the device opens, ahead of the delay before it, so every
  script starts with a no-op SYN (first pilot: a 1.5 s still contact before the first stroke). Every
  scored run records the device's own input timestamps (`getevent -t`), so injector fidelity is
  measured, not assumed.
* **Overdraw hides ink from the video witness.** Random scribbles retrace their own ink, and new Pen
  ink over the same purple changes no pixel. The video stall metric is therefore scored only over
  **fresh paper**: from the logged input positions, the time the finger spent crossing paper with no
  ink from ≥100 ms earlier, inside each interval between frames with new ink ("fresh-paper travel
  with no new ink"). The raw in-contact gap is still reported. The input timeline is fitted to the
  ink timeline across all strokes (a first-stroke-only alignment leaked RN's first-stroke delay into
  every later lift).
* **CPU load level.** The pilot's 8 busy loops (`sh` spin loops started from `adb shell`, nice 0)
  halved shipping's frame rate (51.6% janky, video at 16 ms per frame) without any ≥100 ms freeze.
  C2 therefore runs one arm-pair at 8 loops and one at 24 to look for a freeze.

## Results

### 1. Calibration: `gfxinfo` catches a CPU-contention stall in both arms

Pen, dense-scribble script (same seed in every run), one rig-locked window, order S R | R S | S R |
R S. Load = spin loops started from `adb shell` (nice 0) for the whole run, killed after it (0 left
behind, checked per run). "Fresh-paper stall" = finger crossing un-inked paper with no new ink on
screen.

| Run (load)         | Frames | Janky % | p90/p99 ms | Frames ≥50 ms (worst bucket) | Longest fresh-paper stall, ms | Fresh-paper stalls ≥50 ms | Video frame interval p50, ms | Input max gap, ms |
| ------------------ | ------ | ------- | ---------- | ---------------------------- | ----------------------------- | ------------------------- | ---------------------------- | ----------------- |
| Shipping C1 (none) | 2,549  | 1.92    | 12/16      | 0 (38)                       | 24                            | 0                         | 8.4                          | 9.7               |
| Shipping C2a (8)   | 1,320  | 57.73   | 34/48      | 12 (300)                     | **304**                       | 2                         | 16.5                         | 28.3              |
| Shipping C2b (24)  | 1,061  | 71.25   | 44/73      | 54 (105)                     | 80                            | 8                         | 17.0                         | 35.8              |
| RN C1 (none)       | 2,583  | 0.89    | 10/15      | 0 (36)                       | 32                            | 0                         | 8.4                          | 11.7              |
| RN C2a (8)         | 1,515  | 45.48   | 30/46      | 10 (200)                     | **128**                       | 24                        | 9.4                          | 30.9              |
| RN C2b (24)        | 1,356  | 50.15   | 32/57      | 24 (350)                     | **392**                       | 31                        | 13.8                         | 44.3              |

* **C0 witness control (two 150 ms still-finger holds, no load):** RN read 159 and 150 ms; shipping
  read 176 ms and 168 ms (split 50 + 118 by one late frame), each at the scripted time. Expected
  ≈158 ms (the hold plus one 8 ms sample). The witness finds a 150 ms ink pause in both arms but can
  over-read by up to ~26 ms; shipping's 176 ms is 1 ms past the pre-registered ±25 ms. `gfxinfo`
  showed nothing for the holds (RN: 0 frames ≥50 ms), as expected: a pause draws no late frame.
* **Verdict by the pre-registered rule: `gfxinfo` catches it.** Under load janky share rose 30–56×
  in both arms (≥2× and ≥+1 pt), and every run whose video showed a ≥100 ms stall also logged frames
  ≥50 ms (worst buckets 200–350 ms). The injector itself stayed within 28–44 ms per sample, far
  shorter than the 128–392 ms stalls, so these are app stalls, not missing input. So the `perf.md`
  Galaxy tie is **not** weakened by a blind counter for this kind of stall.
* **Limit (new):** `gfxinfo` counts late frames, not missing ones. A stall where the app draws no
  frame at all — a still finger, or a stroke the app drops — never reaches it. The Eraser→Clear loss
  below is exactly that kind, and only the video and the input log catch it.
* Not a pre-registered metric, but visible: under the same load RN's longest stall (392 ms) exceeded
  shipping's (304, 80), while shipping lost more frames overall. Both are far outside ordinary use.

### 2. Dense Crayon and dense Magic: tie

Two rig-locked windows (Crayon, then Magic), S R R S S R, seeds 1–3 shared by both arms, cold launch
and brush chosen before each run. Both arms drew the same picture each time (ink pixels within 6%
per seed for Crayon, 1% for Magic, above the 90% validity line; `runs/crayon-1-posts.png`,
`runs/magic-1-posts.png`).

| Brush  | Arm      | Janky % (3 runs) → median   | p99 ms     | Frames ≥50 ms | Longest fresh-paper stall, ms | Raw in-contact no-new-ink, ms |
| ------ | -------- | --------------------------- | ---------- | ------------- | ----------------------------- | ----------------------------- |
| Crayon | Shipping | 1.53, 1.84, 1.54 → **1.54** | 15, 16, 16 | 0, 0, 0       | 24, 24, 24                    | 26, 26, 26                    |
| Crayon | RN       | 1.06, 1.28, 1.41 → **1.28** | 14, 14, 15 | 0, 0, 0       | 32, 32, 32                    | 82, 56, 34                    |
| Magic  | Shipping | 2.10, 1.76, 1.78 → **1.78** | 16, 16, 16 | 0, 0, 0       | 40, 24, 16                    | 51, 31, 25                    |
| Magic  | RN       | 1.25, 1.44, 1.41 → **1.41** | 15, 14, 15 | 0, 0, 0       | 32, 32, 48                    | 55, 38, 43                    |

* **Verdict: tie on every pre-registered line.** RN's janky share is lower in every run (ranges do
  not overlap), but by 0.26 pt (Crayon) and 0.37 pt (Magic), under the 0.5 pt margin. No frame ≥50
  ms and no fresh-paper stall ≥50 ms in any run of either arm. Video ran at 8.3–8.4 ms per frame
  throughout; input stayed within 9.6–12.0 ms per sample.
* RN's longer raw gaps (up to 82 ms) fall where the finger retraces its own ink: shipping's crayon
  texture keeps changing pixels on overdraw, RN's does not. Not a stall (the fresh-paper metric is
  flat), but a visible rendering difference worth knowing.
* Observed, not scored: the two arms' Magic rainbows run in a different phase on the same strokes
  (shipping starts purple at the top of the paper, RN green). Cosmetic; the visual lane owns parity.

### 3. First strokes by kind: RN drops the first stroke after Settings

Three rig-locked windows, S R R S S R R S S R, Pen selected once per arm before each window (it
persists). Every attempt kept. Δ = first visible ink of stroke A minus that of the warm stroke B,
corrected for their exact on-device spacing (2,106–2,109 ms by `getevent`): the first stroke's extra
delay over the arm's own steady touch-to-ink time. "Δ at x = 500" compares when the line front
reaches the same point ~200 ms into the stroke.

| Kind                                | Arm      | Δ first ink, ms (5 attempts) → median | Δ at x = 500, ms   | Longest hold in A, ms | A lost       |
| ----------------------------------- | -------- | ------------------------------------- | ------------------ | --------------------- | ------------ |
| Cold launch (+3.5 s)                | Shipping | 25, 23, 19, 22, 25 → **23**           | 15, 29, 23, 14, 14 | 17–18                 | 0/5          |
| Cold launch (+3.5 s)                | RN       | 55, 64, 31, 37, 47 → **47**           | 7, 17, 1, 7, 5     | 18–33                 | 0/5          |
| Clear released, +300 ms             | Shipping | 14, 5, 12, −5, −1 → **5**             | 14, 17, 16, 16, 9  | 10–18                 | 0/5          |
| Clear released, +300 ms             | RN       | 30, 22, 45, 15, 31 → **30**           | 0, −9, −1, −6, 20  | 24–34                 | 0/5          |
| Settings closed (tap ×), +300 ms    | Shipping | −9, −3, −10, −10, 12 → **−9**         | −2, 0, −6, 0, 8    | 16–18                 | 0/5          |
| Settings closed (tap ×), +300 ms    | RN       | —                                     | —                  | —                     | **5/5 lost** |
| *Supplementary:* cold launch, Magic | Shipping | 34, 32, 33, 26, 23 → 32               | 14, 13, 7, 15, −1  | 12–22                 | 0/5          |
| *Supplementary:* cold launch, Magic | RN       | 30, 62, 50, 28, 46 → 46               | 8, −11, −3, 16, 5  | 26–33                 | 0/5          |

* **RN loses the first stroke after leaving Settings, 5 of 5.** The sheet has visibly closed by the
  time the stroke starts (recording: bare paper), yet the 600 ms stroke draws nothing at all, and
  the next stroke 1.5 s later draws normally (its own longest hold 42–58 ms, against RN's usual
  ~25). Shipping drew every one. By the pre-registered rule ("blocker if A loses ink") this is a
  **blocker-class** first-stroke defect, RN only. How long the window lasts is in the probe below.
* **No hold over 100 ms in any kind, either arm** (longest 34 ms), and no lost ink outside the
  Settings case.
* **RN's first ink arrives later, then catches up.** Cold: median 47 ms extra versus shipping's 23;
  post-Clear: 30 versus 5. By x = 500 RN's line front is level with its warm stroke (Δ −9…+20 ms),
  so a child sees the first dot ~25–40 ms later than in shipping, not a slower line. By the
  pre-registered line RN's cold and post-Clear first strokes are **minor** (median 30–100 ms);
  shipping's are below it. The supplementary Magic set (run by mistake before Pen was re-selected,
  kept rather than discarded) agrees: RN 46 vs shipping 32 ms.
* Absolute touch-to-ink time is not measured (no touch marker in the recording).

**Settings window probe (functional, RN only, 2 tries per delay, stroke start after the × tap's
release):** 300 ms 0/5 drew; 500, 800, 1,200 and 2,000 ms 8/8 drew. So the dead window ends between
0.3 and 0.5 s after Settings closes. Mechanism pointer: the paper stays `paperBlocked` while the
modal route is still `shown` (`isProductModalBlocked(route.shown, …)` in
`src/rsdDrawing/RsdDrawingScreen.tsx`), and `useModalPresence` keeps a leaving sheet `shown` until
its exit has played; a contact that starts while the paper is blocked is `ignored` for its whole
life (`src/drawing/paperInputOwner.ts`). The exposure is narrow (a stroke inside ~0.3–0.5 s of
closing Settings), which is why I would rate it **major in practice** even though the pre-registered
first-stroke rule calls lost ink a blocker.

### 4a. Long-session memory (Crayon then Magic, Undo ×3 every minute)

1 run per arm as pre-registered, plus a second RN run (below). `uinput` script `memory`: Brushes ›
Crayon, 5 min of the dense scribble (2 s strokes, 0.5 s lifts), Undo ×3 every 60 s, Brushes › Magic,
5 min more, 20 s idle. TOTAL PSS from `dumpsys meminfo` every ~58 s; shipping = app + its WebView
renderer. MB = kB/1024. "Before" is on blank paper after a cold launch and Clear.

| Sample                           | Shipping  | RN run 1   | RN run 2   |
| -------------------------------- | --------- | ---------- | ---------- |
| Before                           | 274.8     | 264.2      | 267.7      |
| ~1 min                           | 327.1     | 369.4      | 361.9      |
| ~2 min                           | 347.1     | 513.8      | 551.3      |
| ~3 min                           | 349.8     | 522.8      | 545.9      |
| ~4 min                           | 350.1     | 565.9      | 565.0      |
| ~5 min (end of Crayon)           | 352.7     | 577.1      | 572.8      |
| ~6 min                           | 358.1     | 584.6      | 548.4      |
| ~7 min                           | 358.9     | 573.5      | 530.6      |
| ~8 min                           | 361.7     | 561.7      | 542.3      |
| ~9 min                           | 364.3     | 559.4      | 548.4      |
| ~10 min                          | 366.3     | 557.4      | 558.5      |
| ~10.7 min (after the last Undos) | 341.9     | 538.1      | **752.6**  |
| +20 s idle                       | 341.8     | 522.3      | **745.8**  |
| **Growth, end − start**          | **+67.0** | **+258.1** | **+478.1** |

* **Guardrail fails: RN grows 3.9× and 7.1× shipping's growth (limit 2×).** On the matched Crayon
  phase alone (start → 5 min, identical script in both arms) RN grows +312.9 / +305.1 MB against
  shipping's +77.9 (3.9–4.0×). RN also ends ≥1.5× shipping and above 400 MB in both runs (522 and
  746 vs 342), so `perf.md`'s memory line trips too.
* **Where it goes:** native heap, 45–55 → 275–288 MB within the first two minutes of dense Crayon
  (it was already +67–77 MB at ~1 min, before the first Undo), and run 2's last Undo burst added
  ~190 MB more (native 223 → 406 MB). Shipping's native heap is flat (32–33 MB); its growth splits
  between the app (+32 MB, 9 of it graphics) and the WebView renderer (+36 MB). This matches the
  guardrail spike's Undo mechanism (each Undo's ~8.7 MB layer raster held until a Hermes GC) but
  shows Crayon drawing alone also grows RN's native heap.
* **Not matched for Magic:** in both RN runs the switch to Magic did not take (the picture and the
  brush icon stayed Crayon), so RN's second half is more Crayon; shipping's switched. Run 2 waited
  2.0 s after the third Undo before tapping Brushes (run 1: 0.4 s); neither worked. RN's Magic-phase
  memory is **unmeasured**. The cause is the next defect.
* `gfxinfo` over the whole 10 minutes: shipping 0.88% janky, p99 16 ms, 9 frames ≥50 ms (worst
  bucket 65 ms); RN 0.65%, p99 11 ms, 0 frames ≥50 ms.

**Undo on a dense Crayon picture (RN, major).** A focused check (`undo-switch`: ~40 s of dense
Crayon, Undo ×3 at 400 ms spacing, Brushes 2.0 s later, Magic, a probe stroke; one run per arm,
recorded): shipping showed each Undo 39–63 ms after its tap; **RN showed them 604, 679 and 752–854
ms after their taps**, queued one behind another. The Magic switch worked in both on this smaller
picture. On the 5-minute picture the same switch was dropped in both RN runs, so RN's Undo cost
grows with the picture and the chrome ignores taps while it runs. `gfxinfo` cannot see this (no
frame is late; the screen simply does not change), which is why J25's RN Undo burst read "worst
frame 21 ms" while Undo was slow.

### 4b. Clear right after an Eraser lift (Auto-Save off) — RN **major** defect

`uinput` scripts `eraser-clear-<n>`: two Pen strokes, Brushes › Eraser, a vertical erase across
both, lift, Purple tapped 100 ms later (back to Pen), Clear drag (300 ms) released at the time
shown, then a 300 ms stroke at y = 1300. Times are from the device's own input timestamps
(`getevent`). Landing and clearing read from the screenshot 1.5 s later and the recording; tries
alternated R S / S R.

| Try | Clear released after the Eraser lift (ms) | Stroke started after Clear (ms) | RN: Clear              | RN: stroke | Shipping: Clear | Shipping: stroke |
| --- | ----------------------------------------- | ------------------------------- | ---------------------- | ---------- | --------------- | ---------------- |
| 1   | 497                                       | 99                              | **failed, error card** | **lost**   | cleared         | landed           |
| 2   | 596                                       | 201                             | **failed, error card** | **lost**   | cleared         | landed           |
| 3   | 696                                       | 301                             | **failed, error card** | landed     | cleared         | landed           |
| 4   | 796                                       | 400                             | cleared                | **lost**   | cleared         | landed           |
| 5   | 896                                       | 501                             | cleared                | **lost**   | cleared         | landed           |
| 6   | 996                                       | 601                             | cleared                | **lost**   | cleared         | landed           |
| 7   | 547                                       | 700                             | **failed, error card** | landed     | cleared         | landed           |
| 8   | 646                                       | 800                             | **failed, error card** | landed     | cleared         | landed           |
| 9   | 746                                       | 901                             | **failed, error card** | landed     | cleared         | landed           |
| 10  | 846                                       | 1001                            | cleared                | **lost**   | cleared         | landed           |

* **RN: 6 of 10 strokes lost and 6 of 10 Clears failed; every try hit one or the other.** Shipping
  10/10 clean. Pre-registered line (≥2 of 10 lost) → **major**, RN only, with the default Auto-Save
  off. A pilot try the same way (Clear 846 ms after the lift, stroke 1,000 ms after Clear) also lost
  its stroke.
* **What a child sees.** Clear released ≤750 ms after the lift: the paper starts sliding away, the
  drawing comes back, and a card says "Something went wrong — A picture observation is still
  settling." (`raw/rn-eraser-clear-error-card.png`). Released ≥800 ms after: the page clears, but a
  stroke started up to a full second later never draws (the recording shows no ink at all on its
  row, not ink drawn then wiped).
* **Mechanism pointer.** After an Eraser lift RN does not know whether the page is blank until its
  idle scan (`EMPTY_SCAN_IDLE_MS` = 400 ms, then a capture and PNG decode) answers, so Clear takes
  the waiting path under `lockInput` (`clearCurrentPicture`, `src/useDrawingScreen.ts`); a stroke
  that starts under the lock is ignored for its whole life. And Clear's observation and the idle
  scan's share one module-scope `createPngAlphaDecoder()` (`src/drawing/inkCoverage.ts`), so a Clear
  that lands while the scan's decode is still running throws "A picture observation is still
  settling." — despite `drawingScan.ts` saying the scan uses its own observer "so it never holds
  Clear's". The code is shared with iOS, so the iPad very likely has the same defect (not run
  there).

## Defects found

| Defect                                                                                                                                                                                                               | Arm | Severity                                                                               | Evidence                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| First stroke ~0.3 s after closing Settings draws nothing (5/5; fine from 0.5 s)                                                                                                                                      | RN  | **blocker** by the pre-registered first-stroke rule; major in practice (window <0.5 s) | `runs/first-settings-rn-*`, `runs/first-settings{500,800,1200,2000}-rn-*` |
| Clear within ~1 s of an Eraser lift (Auto-Save off): Clear fails with "Something went wrong — A picture observation is still settling" (6/10), or clears and drops the next stroke for up to 1 s (6/10 strokes lost) | RN  | **major**                                                                              | `runs/er-rn-*`, `raw/eraser-clear.json`                                   |
| Long Crayon session memory: +258 / +478 MB vs shipping +67 (3.9–7.1×; guardrail 2×), native heap                                                                                                                     | RN  | **major** (guardrail fail)                                                             | `runs/mem-rn`, `runs/mem2-rn`, `runs/mem-ship`                            |
| Undo on a dense Crayon picture shows 0.6–0.85 s after each tap (shipping 40–60 ms); after 5 min a brush tap 2 s later is dropped                                                                                     | RN  | **major**                                                                              | `runs/undoswitch-*`, `runs/mem*-rn/end.png`                               |
| First visible ink 30–47 ms (median) later than a warm stroke after cold launch / Clear (shipping 5–23 ms); line catches up by ~200 ms                                                                                | RN  | minor                                                                                  | `runs/first-{cold,clear}-*`                                               |
| Crayon overdraw does not deepen the texture as shipping's does; Magic rainbow phase differs from shipping                                                                                                            | RN  | cosmetic (parity, not scored)                                                          | `runs/{crayon,magic}-1-posts.png`                                         |

No shipping defect was found in this lane: every shipping stroke landed, every Clear cleared, no
hold over 34 ms, no fresh-paper stall over 40 ms without load.

## Verdict

| Question (pre-registered)                         | Result                                                                                                                                              |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does `gfxinfo` catch a known stall?               | **Yes, in both arms**, for stalls made of late frames (CPU contention). It is blind to absent frames (dropped strokes, a slow Undo, a still finger) |
| Dense Crayon                                      | **Tie** (RN −0.26 pt janky, under the 0.5 pt margin; no ≥50 ms frame or visible stall in either)                                                    |
| Dense Magic                                       | **Tie** (RN −0.37 pt; same)                                                                                                                         |
| First strokes: cold / post-Clear / post-Settings  | Cold and post-Clear: no hold, RN minor (+25–40 ms first dot). Post-Settings: **RN loses the stroke 5/5**, shipping 5/5                              |
| Long Crayon/Magic memory (RN ≤2× shipping growth) | **Fail** (3.9–7.1×); RN Magic phase unmeasured                                                                                                      |
| Clear right after an Eraser lift                  | **RN major** (10/10 tries failed one way or the other); shipping clean                                                                              |

The calibration supports `perf.md`'s Galaxy smoothness tie, and the brushes confirm it: RN's
presentation counters are slightly better and nothing a child would see differs. Every new
user-visible difference in this lane is an RN-only defect. **Could this flip the decision?** Not
toward RN: it adds four RN-only defects on Android (one blocker-class by the letter of the
first-stroke rule, three major, one of them the failed memory guardrail), and the shared Clear and
Settings code paths make the iPad likely to carry the same two input-loss defects (not measured
there).

## Gaps

* RN's Magic long-session memory (the switch was not taken; see the Undo defect).
* Absolute touch-to-photon latency (no camera or touch marker); Δ is relative to each arm's warm
  stroke.
* One run per arm for memory and for the Undo check; the Settings window boundary is between two
  tested delays (0.3 s lost, 0.5 s fine).
