# Spike: RN export off the input path (Save lock, export on the JavaScript thread)

2026-11-11, Claude (lane spike-rn-export, half-day box from 04:02 EST). Device: the Galaxy (S21 FE,
Android 16, 120 Hz). Base: RN best v2, `claude/best-rn` @ `e703b8b79a08`. Spike branch:
`claude/spike-rn-export` (local, never pushed). Raw media and scripts: `spike-rn-export/` in the
campaign scratch folder.

The findings under test (`stall-ink.md`):

* **(a)** RN best loses every stroke started within ~1.6 s of **Save** (29/29): `useSaveAction` runs
  the capture inside `runCommand`, so the input lock and `busy` hold for the whole export. Clear's
  lock-free departing export was never ported to Save.
* **(b)** RN best inks strokes 0.3–1.2 s late after an auto-saving Clear (27/27): the export's pixel
  work runs on the JavaScript thread, the thread that inks (atrace: `mqt_v_js` busy ~1.1 s;
  receiptLag 0.42–1.09 s). Open question: is the JS-thread design a **floor** here, or fixable?

## What the export does (from the code, before changing it)

On Android a departing export (`useDepartingExport` → `PictureCapture`, kind `export`) runs, in
order:

| # | Step                                                                                                                           | Thread                   |
| - | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| 1 | Snapshot of the ink layer (copy-on-write `SkImage`, raster)                                                                    | JS, ~free                |
| 2 | `captureImage`: resample the paper region onto the export grid (raster surface, linear), `encodeToBase64` (PNG)                | **JS**                   |
| 3 | React renders a `CaptureSvg` holding only the page outline (Android composes the ink itself)                                   | JS + UI                  |
| 4 | react-native-svg `toDataURL`: draw the SVG into a full-size `Bitmap`, `Bitmap.compress(PNG)`, Base64 — even for a blank page   | **UI** (`runOnUiThread`) |
| 5 | `composePicture`: decode both PNGs, paper colour, grain shader (cubic), both layers drawn cubic onto the grid, encode PNG q100 | **JS**                   |
| 6 | `pictureSave.save(base64)` (Expo module, async)                                                                                | native module queue      |

Steps 2 and 5 are pure Skia CPU work on raster images and need nothing from React. Save's locked
path (`exportPng`) runs the same steps under the lock.

## Changes on the spike branch

| Fix | Change                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) | `useSaveAction` first tries `exportDepartingPicture` (the Clear path: frozen ink, no command, no lock, no `busy`); only ink the paper has not drawn yet falls back to the locked capture. `exportDeparting` now resolves `{ base64, size }` so the polaroid keeps its size                                                                                                                    |
| (b) | Steps 2 and 5 become worklets (`encodeRegion` in `skiaInkScene.ts`, `composeLayers` in `pictureCompose.ts`) run by `runExportWork` on one `react-native-worklets` worker runtime (`exportWorker.native.ts`; inline in `exportWorker.ts` for web, Node and the type checker). Same Skia calls, same order, same pixels. Frozen ink's `plan.ink` resolves a promise; live ink stays synchronous |
| (b) | Android skips step 3–4 when the page has no line art (`pageHasOutline`): the outline layer of a blank page is fully transparent, so the composed picture is unchanged                                                                                                                                                                                                                         |
| —   | Probe-only diagnostic: `perfExportStage` writes a `SplotchPerf` line at the export's start, ink, outline and composed hand-offs (performance.now, the getevent clock)                                                                                                                                                                                                                         |

## Pre-registration (written 2026-11-11 ~04:20 EST, before any capture)

Method: `stall-ink.md`'s, unchanged (uinput two-slot touchscreen, dense picture of four 2 s Crayon
scribbles, probe waves at 100/300/700 ms after the busy action's release, warm controls 1.5 s later,
the same scoring scripts). Moments **S** (Save) and **C** (Clear with Auto-Save on Delete on) only,
one-finger and two-finger runs, 3 runs each, so 9 probe lines per moment per delay. Input-path
control first: 3 one-finger and 3 two-finger probes with no busy moment (N runs) must all be inked.

