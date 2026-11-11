# Coloring-page export under load: do both export fixes hold?

2026-11-11, Claude (lane N, coloring-export). Device: the Galaxy (S21 FE, Android 16, 120 Hz, light
paper). Arms: the two export spike builds only, `art.splotch.app.dev.export` (RN,
`claude/spike-rn-export` @ `e19904a36`) and `art.splotch.app.baseline.export` (shipping,
`claude/spike-shipping-export` @ `defac43f2`, fix mode). Raw media and scripts: `coloring-export/`
in the campaign scratch folder (rig file).

The question (Codex's #2 unchecked flip risk): both export spikes passed on **blank** pages only.
Does each fix hold on a **coloring page** under load?

## What a coloring page adds to each export (code read before any capture)

| Arm      | Extra work a page with line art puts into the export                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Thread it lands on                                                           |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| RN       | `PictureCapture` skips the outline pass only when `pageHasOutline` is false. On a Farm page React mounts a `CaptureSvg` holding `BundledBookOutline` (the page's overlay paths, parsed by react-native-svg), waits two frames, then react-native-svg `toDataURL` draws it into a full-size `Bitmap` (1080 × 2016), `Bitmap.compress(PNG)` and Base64s it; the worker then decodes that PNG in `composePicture`. Steps 3–4 of `spike-rn-export.md`'s table, which the blank-page spike never ran                                                           | JS (React commit) + **Android UI thread** (`toDataURL` runs `runOnUiThread`) |
| Shipping | On the fix's tiled path `settleTiledExportBitmaps` loads the canonical overlay SVG (`loadExportOverlay`; a new `Image` decode unless the on-screen overlay's `currentSrc` is the canonical URL) and `createExportOverlayBitmap` draws it into a **page-main-thread `OffscreenCanvas` at its natural 1024 × 1536 with a default (GPU-backed) context**, then `transferToImageBitmap`. The worker's CPU canvas then draws that GPU-backed bitmap twice (preview and page), which needs a read-back. A full-page raster the blank-page spike never exercised | Page main thread records; **WebView's in-process GPU thread** rasters        |

So both arms have a plausible residual on coloring pages, each on the thread its own stall lived on:
RN's on the Android UI thread (where touches arrive and frames are drawn), shipping's on the GPU
thread (which the WebView draw functor, and so the UI thread, waits on every frame).

## Pre-registration (written 2026-11-11 12:11 EST, before any counted capture)

Functional look before writing this (no capture, no Save): both apps opened, Farm › Cat picked, one
plain Clear in RN with Auto-Save off; screenshots only.

### Page and load

* **Page: Farm › Cat, portrait.** The densest page **built into both packages**: shipping's APK
  bundles only the Farm book (the other books are downloaded packs), and RN bundles Farm as
  `bundledBooks`. Cat's portrait overlay is the densest Farm page (1,562 path segments, 47.7 KB; cow
  1,549, horse 1,394, dog 906), the overlay file is **byte-identical** in both arms, and both arms
  place it identically on screen (dark-pixel masks of the two reference screenshots differ in 0.2%
  of pixels). Creatures › Mermaid is denser (1,967) but is a download in shipping, not built in.
* **Load:** `stall-ink.md`'s dense picture, four 2 s Crayon scribbles over the top of the paper (box
  230,440–900,1100, over the clouds, butterfly and the cat's ears), in Purple. N and S: drawn once
  at the run's start and present for every Save (Save keeps ink), as in `stall-ink`. C and O: a
  Clear wipes it, so **four** fresh scribbles precede every Clear (`stall-ink` drew two; four here
  so every busy moment carries the full dense picture).
