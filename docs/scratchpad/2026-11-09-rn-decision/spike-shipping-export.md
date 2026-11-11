# Spike: shipping's export stall on Android WebView (floor or fixable?)

2026-11-11, Claude (lane spike-shipping-export, half-day box). Device: the Galaxy (S21 FE, Android
16, Android System WebView). Base: shipping best `claude/best-shipping` @ `f9d3b6ff67d5`. Raw media
and scripts: `spike-shipping-export/` in the campaign scratch folder (rig file).

The finding under test (`stall-ink.md`): strokes started within ~0.5 s of **Save** draw their start
as a straight chord (18/18 at 100 and 300 ms); 8/9 at 100 ms after an auto-saving **Clear**; one ANR
in 69 auto-saving Clears with WebView's GPU thread stuck in the Adreno driver's
`glCopyTexSubImage2D`. atrace: the UI thread sat ~480 ms in `Choreographer#doFrame → draw`, waiting
on `WebViewFunctor::drawGl`, which waited on WebView's in-process GPU thread.

## What shipping's export does on the Galaxy (code read at `f9d3b6ff6`, confirmed by a DevTools trace)

The Galaxy's WebView reports `devicePixelRatio` 3. The live canvas renders at `MAX_RENDER_SCALE` 2
and `currentExportScale()` is 3, so `captureTiledSnapshot` refuses the scale mismatch and every
export takes ADR-0088's **compatibility replay** (ADR-0088: no physical scale-mismatch frame-budget
result). Every Android phone above 2× does the same; only a 2× screen (the iPad) takes the worker
path.

| Step (replay path, every Android phone over 2×)                                                                                                            | Thread    | GPU-thread work                                                                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createStrokeSnapshot`: a full-page (1080 × ~2,200) GPU `OffscreenCanvas` on the page's main thread; base tiles drawn up, every retained op replayed at 3× | page main | **the whole history's raster**, flushed as one command buffer. Each Crayon pass also gets full-page pass-buffer canvases, and `captureUnderSnapshot` copies the target (copy-on-write: `glCopyTexSubImage2D`) |
| `paintExportPaper` (repeat-pattern texture, 'high') onto that canvas                                                                                       | page main | a full-page pattern fill                                                                                                                                                                                      |
| Polaroid preview from the live-tile bitmaps                                                                                                                | page main | small                                                                                                                                                                                                         |
| `createImageBitmap(snapshot)` → PNG worker `drawImage` + `convertToBlob`                                                                                   | worker    | a full-page read-back                                                                                                                                                                                         |
| Blob → data URL → Capacitor `PhotoLibrary` in 256 KB slices (issue 2340)                                                                                   | UI thread | none; 9–14 ms per slice (`androidGallery.ts`)                                                                                                                                                                 |

The worker path (2× screens) instead snapshots the 20 live tiles (`createImageBitmap(tile.canvas)`)
and composes, downscales the polaroid preview ('high' quality: a mipmapped copy) and encodes on a
**GPU-backed** worker `OffscreenCanvas`; all of that also runs on the same GPU thread.

Android WebView has one in-process GPU thread. The WebView's draw functor (`WebViewFunctor::drawGl`
on RenderThread, with the UI thread waiting in `syncAndDrawFrame`) blocks on it every frame, so a
long GPU task freezes the app's UI thread, and touches that arrive meanwhile are batched and their
samples lost (`stall-ink.md`).

**DevTools trace of one Save in base mode** (spike build, `T1f-0`, Chrome trace through the
WebView's DevTools socket, `bin/cdp-trace.mjs`, ~30 s per trace):

| Thread                       | Longest slice at the Save                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| page main (`CrRendererMain`) | `OffscreenCanvasRenderingContext2D::FinalizeFrame` → `RasterCHROMIUM`, 10 ms: the replay canvas's recorded ops handed to the GPU                       |
| `Chrome_InProcGpuThread`     | **one 414.8 ms task**: the page-main command buffer's flush → `RasterDecoderImpl::DoEndRasterCHROMIUM::Flush` 380.5 ms (+ 33 ms deserialising the ops) |
| `RenderThread`               | `DrawFn_DrawGL` **447.7 ms**, 442.8 ms of it in `WaitSyncToken` (waiting for the GPU thread)                                                           |
| PNG worker                   | `CreateViewCommandBuffer` 390 ms (queued behind that task), then `ReadbackImagePixels` 60 ms                                                           |

The trigger is shipping's own code: replaying the whole drawing at export scale on a GPU canvas,
rastered in one flush. Not the PNG encode, not the read-back, not the Capacitor bridge. The same
trace in fix mode: longest GPU-thread task 13.3 ms, longest `DrawFn_DrawGL` at the Save 23.2 ms.

## Change (cheapest credible)

Three small product commits keep every full-page raster off the GPU thread; nothing moves onto the
page's main thread. Local branch `claude/spike-shipping-export` (never pushed), tip
`defac43f2da9f19b1e2ebb8bbf637dd58179a473`, off `claude/best-shipping` @ `f9d3b6ff6`. Product diff
`f9d3b6ff6..d0272e3b9`: 6 files, +89 / −53.

| Commit                                     | What                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ba75119978bdff7f8e9434d5b7b0c874b018dfb0` | **fix 1, CPU export surfaces**: `willReadFrequently: true` on the PNG worker's export and preview `OffscreenCanvas`es (`canvasContextRecovery.ts` takes optional settings, `tiledPngCompositor.ts`, `pngEncoder.worker.ts`). The GPU thread keeps one small read-back per live tile, as separate tasks |
| `079226bf841ae91803e499cd1ff144fb2621112e` | **fix 2, live tiles at every scale** (`engine.ts`, `strokeSnapshot.ts`): no vector replay above the 2× live cap; the CPU worker upsamples the settled 2× tiles to the 3× export. Trades ADR-0088's replay-quality stroke edges for the frame budget (see the picture check)                            |
| `d0272e3b9cbc9c8bbc96eee39cab17e28918f3b4` | **fix 3, preview first**: the worker paints the polaroid preview from the same layers at preview size before the full page, so the CPU compose never delays the picture                                                                                                                                |
| `defac43f2da9f19b1e2ebb8bbf637dd58179a473` | spike only, never lands: app ID `art.splotch.app.baseline.export` (debug key), WebView DevTools on, localStorage `splotch-spike-export=gpu` restores the base export exactly (replay + GPU worker surfaces), per-export timings on `window.__spikeExport`                                              |