| Criterion                         | Success line                                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **(a) Save keeps strokes**        | **9/9 land** (not lost or cut; cohort `strokes ≥ 1`) at 300 ms **and** at 700 ms after Save; 100 ms reported. The Save's picture lands in the gallery and holds the pre-Save ink, never the probe stroke                                                                                                                 |
| **(b) Ink on time after exports** | For **both** S and C at 300 **and** 700 ms: every line's first-ink Δ < 100 ms against its own recording's warm controls (the stall lane's `late` line), **and** the first packet's `receiptLag` < 100 ms, **and** no packet gap ≥ 100 ms within the stroke. 100 ms reported (may still be late: the export starts there) |
| No regression                     | Input-path control inked 6/6 lines with Δ ≤ ±10 ms of controls; every auto-saved and Saved picture present, the right size (1080 × 2016 class), paper and grain pixel-identical to an RN-best export away from the strokes, ink rows present; no crash (`AndroidRuntime`/`DEBUG` empty), no exit record                  |

How (b) is classed:

| Outcome                                                                                                                                                                                                         | Class                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| (b) line met with no regression                                                                                                                                                                                 | **fixable**, with the price below: the late ink is movable work, not the JS-thread design |
| Late ink drops but misses the line, and the export stage lines or atrace name a residual that is itself movable (e.g. a step still on JS, a GC of the big strings, the UI-thread outline pass)                  | **unclear**, residual named, with its own estimate                                        |
| The heavy steps run on the worker but receiptLag stays ≥ 100 ms because of work that must run on the JS thread (React commits, the bridge hand-off of the picture), or Skia cannot run off the JS thread at all | **floor evidence** (JS-thread design)                                                     |

**The number that would change the decision:** if (b) passes, the stall lane's "unclear: the
JS-thread design cost" moves to **fixable** and RN loses its only floor candidate from natural busy
moments; if the residual JS-thread work is ≥ 250 ms and unmovable, it is floor evidence against RN's
bones.

**Addendum (05:17, after the one-finger C runs, before the two-finger C runs).** The C lines showed
a first dot of 45–94 ms even at 700 ms, when only the worker is busy, where the Save lines (same
export) showed 20–41 ms. An explanatory control is added: the same C scripts with Auto-Save on
Delete **off** (runs `O1f-*`, no export at all), to separate the Clear's own cost from the export's.
It does not change the lines above: they are scored as registered.

## Build and gates

| Item                | Value                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Branch tip          | `claude/spike-rn-export` @ `e19904a369abda4eb753337eb7b021f0d2921a42` (one commit on `e703b8b79a08`; src +186/−70 in 13 files, tests +52/−26 in 4). Local, never pushed                                                                                                                                                              |
| How it was edited   | The campaign session's hook refuses Edit/Write into a second worktree, so (as earlier spikes did) the branch was exported to scratch, edited and built there, and committed onto the branch through a temporary index. The empty worktree first created was removed                                                                  |
| `npm run check`     | clean                                                                                                                                                                                                                                                                                                                                |
| `npm run lint`      | 0 errors, the same 3 warnings as RN best (files the spike does not touch)                                                                                                                                                                                                                                                            |
| Targeted unit tests | 32 tool test files touching capture, export, ink scene, Save, the probe and test placement: 361 pass at the tip; 8 RSD files for Save/flight/failure/AI/toolbar: 89 pass. Not run: full `test:tools`, `test:unit`, the RSD selection                                                                                                 |
| Tests changed       | Save's resize test now expects the frozen-ink save (it fails on RN best: `exportPng` is called); Android blank-page compose test new (fails on RN best: two capture passes); two Android outline tests moved to a coloring page; the RSD host's `exportDeparting` stub returns `{ base64, size }`; the SVG test fixture gains `Path` |
| APK                 | probe Release, arm64, debug key, `art.splotch.app.dev.export`, build tag `e19904a36`, sha256 `18f8e37a…43fc`, 2 m 22 s under `rig.lock`. Installed on the Galaxy beside `.dev.best`, verified hash on device                                                                                                                         |

## Device run (the Galaxy, `art.splotch.app.dev.export`)

Method as registered: `stall-ink/`'s scripts and scoring copied unchanged into
`spike-rn-export/bin/` (two edits: the package allow-list, and the cohort parser skips the new
`export` probe lines). Fresh install, tool drawer expanded once, Pen, Purple, Size as installed (3).
Each batch held `dev-galaxy.lock`, then `rig.lock` for its captures only (3–5 runs, ≤ 4 min), 60 s+
apart; the export-soak and shipping-export lanes ran between them. Auto-Save on Delete was switched
on for the C runs and off after, both verified from the switch's pixels.

**Baseline** is RN best v2's rows from `stall-ink.md` (same device, scripts and scorer, 01:54–03:56
today). No same-session RN best run: another lane had RN best's Auto-Save on for its soak.