* Settings, both arms: Pen probes, Purple, Size 3, light paper (the system's), AI off, Sound as
  found.

### Method (`spike-rn-export.md`'s, unchanged except where listed)

* uinput two-slot touchscreen (`stall-ink/bin/mt.py`), one on-device script per run, `getevent -t`,
  `screenrecord` 16 Mbps, logcat (`SplotchPerf` for RN). One-finger and two-finger runs, **3 runs
  each**, so **9 probe lines per moment per delay**. Probe waves at **100, 300 and 700 ms** after
  the busy action's release (order rotated per run), warm control 1.5 s after each probe. Same
  timing constants as `stall-ink/bin/gen.py` (Save spacing 3.5 s, Clear drag 300 ms).
* Moments: **N** (no busy moment, input-path control), **S** (Save), **C** (Clear, Auto-Save on
  Delete on), **O** (the same Clear with Auto-Save off: no export, the Clear's own cost). Per arm:
  N1f-0, N2f-0, the chord control X2f-0, S/C/O × 1f/2f × 3 runs = 21 runs.
* **Deviation 1, probe rows.** On the cat page every planned row crosses line art, and three of the
  original rows (1370, 1690, 1830) have their stroke start under it, which delays the video onset.
  Rows were re-chosen from the reference screenshots (before any capture) to minimise line art in
  the start windows: one finger probes 1250, 1725, 1960 with controls 1330, 1860, 2040; two fingers
  probes (1250, 1340), (1470, 1560), (1865, 1955) with controls 1640, 1725, 2040. The video crop
  grows to y 1180–2080 to hold them. Line art still covers 14–52% of each row's columns.
* **Deviation 2, mask-aware scorer.** The outline is drawn over the ink in both arms, so ink under
  it is invisible. A column is **masked** where the arm's reference screenshot (cleared cat page)
  has line art within ±14 px of the wave's centre (the Pen line is ~22 px thick). `score.py` and
  `vidrows.mjs` exclude masked columns from coverage, on-wave and gap; a chord run and a gap skip
  masked columns (they neither break nor extend a run). The video onset of a line whose first
  visible ink lies past `x0` is corrected by that distance (the wave moves 1 px/ms). Everything else
  (thresholds, onset rule, control-relative Δ, cohort matching) is unchanged.
* **Scorer controls, before anything is counted.** (i) N: 3/3 one-finger and 6/6 two-finger lines
  inked, on-wave, Δ within ±10 ms of controls, in each arm. (ii) The chord control `X2f-0` (second
  finger silent for 60/120/200 ms; `stall-ink`'s): the 120 and 200 ms lines must be flagged (chord,
  cut or gap) in each arm; 60 ms is reported (`stall-ink` saw it flagged in both arms on blank
  paper). If either control fails, the scorer is fixed and every run rescored before any result is
  read; if it cannot be fixed, the shape result is reported as "not measurable on this page".
* Diagnostics, not gate lines: RN's export stage lines (`start`, `ink`, `outline`, `composed`; the
  `ink`→`outline` span is the outline pass); shipping's `window.__spikeExport` timings (preview and
  PNG ready) read through the WebView DevTools socket after each batch; screen-recording frame gaps
  after each Save. If (b) or shape misses in an arm, one traced capture names the residual: atrace
  (`run-traced.zsh`) for RN, a DevTools trace (`cdp-trace.mjs`) for shipping.

### Gate, per arm (`spike-rn-export.md`'s lines)

| Line                       | Pass                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) Save keeps strokes** | **9/9 land** (not lost or cut) at 300 **and** at 700 ms after Save; 100 ms reported                                                                                                                                                                                                                                                                                                                                                                          |
| **(b) Ink on time**        | For **S and C** at 300 **and** 700 ms, every line: first-ink Δ < 100 ms against its own warm controls; RN also first-packet `receiptLag` < 100 ms and no packet gap ≥ 100 ms within the stroke. 100 ms reported. As in both spikes, the Save polaroid crosses the control rows, so S's video Δ is noisy (RN: judged with first dot and receiptLag; shipping: not scored for lateness, `stall-ink`'s rule; the frame gap after each Save is reported instead) |
| **Shape**                  | `stall-ink`'s chord rule (on-wave < 0.80 or a ≥ 40 px off-wave run = chord), on visible columns, both arms: **no chord at 300 and 700 ms** after S and C. 100 ms reported against the blank-page spikes (shipping's was 9/9 on-wave at 100 ms)                                                                                                                                                                                                               |
| **Picture**                | Every Saved and auto-saved picture present (one per Save, one per auto-saving Clear) and 1080 × 2016; its outline present and **in register**: dark-pixel mask vs the overlay SVG rendered independently (ImageMagick) at the contain-fit placement, and vs the arm's first picture; ink rows present (the scribbles, and earlier tries' lines); **never the probe stroke** drawn after that Save or Clear                                                   |
| **No regression**          | No crash (`AndroidRuntime`/`DEBUG`, crash buffer), no ANR (`dumpsys dropbox` `data_app_anr`), no exit record (`dumpsys activity exit-info`), one process per arm for the lane                                                                                                                                                                                                                                                                                |

### Classes, per arm

| Outcome                                                                                                                                                             | Class                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Every gate line passes                                                                                                                                              | **Holds on coloring pages**                                  |
| (b) or shape misses, and stage lines or a trace name a residual that is itself movable (RN: the UI-thread outline pass; shipping: the GPU overlay raster/read-back) | **Unclear**, residual named, with its own estimate (phase 2) |
| It misses because of work the architecture forces onto the input or UI path, with a diagnosis                                                                       | **Floor evidence**                                           |