Tests: `tiledPngCompositor.test.ts` pins the CPU surfaces and the preview-from-layers (its two cases
fail on the base, negative control run). Gate at the product tip `d0272e3b9`, under `rig.lock`:
`npm run check` 0 errors / 0 warnings, `npm run lint` clean, `vitest src/lib/drawing` 64 files / 490
tests pass. At the spike tip, `exportDrawing.test.ts` fails one preview-callback identity case by
design (the timing wrapper). No E2E run (host-exclusive); ADR-0088's `flows-screenshot`
compatibility spec would need updating for fix 2.

## Pre-registered (written 2026-11-11 ~04:15 EST, before any capture)

Method: `stall-ink`'s, unchanged (`stall-ink/bin/`: uinput two-slot scripts, getevent, screen
recording, `score.py`), on the spike build only, both modes of the one build, on the dense Crayon
picture. Moments **S** (Save) and **C** (Clear with Auto-Save on Delete on), delays 100 / 300 / 700
ms, plus the input-path control **N**.

| Criterion                         | Pass line                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input-path control (fix mode)     | N: 3/3 one-finger and 6/6 two-finger lines inked, on-wave                                                                                                                             |
| Positive control (GPU mode)       | S at 100 + 300 ms still chords in ≥ 4 of 6 lines (one 1f + one 2f run). If not, the rig no longer reproduces the stall and fix results are not attributable                           |
| **Shape after Save (fix mode)**   | S: 9/9 lines on-wave (stall-ink's chord rule: ≥ 80% of inked columns within 7 px of the wave) at 100 **and** 300 ms; none lost/cut                                                    |
| **Shape after Clear (fix mode)**  | C: 9/9 on-wave at 100 and 300 ms                                                                                                                                                      |
| Late                              | no line late ≥ 100 ms vs its warm controls at 300 / 700 ms                                                                                                                            |
| Saved picture                     | same drawing saved in both modes: same size, decodes; no visible difference side by side; mean absolute difference < 1 level/channel and < 1% of pixels off by > 8 levels             |
| Latency                           | polaroid preview ready (export start → preview) median ≤ GPU mode + 50 ms; blob ready median ≤ GPU mode + 250 ms (both off the main thread; the save cooldown is 4 s)                 |
| Trigger removed or only shortened | one atrace of a Save per mode (`stall-ink/bin/run-traced.zsh` method): removed = no UI-thread `doFrame` > 50 ms in the export window; shortened = the longest falls but stays > 50 ms |

Class, decided by those lines:

| Outcome                                                                      | Class                                                                                                             |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Shape lines pass, picture and latency pass                                   | **fixable**, priced below; the sample loss during *any* UI-thread stall stays WebView's floor, the trigger is not |
| Save passes at 300 ms but 100 ms or Clear still chords in ≥ 2 of 9           | **unclear**: trigger shortened, not removed; name the remaining GPU-thread step                                   |
| GPU mode chords and fix mode chords as often, with drawGl waits still ~0.5 s | **floor evidence**: any export read-back of GPU ink holds the WebView frame on this device                        |

The ANR (1 in 69) cannot be re-rated inside the box; the most this lane can say is whether its call
path (`glCopyTexSubImage2D` on the GPU thread during export) is gone from the fix's traces.

### Amendment before any capture (04:25): the Galaxy never takes the worker path

The first functional Save on the spike build (fix 1 only) logged no worker export: the Galaxy is a
3× screen and takes the replay path described at the top, which fix 1 does not touch.

So the change grew by one line before measuring (commit `079226bf8`): the export uses the settled
live tiles at every scale and the CPU worker upsamples them (2× → 3×). The cost is ADR-0088's
deliberate choice: stroke edges come from 2× pixels, not a 3× vector replay. The A/B switch's `gpu`
mode restores the base exactly (replay on mismatch, GPU worker surfaces). The pre-registered lines
stand; the picture check now compares replay against upsampled tiles, so a pixel difference at
stroke edges is expected and is judged by eye as well as by the numbers.

### Amendment before the counted captures (04:30): preview first

A DevTools-traced diagnostic Save on the two-fix build (not a counted capture) put the polaroid
preview 215 ms after export start, because the worker downscaled it from the finished full-page CPU
compose. Fix 3 paints it from the layers first. All counted captures below ran on the three-fix
build (APK sha256 `e626b273…89ed`).

## Results (the Galaxy, spike build `defac43f2`, APK sha256 `e626b273…89ed`, both modes of the one build)

Method: `stall-ink`'s uinput scripts, scorer and chord rule unchanged (`stall-ink/bin/score.py`),
run by this lane's `bin/run.zsh` (stall-ink's `run.zsh` with this package allowed). Mode set through
the WebView DevTools socket before each run. Each cell is 9 probe lines (3 one-finger tries + 3
two-finger tries × 2 fingers), one try per delay per run, three runs per finger count. For Save,
lateness is not scored: the polaroid covers the paper for ~1.4 s (stall-ink's rule); shape is.
"Freeze" = the longest gap between screen-recording frames from the busy release to +1 s (median
frame gap 8.4 ms everywhere).

### Save (S)

| Mode                       | 100 ms                             | 300 ms                             | 700 ms | Freeze after each Save | Preview ready (median, range) | PNG ready (median, range) |
| -------------------------- | ---------------------------------- | ---------------------------------- | ------ | ---------------------- | ----------------------------- | ------------------------- |
| **fix** (18 Saves, 6 runs) | **9/9 on-wave** (on-wave min 1.00) | **9/9 on-wave** (on-wave min 1.00) | 9/9    | **17–42 ms**           | 66 ms (48–81)                 | 331 ms (258–509)          |
| base (6 Saves, 2 runs)     | **0/3 chord**                      | **0/3 chord**                      | 3/3    | **634–651 ms**         | 1 ms (0–4)\*                  | 767 ms (760–775)          |

\* Base hands the polaroid a GPU-deferred bitmap at once; its pixels cannot reach the screen until
the frame freeze ends (~640 ms).

Input-path control (N, fix mode): 9/9 lines inked, on-wave 1.00, lag ≤ 11 ms. Warm controls: every
control line inked in every run (both modes).

Positive control: base mode chords **6 of 6** lines at 100 + 300 ms (pre-registered ≥ 4 of 6), as
`stall-ink.md` found on `.baseline.best` (18/18).

### Clear with Auto-Save on Delete (C)

| Mode                            | 100 ms                                   | 300 ms                                       | 700 ms | Late (vs warm controls) | PNG ready (median, range) |
| ------------------------------- | ---------------------------------------- | -------------------------------------------- | ------ | ----------------------- | ------------------------- |
| **fix** (6 runs, 24 auto-saves) | **9/9 on-wave** (lag ≤ 47 ms)            | **9/9 on-wave** (lag ≤ 14 ms)                | 9/9    | none ≥ 100 ms           | 298 ms (155–447)          |
| base (2 runs, 8 auto-saves)     | **0/3: 3 chord + late** (lag 298–336 ms) | **0/3: 2 chord + late, 1 late** (109–151 ms) | 3/3    | 5 of 6 at 100 + 300 ms  | 431 ms (108–469)          |

Auto-Save on Delete was switched on at 05:51 and off at 06:09, each verified by the switch's pixel
colour and a screenshot. Screen-recording frame gaps are not used for C: after a Clear the page is
static, so a gap there is not a freeze.

### Saved picture (one dense picture, saved in base then fix mode, pulled from the gallery)

| Check                    | Line (pre-registered) | Result                                                                                                                                                                                                                    |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Size, decodes            | same                  | **pass**: both 1080 × 2016 PNG, 2.43 vs 2.48 MB                                                                                                                                                                           |
| Side by side at 1:1      | no visible difference | **pass**: none visible                                                                                                                                                                                                    |
| Mean absolute difference | < 1 level/channel     | **pass**: 0.35                                                                                                                                                                                                            |
| Pixels off by > 8 levels | < 1%                  | **fail: 3.1%** (max 91), all on stroke edges and crayon grain. At 4× zoom Pen edges are softer and Crayon grain coarser: fix 2's 2× tiles upsampled, against the base's 3× replay. By design of fix 2, not a defect in it |

### Latency (export start → picture; both off the page's main thread)

| Measure                       | Base                                                                   | Fix                                  | Line                                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Polaroid preview handed over  | 1 ms median (0–4), but its pixels wait out the 634–651 ms frame freeze | 66 ms median (48–81), frames flowing | ≤ base + 50 ms: **fails as written** (+65 ms against a number nobody sees); passes against what reaches the screen (~640 ms → ~75 ms) |
| PNG ready (Save)              | 767 ms (760–775)                                                       | **331 ms** (258–509)                 | ≤ base + 250 ms: **pass** (faster)                                                                                                    |
| PNG ready (auto-saving Clear) | 431 ms (108–469)                                                       | **298 ms** (155–447)                 | pass                                                                                                                                  |

### Trigger removed or only shortened

| Evidence (one Save each)                                                                    | Base                                                      | Fix                                                                                                               |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| DevTools trace (`T1f-0`): longest GPU-thread task / `DrawFn_DrawGL` at the Save             | 414.8 ms / 447.7 ms                                       | 13.3 ms / 23.2 ms                                                                                                 |
| atrace (`T1f-0`, `stall-ink`'s `run-traced.zsh`): longest UI-thread `Choreographer#doFrame` | **439 ms** (`postAndWait` 437, RenderThread `drawGl` 442) | **88 ms** (`postAndWait` 84, `drawGl` 87); `kswapd` busy 452 ms alongside, the GPU thread's longest stretch 51 ms |
| that run's 300 ms probe                                                                     | chord (on-wave 0.75)                                      | **chord**, mild: one 57 px straight run, on-wave 0.90                                                             |
| Untraced: freeze after each Save (screen recording)                                         | 634–651 ms (6 Saves)                                      | 17–42 ms (18 Saves)                                                                                               |

By the pre-registered line the trigger is **shortened, not removed**: the single 0.4 s GPU task is
gone, but the fix still sends small GPU work during an export (20 tile snapshots on the page, the
worker's per-tile read-backs for the preview and again for the page unless Chromium reuses them, not
checked, and the preview's upload), and under memory pressure that work and RenderThread itself
stretch (RenderThread was runnable 363 ms in that window). atrace itself adds that pressure (its
kernel buffers are 64 MB per CPU, and `kswapd` ran 452 ms in that window), so 88 ms is a
loaded-device worst case; the same pressure appears on a real phone with other apps resident
(`stall-ink`'s ANR showed 406 major faults and 95% kernel time). Untraced, no Save froze the screen
for more than 42 ms.

## Verdict by the pre-registered lines

| Criterion                    | Result                                                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input-path control           | **pass**: 9/9 inked, on-wave                                                                                                                      |
| Positive control (base mode) | **pass**: 6/6 chords at 100 + 300 ms after Save                                                                                                   |
| Shape after Save             | **pass**: 9/9 on-wave at 100 and at 300 ms (and 700)                                                                                              |
| Shape after Clear            | **pass**: 9/9 on-wave at 100 and at 300 ms (and 700)                                                                                              |
| Late                         | **pass**: no Clear line late ≥ 100 ms                                                                                                             |
| Saved picture                | 3 of 4 pass; **pixels off by > 8 levels 3.1% (line < 1%) fails**, on stroke edges only: fix 2's 2× tiles against a 3× replay                      |
| Latency                      | PNG **pass** (faster: 331 vs 767 ms); preview **fails as written** (+65 ms) against a base number that never reaches the screen                   |
| Trigger removed or shortened | **shortened**: worst UI-thread frame at a Save 439 → 88 ms under atrace (one mild chord in that traced run); untraced, freeze ≤ 42 ms in 18 Saves |

**Class: fixable, with a price.** The trigger is shipping's own export code, not WebView: replaying
the whole drawing at export scale on a GPU canvas, which Android WebView rasters as one ~0.4 s task
on the GPU thread that every frame waits on. The cheapest change removes every chord the stall lane
found (36/36 lines on-wave at 100 and 300 ms, against 12 of 12 bent (11) or late (1) in base mode on
the same build) and makes the PNG faster. It does not pass every line as written: the saved strokes
come from 2× pixels (visible only zoomed), and a shorter residual stall (88 ms) remains under heavy
memory pressure. What stays a WebView floor is unchanged and is not the trigger: during any
UI-thread stall, WebView drops the touch samples; with this fix no natural moment measured here
stalls the UI thread for more than ~42 ms untraced.

**The ANR** (1 in 69 auto-saving Clears, GPU thread stuck in `glCopyTexSubImage2D`) sits on the
replay path: the full-page GPU canvas, its Crayon pass copies and copy-on-write snapshots. The fix
path creates no full-page GPU surface, so that call path is gone from its traces (the DevTools trace
shows no GPU task over 13.3 ms). Its rate on the fix is not re-rated: that needs the 200-export
soak.

## Price (production-quality landing)

| Item                                                                                                                                                                                                                                                      | Agent-days |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Fixes 1 + 3 hardening: context-loss path on CPU surfaces, worker tests for preview-first ordering                                                                                                                                                         | 0.25       |
| Fix 2 as built: ADR-0088 amendment (live tiles at every scale; replay only without Worker/OffscreenCanvas or with a pointer down), `flows-screenshot` compatibility E2E update, a unit test for the choice, docs                                          | 0.5        |
| Residual: read each tile back once and reuse it for preview and page; re-measure under load                                                                                                                                                               | 0.25       |
| Galaxy validation on the landed build: `stall-ink` S/C rerun plus a 200-export soak for the ANR rate                                                                                                                                                      | 0.5        |
| iPad (WebKit) check: the 12.9" already takes the worker path (2× screen), so fix 1 changes WebKit's worker compose (2,564 × 1,868). Rerun ADR-0088's frame-bound harness, preview and PNG times, memory; gate CPU surfaces to Android if WebKit regresses | 0.5        |
| **Total**                                                                                                                                                                                                                                                 | **≈ 2**    |
| Only if the owner wants 3× replay-quality stroke edges kept: replay the ops in the worker on a CPU surface (port `renderOp` and the Crayon pass buffers, which make DOM canvases per target). Unbuilt                                                     | + 2–3      |

**Could this flip the decision?** No. It moves shipping's Save/Clear chord from "unclear" to
"fixable, ~2 agent-days": a slip in shipping's own export path, not a WebView floor. The WebView
floor underneath (sample loss during any UI-thread stall) stays, now with no measured natural
trigger over ~42 ms on the Galaxy. The ANR stays a flag until a soak on the fixed build rates it.

## State left behind

* **The Galaxy**: `art.splotch.app.baseline.export` installed (spike tip `defac43f2`, APK sha256
  `e626b273…89ed`), left on a cleared page, Pen, Purple, Auto-Save on Delete **off** (on
  05:51–06:09, verified by screenshot), A/B switch on fix mode, launcher in front. Its WebView
  DevTools socket is open in this build only. Held under `dev-galaxy.lock` per batch (`rig.lock` for
  every capture), 04:16–06:24. The store app, `.baseline.best`, `.baseline.main` and every RN build
  untouched.
* **Gallery**: 62 new pictures owned by the spike package (MediaStore ids 1000001174–1000001615, not
  contiguous) plus one warm-up Save at 04:21. Nothing deleted.
* **Code**: worktree `.claude/worktrees/spike-shipping-export`, local branches
  `claude/spike-shipping-export` (tip `defac43f2`), `claude/spike-shipping-export-v1` and `-v2`
  (earlier spike-only commits, superseded). Never pushed. Add to campaign-end cleanup.
* **Raw**: `spike-shipping-export/` in the campaign scratch folder, ~50 MB: scores, screenshots,
  export timings, trace summaries (`runs/*/gputop.txt`, `doframes.txt`, `stalls-save.txt`), the
  picture pair and its zoom crops (`pic/`). Recordings, the two ~180 MB DevTools traces and the two
  ~0.4 GB atrace dumps were deleted after scoring.