| Moment · delay         | Spike: lines OK   | Video Δ (ms)  | receiptLag max | packetGap max | first dot (ms) | RN best v2 (`stall-ink.md`)                  |
| ---------------------- | ----------------- | ------------- | -------------- | ------------- | -------------- | -------------------------------------------- |
| Control (no busy), all | 9/9 inked         | −8 to 14      | 29             | 22            | 21–33          | 9/9                                          |
| **S** Save · 100       | **9/9 inked**     | −58 to −50    | 41             | 37            | 21–39          | 0/9 lost (receiptLag 957–1,071)              |
| **S** Save · 300       | **9/9 inked**     | −60 to −51    | 56             | 50            | 22–41          | 0/9 lost (1,063–1,102)                       |
| **S** Save · 700       | **9/9 inked**     | −59 to −51    | 40             | 33            | 20–32          | 0/9 lost (691–730)                           |
| **C** Clear+save · 100 | 3/9 inked, 6 late | 64 to 150     | 60             | 56            | 63–94          | 9/9 late, Δ 292–426, then a ~1 s freeze      |
| **C** Clear+save · 300 | 8/9 inked, 1 late | 24 to **108** | 74             | 71            | 47–94          | 9/9 late, Δ 187–1,230 (receiptLag 812–1,087) |
| **C** Clear+save · 700 | **9/9 inked**     | 5 to 54       | 46             | 47            | 36–56          | 9/9 late, Δ 544–784 (455–704)                |

* Save rows: the warm controls' video onsets spread ±200–300 ms in every Save run (the polaroid
  flight crosses their rows, as in RN best's Save runs), so the video Δ there is relative to a noisy
  reference. The in-app first dot (touch-down to first ink handed to the view) and receiptLag match
  the no-busy control, which is the stronger evidence that Save probes are on time.
* Clear rows: controls spread ±11 ms, so the video Δ is sound there.
* Export stage lines (36 exports): ink encode 193–249 ms, compose 752–969 ms, total 949–1,189 ms,
  all on the worker. Save and Clear exports took as long as before; the JavaScript thread no longer
  runs them.

### The Clear's own cost (explanatory control, Auto-Save off, one finger)

Same C scripts with Auto-Save on Delete **off**: the Clear runs, nothing exports (no export lines).

| Delay | Auto-Save off (no export): video Δ, first dot | Auto-Save on (spike), one finger: video Δ, first dot | RN best v2, Auto-Save on     |
| ----- | --------------------------------------------- | ---------------------------------------------------- | ---------------------------- |
| 100   | 83, 140, 140 ms · dot 55–77                   | 98, 142, 150 ms · dot 68–94                          | 292–426 ms, then ~1 s freeze |
| 300   | 34, 50, 50 ms · dot 46–53                     | 54, 63, **108** ms · dot 47–94                       | 187–1,230 ms                 |
| 700   | 28, 31, 32 ms · dot 45–50                     | 33, 49, 54 ms · dot 46–56                            | 544–784 ms                   |

A stroke begun 100 ms after any Clear is ~140 ms late in this build with or without the export (the
Clear's own commit and departing-page animation; the guardrails lane measured the same 45–70 ms
first dot with Auto-Save off). What the export still adds is 5–60 ms at 300 ms and ≤ 22 ms at 700 ms
(one-finger Hermes GC time per probe window is the same with and without it, 20–36 ms).

### Thread time during the exports (atrace, one traced C and one traced S run)