A picture or no-regression failure is reported as its own defect with its own class.

**What would move the verdict.** A shipping floor on coloring pages counts **toward RN** (the
default Save path on a page a child picks, on the second-weighted device). An RN floor **hardens
keep-shipping**. A movable residual in either arm only adds repair cost to that arm's bill (the RN
price table already lists the outline pass at 0.5 day "if measured to matter"); "holds" changes
nothing.

### Phase 2 (only for an arm that misses (b) or shape with a named, movable residual)

Timeboxed to 2 h of work per arm. RN: render the outline with Skia on the export worker (no
react-native-svg capture), in the scratch export `spike-rn-export/src`. Shipping: raster the overlay
on the worker's CPU surface (or from a CPU-side decode) instead of a page-main GPU canvas, in its
spike worktree. Commit to the local spike branch only (never pushed), rebuild under `rig.lock`,
re-measure S and C at 300 and 700 ms on the same page with the same gate.

## As run

12:06–14:46 EST on the Galaxy, `dev-galaxy.lock` held for the whole lane, `rig.lock` per capture
batch (3 runs, 2–5 min) and per build or test run. Lane M (iPad) resumed at 12:21 and has priority
on `rig.lock`: every batch first waited 90 s while lane M was active, so its batches (5–9 min each)
alternated with this lane's. Scripts and scorer: `coloring-export/bin/` in the campaign scratch
folder (`gen.py`, `run.zsh`, `score.py`, `vidrows.mjs` are `spike-rn-export/bin/`'s with the
deviations below; `pageguard.zsh`, `piccheck.py`, `maskiou.py`, `summary.py` are new).

* **Both installed builds verified** on the device against the spike APKs (sha256 `18f8e37a…`,
  `e626b273…`) before any capture. Shipping's A/B switch read `null` (fix mode) before and after
  every shipping batch.