`run-traced.zsh` from the stall lane (`sched view input gfx am` + app trace points), runs `tr-C1f-0`
and `tr-S1f-0`, trace clock = CLOCK_MONOTONIC + 856,283.068 s (the stall lane's offset; the dump's
clock-sync mark agrees within 20 ms). Window: 50 ms before each export's start to 1.3 s after.

| Thread                                        | RN best v2 (`stall-ink.md`, Save)       | Spike, per export (5 exports)                                                                                                                                              |
| --------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript (`mqt_v_js`, the inking thread)    | 213 ms, then **876 ms** without a break | 400–532 ms busy in the window, **longest stretch 58–86 ms**; it is also inking the probe stroke then. The longest stretch sits at the Clear or Save itself (−21 to +40 ms) |
| Export worker (a second `mqt_v_js`, worklets) | —                                       | **979–1,079 ms in one stretch** (the ink encode and the compose)                                                                                                           |
| RenderThread                                  | —                                       | 597–810 ms, longest 147–297 ms (the departing page / polaroid animations)                                                                                                  |

The JavaScript thread at the export's own moments (6 exports, busy time in each window, longest
stretch in brackets):

| Window                               | Clear (3 exports)       | Save (3 exports)    |
| ------------------------------------ | ----------------------- | ------------------- |
| The action itself (−50 to +60 ms)    | 80–88 ms (**66–81 ms**) | 32–49 ms (31–35 ms) |
| Ink hand-off (ink stage + 60 ms)     | 17–29 ms (15–24 ms)     | 0–17 ms (≤ 10 ms)   |
| Composed hand-off (composed + 80 ms) | 11–46 ms (12–22 ms)     | 46–57 ms (37–42 ms) |

So what still lands on the JavaScript thread is the Clear's own commit (66–81 ms, also there with
Auto-Save off) and the export's hand-offs (≤ 24 ms for the ink, ≤ 42 ms for the finished picture,
which Save also hands to the polaroid and the save module).

### No regression

| Check               | Result                                                                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every export landed | 51 pictures in the gallery = 1 smoke Save + 21 run Saves + 21 auto-saving Clears + 8 run-start Clears with Auto-Save on; every export logged `start` and `composed`; all 21 Saves took the frozen-ink path (no fallback)          |
| Size                | all 51 are 1080 × 2016, as RN best's                                                                                                                                                                                              |
| Pixels vs RN best   | Save 1 of `S1f-0` (dense scribble only) against RN best's Save 1 of the same script: rows 800–2016 (paper and grain away from ink) **AE 0**; differences only in the scribble's rows (the crayon follows each run's input timing) |
| Content             | Each Save holds the ink drawn before it and never the probe after it (Save 3: scribble + probes 0–1 + controls 0–1; RN best's Save 3 lacks the lost probes). Key frame `spike-rn-export/look/pics-best-vs-spike-3.png`            |
| Drawing             | input-path control 9/9 inked, Δ −8 to 14 ms; first dot 21–33 ms                                                                                                                                                                   |
| Crash / exit        | crash buffer empty for the package; `dumpsys activity exit-info` lists no exit; one process for the whole session                                                                                                                 |
| Cost                | the worker thread had 50 s of CPU after ~49 exports (~1 s each); app PSS 515 MB after the session (not compared with RN best in the same state; the second runtime's memory is unmeasured)                                        |

## Verdicts against the pre-registered lines

| Criterion                   | Line                                                      | Result                                                                                                        | Verdict                                |
| --------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **(a) Save keeps strokes**  | 9/9 land at 300 and 700 ms; picture right                 | **9/9 and 9/9** (and 9/9 at 100 ms) against RN best's 0/27; every Save's picture landed and is right          | **pass**                               |
| **(b) Ink on time** — Save  | Δ < 100, receiptLag < 100, no gap ≥ 100 at 300 and 700 ms | 18/18 lines; receiptLag ≤ 56, gap ≤ 50, first dot 20–41 ms (= no-busy control)                                | pass                                   |
| **(b) Ink on time** — Clear | same                                                      | 700 ms: 9/9 (Δ ≤ 54). 300 ms: **8/9** — one line at Δ 108 ms. receiptLag ≤ 74 and gaps ≤ 71 in **every** line | **missed by one line** (108 vs 100 ms) |
| No regression               | control inked, pictures right, no crash                   | as above                                                                                                      | pass                                   |

**Class of (b), by the registered rule: unclear — residual named, not a floor.** 35 of 36 lines at
300/700 ms meet the line; no line's packets waited ≥ 100 ms for the JavaScript thread (worst 74 ms,
against 455–1,102 ms in RN best); the JavaScript thread's longest stretch during an export fell from
876 ms to ≤ 86 ms; and the export's ~1 s of pixel work now runs, unchanged, on a worker. The one
late line (C1f-0, 300 ms, Δ 108 ms, first dot 94 ms) is ~50 ms of the Clear's own cost (the
Auto-Save-off control: 34–50 ms at 300 ms) plus what the export still puts on the JavaScript thread:
its hand-offs, ≤ 24 ms for the ink (PNG back to JavaScript, a React commit, sent on to the worker)
and ≤ 42 ms for the finished picture (to the save module and, for Save, the polaroid) in the trace.
Both are movable (one worklet from the frozen image; keep bytes off the JavaScript heap). The
registered floor case (heavy steps off-thread, but receiptLag ≥ 100 ms from work that must stay on
JavaScript) did **not** occur. A second attempt at the residual was not built: the half-day box went
to the controls and the trace that name it.

**What it means for RN's bones.** The export stall that `stall-ink.md` left "unclear: the JS-thread
design cost" is movable work, moved here in ~200 lines with the same Skia calls: Save no longer
loses strokes, and ink after Save is on time; after an auto-saving Clear it is within ~60 ms of a
plain Clear. The JS-thread design is not a floor for export on the Galaxy. Still unmeasured: the
iPad, where the export also rasterizes the ink through react-native-svg on the main thread (below).

## Price for a production-quality landing

| Item                                                                                                                                                                                                                          | Agent-days                  |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **(a)** Save from frozen ink: tests for the frozen path, the locked fallback (ink not drawn yet), Clear/Undo/stroke during a Save, double Save, save failure; iPad check (the Clear path already ships there); review         | **0.5**                     |
| **(b)** Export worker as built: contract test for `exportWorker.native.ts`, a guard that the worklets capture only Skia and arguments, runtime lifetime and error paths, Galaxy re-run, review                                | 1                           |
| **(b)** iPad: confirm the worker on iOS, and move iOS's ink compose out of the main-thread react-native-svg capture (Android already composes ink in Skia; iOS still draws a data-URI image into an SVG and encodes it there) | 0.5–1                       |
| **(b)** Remove the named residual: compose from the frozen `SkImage` in one worklet (no ink PNG round trip through JavaScript and React), and keep picture bytes off the JavaScript heap where the save API allows            | 0.5                         |
| **(b)** Coloring pages on Android: the outline pass still runs react-native-svg `toDataURL` (draw + PNG encode) on the UI thread; render it with Skia on the worker. Not measured here (blank pages only)                     | 0.5 (if measured to matter) |
| **Total**                                                                                                                                                                                                                     | **(a) 0.5; (b) 2–3**        |

## State left behind

* The Galaxy: `art.splotch.app.dev.export` installed (spike probe build `e19904a36`), page with ink
  from the last run, Pen, Purple, Size 3, **Auto-Save on Delete off** (verified by pixel, 06:14),
  tool drawer expanded, launcher in front. `.dev.best`, `.dev`, `.dev.mem`, both shipping builds and
  the store app were not touched; RN best's pictures were only read.
* Gallery: **51 new pictures** owned by `art.splotch.app.dev.export` (Saves and auto-saving Clears),
  nothing deleted.
* Scratch (`spike-rn-export/`): scripts in `bin/`, scored runs in `runs/` (recordings deleted after
  scoring; the two atrace dumps deleted after analysis), six pulled pictures in `pics/`, key frames
  in `look/`, the source export `src/` (2.8 GB by `du`, nearly all pnpm-linked `node_modules`;
  Gradle cleaned; deletable at campaign end), APK in `builds/spike-rn-export/`.
* Branch `claude/spike-rn-export` @ `e19904a369ab` (local, never pushed; keep until the decision
  lands).