* **Every run** warm-started its app, cleared the page, and passed a **page guard** (the probe
  region holds the cat's line art, dark share 0.093–0.095, and no purple) before recording; no run
  failed it. It then pulled every gallery picture the run created (MediaStore rows newer than the
  run's start).
* Auto-Save on Delete was switched on for C and off after, each switch verified from its pixels
  (screenshots `look/autosave-*`): RN on 12:52–13:16 (base C) and 13:31–14:08 (the traced run and
  phase 2's C); shipping on 13:44–14:14. Both were off as found and are off again.
* 21 counted runs per arm (N1f, N2f, X2f, S/C/O × 1f/2f × 3), 96 probe lines per arm, 6 lines per
  moment and delay with two fingers plus 3 with one, so 9 per cell.

**Deviations from the plan** (none changes a gate line):

1. **Batch order.** After RN's first auto-saving Clears missed (b), the remaining batches were
   reordered so RN's base runs finished first and phase 2 could start; arms still alternated.
2. **The input-path control's ±10 ms line was too tight as written.** N inked 9/9 lines on-wave in
   both arms, but Δ ranged −9 to +23 ms in RN and −41 to +32 ms in shipping. The RN outlier (first
   try, second finger, +23 ms) is real: its frames show the first ink two frames later than the
   first finger's, and that cohort's receiptLag was 39 ms. Shipping's spread is its usual video
   cadence (`stall-ink.md`'s blank-page N: ±34 ms; its warm controls spread −24 to +40 ms here).
   Neither is a scorer artefact, so nothing was rescored; the late line stays at 100 ms, which both
   arms' N lines clear by ≥ 59 ms.
3. **One traced RN Clear run** (`tr-rn-C1f-0`, atrace, not counted) after RN's base runs, as the
   plan provides for a miss.
4. **Phase-2 code drafted early.** The RN Skia outline was written in a staging copy while the base
   runs continued, after RN's one-finger Saves showed the outline pass in the first dot; it was
   built only after the first Clear batch missed (b), and installed only after every RN base run.
5. **One DevTools-traced shipping Save run** (`trc-sh-S1f-0`, not counted) after all counted runs,
   outside the plan, to size the overlay's GPU-thread cost even though shipping passed.
6. **Erratum in the plan text.** Deviation 1 names rows 1370, 1690 and 1830 as starting under line
   art; 1830 was never a planned row (the original rows with masked starts were 1370 and 1690, with
   1260, 1420 and 1510 partly). The measured masked share of the chosen rows is 16–52%, not 14–52%.

### Scorer controls (the cat page, both arms)

| Control                                        | RN                                                                        | Shipping                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------- |
| N, one finger (3 lines) and two (6)            | 9/9 inked, on-wave 1.00, Δ −9 to +23 ms, receiptLag ≤ 39, first dot 18–30 | 9/9 inked, on-wave 1.00, Δ −41 to +32 ms |
| X2f chord control: second finger silent 200 ms | **chord** (on-wave 0.65, 74 px straight)                                  | **cut** (134 px gap)                     |
| 120 ms                                         | **chord** (41 px straight run; video 36 px)                               | **cut** (91 px gap)                      |
| 60 ms                                          | not flagged (16 px run, on-wave 0.96)                                     | not flagged (17 px run, on-wave 0.96)    |
| Visible columns per row                        | 48–84% (line art masks the rest; the same mask in both arms)              | same                                     |

Both registered scorer lines pass (120 and 200 ms flagged in each arm). On blank paper `stall-ink`
flagged the 60 ms drop too (RN chord, shipping chord); here it goes unflagged in both, and RN's 120
ms chord only just clears the 40 px run line. The mask costs sensitivity: on this page shape is
measured for sample drops of ~120 ms or more.

### RN (`art.splotch.app.dev.export`, spike `e19904a36`)

Each cell is 9 probe lines (3 one-finger, 6 two-finger). Δ = first ink on video against the run's
own warm controls; receiptLag / packet gap = the probe cohort's worst first-packet wait and worst
gap between packets reaching JavaScript; first dot = touch-down to first ink handed to the view.

| Moment · delay         | Lines OK        | Video Δ (ms)   | receiptLag max | packet gap max | first dot (ms) | Blank page (`spike-rn-export.md`) |
| ---------------------- | --------------- | -------------- | -------------- | -------------- | -------------- | --------------------------------- |
| N (no busy moment)     | 9/9             | −9 to 23       | 39             | 36             | 18–30          | 9/9, Δ −8 to 14, dot 21–33        |
| **S** Save · 100       | 9/9 inked       | (polaroid)\*   | 35             | **142**        | 14–21          | receiptLag 41, gap 37, dot 21–39  |
| **S** Save · 300       | 9/9 inked       | (polaroid)\*   | 85             | 34             | **81–114**     | receiptLag 56, gap 50, dot 22–41  |
| **S** Save · 700       | 9/9 inked       | (polaroid)\*   | 43             | 38             | 14–22          | receiptLag 40, gap 33, dot 20–32  |
| **C** Clear+save · 100 | 3/9, **6 late** | 59 to 218      | 128            | **159**        | 70–192         | 3/9, 6 late, Δ 64–150             |
| **C** Clear+save · 300 | **0/9, 9 late** | **131 to 263** | **174**        | **185**        | **157–260**    | 8/9, Δ 24–108, receiptLag ≤ 74    |
| **C** Clear+save · 700 | 9/9             | −3 to 54       | 38             | 46             | 35–52          | 9/9, Δ 5–54                       |
| O plain Clear · 100    | 5/9, 4 late     | −18 to 151     | 48             | 37             | 77–89          | (1f only) Δ 83–140                |
| O plain Clear · 300    | 9/9             | 14 to 66       | 41             | 41             | 40–53          | Δ 34–50                           |
| O plain Clear · 700    | 9/9             | 17 to 45       | 43             | 41             | 46–60          | Δ 28–32                           |

\* The Save polaroid flies across the control rows, so the controls' video onsets spread by up to
several seconds and S's video Δ means nothing (as in the blank-page spike); S is judged on the
cohort lines. No line was lost, cut or bent in any RN cell (on-wave ≥ 0.99 everywhere).

**Where the late ink comes from.** The export stage lines put the outline pass (`ink` → `outline`)
at 152–236 ms (median 168, 36 exports), starting 173–275 ms after the export starts: exactly when a
300 ms probe lands (275–313 ms after start). Every 300 ms probe's first dot is late by about the
part of that pass still to run. The traced Clear run (`tr-rn-C1f-0`, atrace, clock offset from the
dump's own sync mark) shows it on the Android **UI thread**: in each of its three exports the UI
thread draws **no frame for 139–144 ms**, starting +202 to +271 ms after the export's start (a burst
of react-native-svg `topSvgLayout` events, then one untraced task with no `Choreographer#doFrame`,
no input slice), while the export worker runs its ~0.9–1.0 s compose on its own thread as designed.
The Clear's own frame is a separate 64–80 ms gap at +9 to +14 ms. The O control confirms the split:
with no export, the same Clear inks a 300 ms probe in 14–66 ms (first dot 40–53), as on blank paper;
with the export it is 131–263 ms. At 100 ms the stroke starts before the pass and stalls in the
middle: packet gaps of 133–185 ms.

Exports were otherwise unchanged by the page: ink encode 172–275 ms and compose 783–1,024 ms on the
worker, total 1.13–1.50 s (blank 0.95–1.19 s; the extra is the outline pass and its PNG's decode).

### RN verdict on the coloring page (base spike)

| Line                   | Result                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) Save keeps strokes | **pass**: 9/9 at 100, 300 and 700 ms; every Save picture right (below)                                                                                                                                         |
| (b) Ink on time        | **miss.** Clear at 300 ms: 0/9 (Δ 131–263, receiptLag up to 174, packet gap up to 185). Save at 300 ms: receiptLag ≤ 85 and gaps ≤ 34 pass, but one two-finger cohort's first dot is 114 ms (the others 81–89) |
| Shape                  | pass: no chord or bend in any cell                                                                                                                                                                             |
| Picture                | pass (below)                                                                                                                                                                                                   |
| No regression          | pass: no crash, ANR or exit                                                                                                                                                                                    |

**Class: unclear, residual named and movable**: the react-native-svg outline capture
(`PictureCapture` → `CaptureSvg` → `toDataURL`) that Android still runs on the UI thread for a page
with line art, ~140–190 ms per export. It is the item `spike-rn-export.md` priced at "0.5 (if
measured to matter)": it matters. Phase 2 below moves it.

### Phase 2, RN: the outline drawn by Skia on the export worker

Drafted from ~12:30 in a staging copy (deviation 4) and applied at 12:58, once the first one-finger
auto-saving Clears had missed (b) with the outline pass named; built 13:08–13:11, installed 13:37
after the last RN base run. About 45 minutes of the 2 h box went to code, gates and build.

| Item        | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Change      | `PictureCapture` on Android no longer mounts a `CaptureSvg` for a bundled (Farm) page: it passes the page's parsed overlay (`BundledOutlineVariant`, the same nodes `BundledBookOutline` draws) to `composePicture`, and the `composeLayers` worklet draws it after the ink in the same Skia pass on the export worker (paths via `MakeFromSVGString`, ellipses/circles/rects, the overlays' `rotate()` transforms, contain-fit and centred as `xMidYMid meet`). `skiaOutline.android.ts` holds the hook; `skiaOutline.ts` returns null, so iOS and web are unchanged. The sample pages and offline books keep the SVG capture |
| Branch tip  | `claude/spike-rn-export` @ `09a61d9ffe548e8d1e1efc006b63c533b2620d8a` (one commit on `e19904a36`: 4 files, +155/−30, `src/drawing/` only). Local, never pushed. Edited in the scratch export and committed through a temporary index, as the spike was                                                                                                                                                                                                                                                                                                                                                                         |
| Gates       | ESLint clean on the four files; `tsc --noEmit -p tsconfig.json` (the RN app) clean; 8 picture/capture tool test files, 82 tests pass. No new test: the Skia path is Android-only and the tool tests mock Skia                                                                                                                                                                                                                                                                                                                                                                                                                  |
| APK         | probe Release, arm64, debug key, `art.splotch.app.dev.export`, build tag `09a61d9ff`, sha256 `5201c90a…242a`, 143 s under `rig.lock`; installed with `install -r` (data kept), device hash verified. The original `e19904a36` APK is kept beside it (`builds/spike-rn-export/e19904a36/`)                                                                                                                                                                                                                                                                                                                                      |
| Re-measured | S and C, one and two fingers, 3 runs each, same scripts, page, scorer and gate (`p2-rn-*` runs). The app cold-started after the install (it came up on blank paper; Farm › Cat was picked again before the runs)                                                                                                                                                                                                                                                                                                                                                                                                               |

Results, same cells as the base table (9 lines each):

| Moment · delay         | Phase 2: lines OK | Video Δ (ms) | receiptLag max | packet gap max | first dot (ms) | Base spike on this page                     |
| ---------------------- | ----------------- | ------------ | -------------- | -------------- | -------------- | ------------------------------------------- |
| **S** Save · 100       | 9/9 inked         | (polaroid)   | 58             | 49             | 13–40          | 9/9; gap **142**, dot 14–21                 |
| **S** Save · 300       | 9/9 inked         | (polaroid)   | 42             | 42             | **12–29**      | 9/9; receiptLag 85, dot **81–114**          |
| **S** Save · 700       | 9/9 inked         | (polaroid)   | 59             | 40             | 13–37          | 9/9; dot 14–22                              |
| **C** Clear+save · 100 | 7/9, 2 late       | 2 to 137     | 64             | 60             | 63–105         | 3/9, 6 late; gap 159                        |
| **C** Clear+save · 300 | **9/9 inked**     | **20 to 92** | **52**         | **51**         | **40–72**      | **0/9**, Δ 131–263, receiptLag 174, gap 185 |
| **C** Clear+save · 700 | 9/9 inked         | 1 to 30      | 29             | 35             | 33–42          | 9/9, Δ −3 to 54                             |

* The outline stage is now instant (`ink` → `outline` 0 ms in all 36 exports): the ink encode
  (172–317 ms) is followed directly by the compose on the worker (698–1,100 ms), total 0.87–1.37 s,
  faster than the base build on this page (1.13–1.50 s), because the full-page outline PNG is no
  longer encoded, Base64'd and decoded.
* Clear at 300 ms now inks within 20–92 ms of the warm controls (first dot 40–72): the plain Clear's
  own cost on this page (O: Δ 14–66, first dot 40–53) plus a few ms; the blank-page spike had
  24–108. At 100 ms, 2 of 9 lines are late (131 and 137 ms) as with the plain Clear (O at 100 ms: 4
  of 9 late, Δ up to 151): the Clear's own commit, not the export.
* Save at 300 ms is indistinguishable from no Save (first dot 12–29; N: 18–30).
* **Pictures**: all 41 phase-2 pictures (18 Saves, 18 auto-saving Clears, 5 run-start Clears)
  present, 1080 × 2016, outline in register (IoU 0.829–0.832 against the independent render, best
  shift ≤ 1 px, the same as the base build's 0.827–0.831), ink right, never the probe. Against the
  base build's react-native-svg outline (the same scribble-only picture of the same script, rows
  800–2,016 where only outline, paper and grain sit): mean absolute difference 0.18% (about 0.5
  levels), 2.1% of pixels off by more than 8 levels, all on outline edges; outline masks overlap
  0.97. Side by side at 2× no difference is visible (`look/p2-outline-zoom.png`).
* No crash, ANR or exit (crash buffer empty for every run).

**Phase-2 verdict: the gate passes.** (a) 9/9 at 300 and 700 ms; (b) every S and C line at 300 and
700 ms with Δ < 100, receiptLag < 100 and no gap ≥ 100; shape clean; pictures right. With the
outline drawn in the worker's Skia pass, the RN export fix **holds on this coloring page**.

**Price.** The as-built change is spike quality and covers the Farm book only. Production landing:
the same Skia path for the sample pages (stroked paths, `OUTLINE_WIDTH_PX`, round caps) and the
offline-library books, then delete Android's `CaptureSvg` outline path; a picture-parity test (Skia
outline against the react-native-svg capture, per page kind) on device or in a Skia-backed test; the
worklet's argument size for the densest pages (47 KB of path text per export, copied to the worker);
iOS gets the same once its compose moves to the worker (`spike-rn-export.md`'s iOS item, lane M).
**0.5–1 agent-day**, replacing the 0.5 "if measured to matter" line in `spike-rn-export.md`'s table.
RN's (b) total moves from 2–3 to about 2–3.5 agent-days.

### Shipping (`art.splotch.app.baseline.export`, spike `defac43f2`, fix mode)

Each cell is 9 probe lines. Shipping has no in-app timing, so (b) is the video Δ (C) and shape; the
Save polaroid covers the control rows for ~1.4 s, so S's Δ is not scored (as in both earlier lanes)
and the longest screen-recording frame gap after each Save is reported instead (the polaroid
animates, so a gap there is a frozen frame).

| Moment · delay         | Lines OK | Outcome | Video Δ (ms) | on-wave min | Blank page (`spike-shipping-export.md`, fix mode) |
| ---------------------- | -------- | ------- | ------------ | ----------- | ------------------------------------------------- |
| N (no busy moment)     | 9/9      | inked   | −41 to 32    | 1.00        | 9/9 on-wave, lag ≤ 11                             |
| **S** Save · 100       | 9/9      | on-wave | (polaroid)   | 1.00        | 9/9 on-wave                                       |
| **S** Save · 300       | 9/9      | on-wave | (polaroid)   | 1.00        | 9/9 on-wave                                       |
| **S** Save · 700       | 9/9      | on-wave | (polaroid)   | 1.00        | 9/9                                               |
| **C** Clear+save · 100 | 9/9      | on-wave | −45 to 40    | 0.99        | 9/9 on-wave, lag ≤ 47                             |
| **C** Clear+save · 300 | 9/9      | on-wave | −52 to −3    | 0.99        | 9/9 on-wave, lag ≤ 14                             |
| **C** Clear+save · 700 | 9/9      | on-wave | −57 to −20   | 0.98        | 9/9                                               |
| O plain Clear · 100    | 9/9      | on-wave | −42 to −3    | 0.99        | (not run)                                         |
| O plain Clear · 300    | 9/9      | on-wave | −54 to −31   | 0.99        | (not run)                                         |
| O plain Clear · 700    | 9/9      | on-wave | −58 to −35   | 0.99        | (not run)                                         |

No shipping line was lost, cut, bent or late in any cell: 81 of 81 probe lines after S, C and O.

| Export measure (fix mode, `window.__spikeExport`)  | Cat page                        | Blank page (spike)  |
| -------------------------------------------------- | ------------------------------- | ------------------- |
| Polaroid preview handed over (Save)                | 106 ms median (79–156), n = 18  | 66 ms (48–81)       |
| PNG ready, Save                                    | 478 ms median (369–662), n = 18 | 331 ms (258–509)    |
| PNG ready, auto-saving Clear                       | 461 ms median (296–564), n = 24 | 298 ms (155–447)    |
| Longest frame gap within 1 s of a Save (recording) | 18–50 ms (18 Saves)             | 17–42 ms (18 Saves) |

The overlay costs shipping's export ~40 ms on the preview and ~150 ms on the PNG, all off the page's
main thread, and no frame stalls past 50 ms.

**What the overlay puts on the GPU thread** (one DevTools-traced S1f run after the counted runs,
`trc-sh-S1f-0`, not counted; the trace clock is CLOCK_MONOTONIC, the same as `getevent`'s: the
probes' first input events land 5–23 ms after their touch-downs). Within 1 s of each of its three
Saves, the longest WebView GPU-thread task was 25 ms (first Save, +105 ms; presumably the overlay
raster, which later Saves of the already-decoded page repeat in ≤ 15 ms), and the longest
`DrawFn_DrawGL` 29–37 ms. The blank-page base mode had a 415 ms task there. The page-main
`OffscreenCanvas` raster of the SVG that the code read flagged is real but small on this device: ~25
ms once, less once the page has exported. (The trace also shows three 44–61 ms GPU-thread flushes of
the live canvas between strokes, 1–3.4 s before a Save, which no export causes and no probe line
met.)

### Shipping verdict on the coloring page

| Line                   | Result                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| (a) Save keeps strokes | **pass**: 9/9 at 100, 300 and 700 ms                                                                  |
| (b) Ink on time        | **pass**: Clear Δ ≤ 40 ms at every delay; Save not scored for lateness (polaroid), frame gaps ≤ 50 ms |
| Shape                  | **pass**: no chord, cut or bend in any cell (81/81 lines on-wave ≥ 0.98)                              |
| Picture                | **pass** (below)                                                                                      |
| No regression          | **pass**: no crash, ANR or exit; one process for the whole lane                                       |

**Class: holds on coloring pages.**

### Pictures (both arms)

| Arm, build               | Pictures pulled                                         | Size        | Outline register (dark-mask IoU vs the overlay rendered by ImageMagick at the contain-fit placement; best shift) | Ink and probe check |
| ------------------------ | ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ------------------- |
| RN `e19904a36`           | 46: 18 Saves, 21 auto-saving Clears, 7 run-start Clears | 1080 × 2016 | 0.827–0.831, ≤ 1 px                                                                                              | 46/46               |
| RN `09a61d9ff` (phase 2) | 41: 18 Saves, 18 auto-saving Clears, 5 run-start Clears | 1080 × 2016 | 0.829–0.832, ≤ 1 px                                                                                              | 41/41               |
| Shipping `defac43f2`     | 45: 21 Saves, 18 auto-saving Clears, 6 run-start Clears | 1080 × 2016 | 0.824–0.830, ≤ 1 px                                                                                              | 45/45               |

* The reference screenshot of the page itself scores 0.828 (RN) and 0.822 (shipping) against the
  same render, so ~0.83 is "identical placement" for this threshold and antialiasing; a misplaced or
  missing outline would score near 0.
* Ink and probe check, per picture: the four scribbles present; every earlier try's probe and
  control present (Save: all tries before it; Clear: the one try since the last Clear); the probe
  drawn after that Save or Clear absent (< 300 purple pixels in its band, against 13,000–15,500 for
  a drawn line). Every one of the 132 pictures passed. Each run-start Clear picture held the
  previous run's last page.
* RN's and shipping's outlines overlap 0.95 in the same picture region; shipping's is slightly
  softer (its 1024 × 1536 overlay bitmap is upscaled; RN rasters the paths at full size).
* Gallery: 87 new pictures owned by `art.splotch.app.dev.export` (MediaStore ids
  1000001860–1000001988) and 45 by `art.splotch.app.baseline.export` (1000001869–1000001991), one
  per Save or auto-saving Clear and nothing else. Nothing deleted.

### No regression

| Check                                 | RN                                                                                   | Shipping                             |
| ------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| Crash buffer, per run and at the end  | empty                                                                                | empty                                |
| `am_anr` / `am_crash` events per run  | none                                                                                 | none                                 |
| `dumpsys dropbox` ANR / crash entries | none                                                                                 | none                                 |
| `dumpsys activity exit-info`          | one record, 13:37:56 "PACKAGE UPDATED" (the phase-2 install); none other in the lane | none since the spike's 04:39 install |
| Process                               | one per build (base until 13:37, phase 2 after)                                      | one for the whole lane (since 04:39) |

### Classes

| Arm                                       | Class                                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN, spike as built (`e19904a36`)          | **Unclear, residual named and movable**: (b) misses on the coloring page (Clear at 300 ms 0/9, Δ 131–263 ms) because Android still captures the page's line art with react-native-svg on the UI thread (~140 ms with no frame drawn, traced). Not the JS-thread design and not forced by the architecture: phase 2 moved it |
| RN with the outline in Skia (`09a61d9ff`) | **Holds on coloring pages** (every gate line), at a price of 0.5–1 agent-day for the production version                                                                                                                                                                                                                     |
| Shipping (`defac43f2`)                    | **Holds on coloring pages** (every gate line); the overlay's own GPU work is ≤ 25 ms per export on the Galaxy                                                                                                                                                                                                               |

Neither arm showed floor evidence.

### Not measured

* The iPad. RN's iOS compose still draws ink and outline through react-native-svg on the main thread
  (lane M's subject); the phase-2 hook returns null on iOS. Shipping's 2× iPad already took the
  worker path on blank paper; its overlay raster there is unmeasured.
* Other page kinds: the sample pages (stroked paths) and downloaded books keep RN's SVG capture in
  the phase-2 build; denser downloaded pages (Creatures › Mermaid, 1,967 segments) were not tried.
* Dark paper (white line art), landscape, and lower-end Android phones.
* Shape below a ~120 ms sample drop on this page (the line-art mask costs the scorer the 60 ms
  chord).
* A production-quality phase-2 change: no parity test, Farm pages only.

## State left behind

* **The Galaxy**: both export builds on **blank paper** (each app's coloring-book chip cleared,
  14:44–14:45), cleared page, Pen, Purple, Auto-Save on Delete **off** (verified 14:45 in both,
  `look/end-*`), launcher (Nova) in front. `art.splotch.app.dev.export` now runs the **phase-2 build
  `09a61d9ff`** (sha256 `5201c90a…242a`), not `e19904a36`; reinstall
  `builds/spike-rn-export/e19904a36/app-release.apk` (or `builds/spike-rn-export/app-release.apk`,
  restored to it) for the spike as it was. Shipping's `art.splotch.app.baseline.export` untouched
  (`defac43f2`, fix mode). The store app, `.dev`, `.dev.best`, `.dev.bestplain`, `.dev.mem`,
  `.baseline.main` and `.baseline.best` were never touched. No device, display or system setting
  changed. `dev-galaxy.lock` released 14:46.
* **Code**: `claude/spike-rn-export` advanced to `09a61d9ffe548e8d1e1efc006b63c533b2620d8a` (local,
  never pushed); its scratch export `spike-rn-export/src` holds the same files (Gradle cleaned). The
  shipping spike worktree is unchanged.
* **Scratch** (`coloring-export/`, ~540 MB): scripts in `bin/`, scored runs in `runs/` (scores,
  video tables, before/after screenshots and every pulled picture; recordings, the 1.1 GB atrace
  dump and the 240 MB DevTools trace deleted after scoring), key frames in `look/`, the independent
  overlay render in `ref/`, phase-2 logs and the staged diff in `phase2-rn/`. APK
  `builds/spike-rn-export-coloring/`.

## Could this flip the decision?

No. Codex's #2 flip risk was that one arm's export fix might fail on a coloring page. Shipping's
holds with nothing added: every line on-wave and on time, pictures right, and the overlay costs its
GPU thread ~25 ms. RN's fix as built did fail, and visibly (strokes started 0.3 s after an
auto-saving Clear inked 0.13–0.26 s late on this page), but the cause was one more piece of export
work left on the UI thread, not the architecture: drawing the page's outline in the same Skia pass
on the export worker removed it and passed every line, in ~155 lines and under an hour of work. That
moves the RN spike's "0.5 if measured to matter" line to a measured 0.5–1 agent-day and raises RN's
export repair bill to about 2–3.5 days in all. It adds repair cost to RN and finds a floor in
neither arm, so the verdict (keep shipping, ~65%) stands. The open half is the iPad, where RN's
compose and outline are still on the main thread.
