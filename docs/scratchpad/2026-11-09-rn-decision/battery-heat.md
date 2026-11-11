# Battery and heat on the Galaxy

2026-11-11, Claude (lane battery-heat). Device: the Galaxy (S21 FE, Android 16, 120 Hz). Arms: RN
best v2 with the perf probe **off**, `art.splotch.app.dev.bestplain` (`claude/best-rn` @
`e703b8b79`), and shipping best `art.splotch.app.baseline.best` (`claude/best-shipping` @
`f9d3b6ff6`, not a probe build). One extra run on the RN probe build `art.splotch.app.dev.best`
(same commit, probe on) sizes the probe's own share, if time allows. The iPad half waits for the
owner (the iPad is locked). Raw data, scripts and logs: `battery-heat/` in the campaign scratch
folder (rig file).

Question: for the same use, does either arm cost clearly more CPU, GPU, power or heat, and is any
gap a floor? Codex round 3 named this one of three unchecked items that could flip the call: RN
presents at ~116 fps on the iPad against shipping's ~51, so it may cost more power.

## What each app does when nothing changes (code read, before measuring)

RN paths are in `claude/best-rn`; shipping paths are under `web/src/lib/` in `claude/best-shipping`
unless they name another folder.

| State              | RN best                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Shipping best                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idle, in front     | Nothing redraws: Skia views paint only on request (`src/drawing/SkiaInk.tsx:229-252`). Stock React Native re-posts its timer frame callback on every vsync while in front (`node_modules/react-native/ReactAndroid/.../JavaTimerManager.kt:317`): ~120 UI-thread wake-ups a second that draw nothing. With Sound on (the default), three pencil players and a Clear player are prepared after first paint (`src/product/useDrawingProduct.ts:57-66`); each expo-audio player runs a 500 ms main-thread status loop for its whole life, paused or not (`node_modules/expo-audio/android/.../BaseAudioPlayer.kt:54-70`): ~8 wake-ups a second. One-shot purges: GPU cache 2 s after the last frame (the Skia patch), allocator 2 s after Clear or Undo (`src/drawing/nativeHeapPurge.ts:6-17`) | No `requestAnimationFrame` loop and no `setInterval` on native. One `AudioContext` is created at boot when Sound is on (`audio/drawingSound.ts:46-50`, warmed at idle `:104-111`) and resumed on gestures (`:140`, `audio/clearSound.ts:93`). Nothing ever suspends or closes it: stopping a sound only stops its source (`audio/drawingSound.ts:193-220`), and so does turning Sound off (`DrawingCanvas.svelte:152-155`). Capacitor lets media play without a gesture (`Bridge.java:592`). So the audio output may run, playing silence, from launch |
| Idle, busy picture | No extra periodic work; more tiles and up to 24 MB of Undo snapshots held (`src/drawing/skiaInkLayer.ts:30-36`). An eraser lift starts one blank-page scan after 400 ms, retried every 400 ms only while blocked (`src/drawing/inkVisibility.ts:37-67`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | A history fold every 1.5 s after strokes, until history is back within Undo depth (`drawing/tiledRenderer.ts:306-315`): finite. A one-shot GPU read-back 400 ms after an eraser lift (`drawing/idleEmptyScan.ts:30-40`)                                                                                                                                                                                                                                                                                                                                |
| Drawing            | One JS event per touch frame (~120 a second, `SplotchPaperInput.kt:30-71`). Each packet is painted on the JS thread into a CPU raster, its changed tiles re-snapshot and handed to the view (`src/drawing/SkiaInk.tsx:259-308`, `src/drawing/skiaInkLayer.ts:67`). Pointer halos redraw a second Skia canvas every vsync while a finger is down and 140 ms after (`src/drawing/PointerHalos.tsx:21-33,68-72`). The sound volume ramps through a 16 ms timer (`src/platform/drawingAudio.ts:22-57`). No frame-rate cap anywhere                                                                                                                                                                                                                                                               | Canvas 2D (no WebGL), coalesced pointer events; one animation frame per display frame draws the queued points (`drawing/strokeRasterQueue.ts:144-150`). Halos move every frame. Ink under the toolbar re-runs its `backdrop-filter` blurs. No frame-rate cap anywhere                                                                                                                                                                                                                                                                                  |
| Backgrounded       | Audio players released (`src/product/useDrawingProduct.ts:144-160`); React Native removes its frame callback (`JavaTimerManager.kt:72-74`). A coloring download, if one is pending, carries on as a WorkManager job (`SplotchLibraryDownloads.kt:46-52`); on a fresh install it starts after 3 strokes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Capacitor's `KeepRunning` defaults to true (`Bridge.java:463-465`), so `webView.onPause()` and the timer pause are never called; nothing listens for `pause`, and `visibilitychange` does not fire on HOME (`engineListeners.ts:73-77`). JS timers and the `AudioContext` may keep running                                                                                                                                                                                                                                                             |
| Screen             | Kept on after the first touch on the paper (expo-keep-awake, `src/platform/AppSurfaceRoot.tsx:19-21`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | A Screen Wake Lock after the first pointer-up (`boot/wakeLock.ts:6-44`), if the WebView offers the API (unverified)                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Network            | Event-driven listeners only; no timers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Event-driven; the hourly update check is web-only. No timers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

The RN perf probe adds per-packet counters, a Hermes heap-stats read per hand-off and one log line
per stroke (`src/drawing/perfCohort.ts:290-297,344`); no idle timers. The plain build has none of
it.

**Suspects to check by measurement:**

1. Shipping keeps an audio output running while idle, in front and perhaps in the background. Seen
   on the iPad (`ipad-best-retest.md`) and as Android's AAudio stream reporting `started` while idle
   and muted (`journeys-android.md`, J15).
2. Shipping's WebView is never paused in the background.
3. RN's paused audio players wake the main thread ~8 times a second; stock React Native wakes it at
   the display rate.
4. Both apps keep the screen on, so screen power is the same in both; here Stay awake keeps it on
   anyway.

## Pre-registered plan (written 2026-11-11 06:40 EST, before any measurement)

### Keeping the arms comparable

* **Device settings** are recorded at the start and end of every run and never changed: brightness
  level and mode, refresh-rate mode, Stay awake, battery level and status, media volume and ringer.
* **In-app settings match:** Sound on at the same volume, drawing sound on, Auto-Save on Delete off,
  AI off, tool drawer expanded, Pen, Purple. If Auto-Save is found on in either app, stop and ask.
  RN plain is a fresh install: before any run it gets a first-use pass that is not measured (six
  strokes, so its one-time coloring download starts, then a wait until its job is gone from the job
  scheduler), and its settings are matched through its own Settings screen.
* **Same input in both arms:** one fixed uinput plan (below), timed on the phone.
* **Cold start per run** (`am start -S`, which stops only the app under test).
* **Order:** launcher baseline L0, then RN 1, shipping 1, shipping 2, RN 2 (A B B A), then launcher
  baseline L1, then the optional RN probe run.
* **Same starting temperature:** before every run the phone rests on the launcher until the battery
  is within +0.5 °C of the reference and the chosen CPU, GPU and skin sensors within +1.5 °C. The
  reference is the launcher temperature before L0, once it stops falling (under 0.2 °C in 4 min).
  Cap 20 min; a run that starts at the cap says so.
* **Locks:** `dev-galaxy.lock` for settle plus run, `rig.lock` for the run, released in reverse, 60
  s before the next acquire.

### Phases (one run ≈ 29 min)

| Phase   | Length | What happens                                                                                  |
| ------- | ------ | --------------------------------------------------------------------------------------------- |
| P0      | 2 min  | Fresh launch, untouched (starts 30 s after launch)                                            |
| Warm-up | 15 s   | First touch: two Crayon scribbles, two Pen lines, Clear. Not measured                         |
| P1      | 5 min  | Blank page in front, no input                                                                 |
| P2      | 10 min | Scripted drawing, `draw10`                                                                    |
| P3      | 5 min  | The busy picture in front, no input                                                           |
| P4      | 5 min  | HOME: launcher in front, app in the background                                                |
| Cleanup | 20 s   | Back to the app, Clear, Pen, HOME. Leaves the app as found (cleared page, Pen, Purple)        |
| L0, L1  | 5 min  | Launcher baselines with the same counters and dumps, so each phase can be read above the idle |

**`draw10`, a toddler-like 10 minutes:** 600 s, 168 gestures, the finger down 46% of the time. 70
scribbles (1.2–3.5 s zigzags inside a patch, 1.5–3 px/ms), 41 long lines (2–4 waypoints across the
paper, 0.8–1.6 px/ms), 29 loops, 26 bursts of 2–6 dots, 2 Undo taps. Pauses of 0.3–2 s, and 10% of
them 3–7 s. Crayon for 0–150 s, Pen 150–300 s, Clear at 300 s, Crayon 300–450 s, Pen 450–600 s. One
finger, 8 ms samples, Android's `uinput` tool as a virtual touchscreen (never `adb shell input` for
strokes).

### Metrics

Each source is checked for readability first. Anything this unrooted phone does not expose is listed
in the results as not measured.

| Metric                  | Source                                                                                                                                                                                                         | When                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| App CPU time            | `/proc/<pid>/stat` user + system time of every process the app owns. RN: its one process. Shipping: the app process, which also hosts WebView's GPU thread, plus WebView's sandboxed renderer bound by the app | Phase start/end, and 1 Hz |
| CPU by thread           | `/proc/<pid>/task/*/stat`                                                                                                                                                                                      | Phase start/end           |
| System side             | SurfaceFlinger, the composer HAL, audioserver, the audio HAL, system_server; whole-device busy CPU (`/proc/stat`); CPU-frequency residency per cluster (`time_in_state`)                                       | Phase start/end           |
| GPU busy                | `/sys/class/kgsl/kgsl-3d0/` `gpubusy`, `gpu_busy_percentage`, `gpuclk`                                                                                                                                         | 1 Hz                      |
| Frames                  | `dumpsys gfxinfo` total frames (both arms' ink goes through the app's HWUI frames: RN's Skia TextureView, shipping's WebView draw functor); `dumpsys SurfaceFlinger --latency` for the app's layer             | Phase start/end           |
| Display refresh rate    | `dumpsys display` and SurfaceFlinger                                                                                                                                                                           | Phase end                 |
| Heat                    | `dumpsys thermalservice` (sensor temperatures and thermal status); every thermal zone every 10 s; battery temperature at 1 Hz                                                                                  | as stated                 |
| Net battery current     | `current_now` at 1 Hz, against the launcher baselines. The phone is on USB at 100%, so the charger probably powers it and this may stay flat; the results say so if it does                                    | 1 Hz                      |
| Energy by power rail    | `dumpsys powerstats` energy meters, if this phone has any                                                                                                                                                      | Phase end                 |
| Audio, wake locks       | `dumpsys media.audio_flinger` (is the output in standby), `dumpsys audio` (players per app), `dumpsys power` (wake locks, AudioMix). P4 adds process state, jobs and alarms                                    | Phase end                 |
| Memory (orchestrator's) | `dumpsys meminfo`: total PSS and RSS, Graphics, GL and EGL mtrack, native and Java heap; for shipping, the renderer too                                                                                        | Phase end                 |

Each phase's counter window excludes the dumps: the end counters are read before the dumps, the next
start counters after them.

**Not measurable here:** drain on battery power (the phone stays on USB; batterystats does not count
while charging; battery-service overrides are off limits), and the background with the screen off
(Stay awake keeps it on, and a power-key sleep could lock the phone). The audio and wake-lock state
in P4 stands in for the screen-off case, as an inference.

### Decision rules (fixed before measuring)

Each arm's value is the mean of its two runs. A severity is called only when both runs of each arm
fall on the same side of the bound; otherwise the result is "noisy" and reported as a range.

| Finding                                                                                                             | No signal                                            | Minor                                                                          | Major                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drawing (P2): app CPU-seconds per minute plus GPU busy-seconds per minute (GPU busy fraction × 60), arm against arm | within 20%                                           | 20–50% more                                                                    | ≥50% more                                                                                                                                                                      |
| Drawing heat: rise of the hottest CPU/GPU/skin sensor over P2, arm against arm                                      | under 1.0 °C apart                                   | 1.0–2.0 °C                                                                     | ≥2.0 °C, or one arm reaches a higher thermal status in both its runs and the other in neither                                                                                  |
| Idle in front (P0, P1, P3): app CPU                                                                                 | both ≤0.6 CPU-s/min (1% of one core)                 | one arm over 0.6 and over 2× the other                                         | over 6 CPU-s/min (10% of one core)                                                                                                                                             |
| Idle in front: frames                                                                                               | ≤60 frames/min                                       | –                                                                              | over 60 frames/min sustained: the app renders while nothing changes                                                                                                            |
| Idle in front: audio                                                                                                | output in standby                                    | the app keeps an audio output active (tens of milliwatts against a lit screen) | –                                                                                                                                                                              |
| Background (P4, after its first 30 s)                                                                               | ≤0.6 CPU-s/min, no active audio output, no wake lock | –                                                                              | over 0.6 CPU-s/min, an active audio output, or a wake lock that would keep a screen-off phone awake (a drain in a pocket; inferred, since the screen-off case is not measured) |

**Classes (bones):**

* **A drawing gap** is split by frames. If CPU and GPU per frame are within 20%, the gap is frame
  rate: fixable by a frame cap, at the cost of smoothness. That is a tradeoff, not a defect, and
  RN's higher frame rate is a plausible user benefit. If the gap holds per frame and the per-thread
  breakdown puts it in the architecture's core path (RN: raster on the JS thread and texture upload;
  shipping: WebView's renderer, GPU thread and compositor), it is a **floor candidate** against that
  arm. If it sits in an app-level hotspot with a known small change (halos, sound timers), it is
  **unclear** (likely fixable, unvalidated).
* **Heat** takes the class of the drawing gap it follows.
* **An idle or background cost** traced to a code path with a known small change (the shipping audio
  context never suspended, the WebView never paused, RN's paused players polling) is **unclear**
  (likely fixable; no fix is built in this lane). It is a floor only if the framework forces it
  (stock React Native's per-vsync timer callback, WebView's own idle work) and it is at least minor.
* **Memory** is reported, not classed here. The probe run answers how much of RN's memory is the
  probe's own.

**What could flip the call:** the verdict leans shipping, so only a major, floor-class cost in
shipping (drawing CPU/GPU or heat) moves it toward RN. An RN-side cost of the same kind hardens the
current call. A fixable idle bug on either side adds to that arm's repair bill only.

## Tools

In `battery-heat/` (campaign scratch folder): `bin/gen.py` with `bin/mt.py` (the uinput plans in
`scripts/`), `bin/sampler.sh` and `bin/counters.sh` (run on the phone), `bin/bh.zsh` (helpers),
`bin/run.zsh` (one run), `bin/baseline.zsh`, `bin/settle.zsh`, `bin/batch.zsh` (locks, settle,
capture), `bin/probe.zsh` (readability check), `bin/score.py` (per-phase numbers).

Added in phase 2: `bin/table.py` (tables from `score.json`), `bin/series.zsh` (runs batches in
order), `bin/diag.zsh` + `bin/idlediag.py` (the idle traces below). Key tables and frames:
`battery-heat/keep/`.

## Results (2026-11-11 08:19–11:56 EST)

### As run

* **Order and start temperatures** (battery / xo-therm board sensor, °C): L0 08:47 (28.2 / 29.9),
  RN1 08:53 (27.8 / 29.6), SH1 09:24 (28.7 / 30.5), SH2 10:00 (28.7 / 30.5), RN2 10:38 (28.7 /
  30.5), L1 11:12 (28.7 / 30.5), probe run PR1 11:25 (28.6 / 30.6). Thermal status 0 at every
  reading.
* **Device:** battery 100%, status Full, on USB; Stay awake on; brightness automatic (level 97 of
  255 at the start, driven by room light, not controlled); media volume 4 of 15; ringer Vibrate;
  Nova launcher. The display policy allows only 120 Hz (`mDisplayModeSpecs` 120–120), so the refresh
  rate was 120 Hz in every phase and is not an arm difference.
* **In-app settings matched** (screenshots in `battery-heat/dev/setup/`): Sound on at 50%, drawing
  and deleting sounds on, Auto-Save on Delete off, AI off, Night Mode off, portrait lock, drawer
  expanded, Pen, Purple. RN plain's first launch showed no first-run screen; its drawer started
  collapsed and was expanded through the UI; its four coloring-download jobs had finished by
  08:22:53, before any run. The probe build `.dev.best` was found at Sound 33% and left so (volume
  changes no CPU path).
* **Deviations from the plan:** (1) Before L0 the battery was still cooling ~0.1 °C/min when the
  20-min settle cap hit, so the reference was set by hand to that reading (28.2 / 29.9). Every later
  run met it within the bounds; RN1 started 0.9 °C cooler than the rest (the A B B A order spreads
  that). (2) The battery's sysfs files are closed to the shell, so battery temperature comes from
  thermal zone `battery` and the settle check used `xo-therm`. (3) After SH1 showed device-wide CPU
  it could not attribute, an every-process scan was added to the boundary counters from SH2 on; RN1
  and SH1 lack it. (4) Two 5 s idle traces (one per arm, `atrace`) ran after the counted runs to
  attribute the idle costs. Tracing adds overhead, so they explain the cost but do not measure it.

**Not measured.** No power number: the battery current files are permission-denied, the battery
service reports `current now: 0` with the battery full on USB, and `dumpsys powerstats` has no
energy meters on this phone. CPU time, CPU-clock residency, GPU busy and temperatures stand in. GPU
clock (`gpuclk` denied; the devfreq clock was read instead). The background with the screen off.
Display power (same brightness policy, fixed 120 Hz, and both apps keep the screen on). The iPad.

### Numbers by phase

Each arm's value is the mean of its two runs, with the runs in brackets (RN1, RN2 / SH1, SH2).
CPU-s/min = CPU-seconds per minute (60 = one core flat out). "System" = SurfaceFlinger, the composer
HAL, audioserver, the audio HAL and system_server. "Device above launcher" = whole-phone busy CPU
minus the mean of the two launcher baselines (11.8 CPU-s/min).

| Phase                 | Metric                       | RN plain                   | Shipping                                                                    |
| --------------------- | ---------------------------- | -------------------------- | --------------------------------------------------------------------------- |
| P0 launch, untouched  | App CPU-s/min                | 11.5 (11.5, 11.4)          | 3.0 (3.2, 2.7)                                                              |
|                       | SurfaceFlinger CPU-s/min     | 7.5                        | 0.1                                                                         |
|                       | Frames/min                   | 0                          | 0                                                                           |
| P1 blank page, idle   | App CPU-s/min                | 11.3 (11.3, 11.3)          | 4.0 (4.2, 3.9)                                                              |
|                       | SurfaceFlinger CPU-s/min     | 7.5                        | 0.07                                                                        |
|                       | Device above launcher        | +11.4 (11.1, 11.6)         | +0.0 in SH2 (SH1: +15.1, an unattributed transient before the scan existed) |
|                       | Frames/min; GPU busy         | 0; 0%                      | 0; 0%                                                                       |
| P2 drawing, 10 min    | App CPU-s/min                | 50.0 (50.0, 50.1)          | 58.2 (58.4, 58.1): app 29.4 + renderer 28.8                                 |
|                       | GPU busy                     | 14.6% (14.7, 14.4)         | 15.3% (16.0, 14.5)                                                          |
|                       | **App CPU + GPU, s/min**     | **58.8** (58.8, 58.8)      | **67.4** (68.0, 66.8): +15%                                                 |
|                       | System CPU-s/min             | 44.7 (SurfaceFlinger 19.3) | 36.7 (SurfaceFlinger 16.2)                                                  |
|                       | **Device above launcher**    | **100.3** (101.3, 99.2)    | **88.5** (86.4, 90.6): RN +13%                                              |
|                       | Frames/min                   | 3,510                      | 3,480                                                                       |
| P3 busy picture, idle | App CPU-s/min                | 11.1 (11.1, 11.0)          | 3.1 (3.3, 3.0)                                                              |
|                       | SurfaceFlinger CPU-s/min     | 7.5                        | 0.14                                                                        |
| P4 background (HOME)  | App CPU-s/min                | 0.05 (0.05, 0.05)          | 1.9 (1.9, 1.9), 1.7 of it in the renderer                                   |
|                       | Audio output; app wake locks | none; none                 | none; none                                                                  |

Both arms present at the display's 120 Hz while a finger moves: ~3,500 frames a minute is ~58 per
second averaged over a session with the finger down 46% of the time. On this phone RN's frame-rate
lead seen on the iPad (~116 vs ~51 fps) does not exist, so drawing compares like for like.

**Where the drawing CPU goes** (CPU-seconds in P2, mean of the two runs). RN: UI thread 196,
RenderThread 127, JS thread 104, ExoPlayer + MediaCodec (the pencil sound) 32. Shipping: renderer
main thread (`CrRendererMain`) 161, audio thread (`AudioOutputDevice`) 74, RenderThread 73, app UI
thread 70, WebView GPU thread 52, compositor 47. RN's system side is larger (SurfaceFlinger +3.1,
system_server +2.6, the audio HAL +1.3 CPU-s/min), which is why the device-wide total flips the
order.

**Heat in P2** (rise from the end of P1 to the end of P2, °C; thermal HAL sensors, plus the
`xo-therm` zone):

| Sensor                                                    | RN plain (RN1, RN2) | Shipping (SH1, SH2) | Shipping − RN, mean     |
| --------------------------------------------------------- | ------------------- | ------------------- | ----------------------- |
| AP (the hottest HAL sensor)                               | 6.5, 6.4            | 9.3, 7.7            | **+2.1** (+1.2 to +2.9) |
| SKIN                                                      | 3.6, 3.3            | 4.3, 4.5            | +0.95                   |
| Battery                                                   | 3.1, 2.9            | 3.7, 3.8            | +0.75                   |
| xo-therm                                                  | 4.4, 4.4            | 6.0, 5.8            | +1.5                    |
| AP at the end of P2                                       | 36.0, 36.4          | 39.0, 37.7          |                         |
| Thermal status                                            | 0                   | 0                   |                         |
| Mid CPU cluster in the top third of its clocks (of 600 s) | 54 s, 51 s          | 180 s, 183 s        |                         |

Shipping runs warmer although its device-wide CPU time is lower: it holds the mid CPU cluster at
high clocks about 3.5 times as long (one busy renderer main thread), and higher clocks cost more
energy per cycle.

**Memory** (`dumpsys meminfo` total PSS at the end of each phase, MB; shipping = app + WebView
renderer):

| Arm                  | P0       | P1       | P2 (after drawing) | P3       | P4 (background) |
| -------------------- | -------- | -------- | ------------------ | -------- | --------------- |
| RN plain (RN1, RN2)  | 228, 255 | 322, 339 | 410, 426           | 413, 421 | 329, 346        |
| RN probe build (PR1) | 213      | 315      | 413                | 405      | 327             |
| Shipping (SH1, SH2)  | 194, 249 | 236, 272 | 276, 279           | 281, 279 | 188, 213        |

RN's Graphics share at the end of P2 is 103–104 MB (EGL 90), its native heap 113–115 MB; shipping's
app holds 58–60 MB Graphics and its renderer 116–123 MB.

**The probe's own share** (PR1, `.dev.best`, one run): P2 app CPU 50.2 CPU-s/min against plain's
50.0 (JS thread 107 against 104 CPU-s), idle 11.2–11.5 like plain, PSS after drawing 413 MB against
plain's 410–426, and 327 MB after HOME against plain's 329–346. Its AP sensor rose 5.2 °C in P2
(plain 6.4–6.5; it started 0.1 °C warmer, one run). The probe costs nothing measurable here, so it
does not explain RN's memory overhead.

### What the idle cost is (diagnostic traces, 5 s each, 60 s after the warm-up)

* **RN:** the UI thread runs `Choreographer#doFrame` 120 times a second with only its animation
  stage (no layout, no draw) and requests the next vsync each time. SurfaceFlinger's `app` and
  `TimerDispatch` threads wake 120 times a second to deliver it. No frame is produced; the JS thread
  and the GPU stay idle. Two stock React Native 0.88 loops re-post themselves every vsync while the
  app is resumed: the Fabric event dispatcher's frame callback (trace section
  `BatchEventDispatchedListeners`,
  `node_modules/react-native/ReactAndroid/src/main/java/com/facebook/react/uimanager/events/FabricEventDispatcher.kt:147-176`)
  and the timer manager's (`.../modules/core/JavaTimerManager.kt:317`). Not Splotch code, not the
  probe, not Skia (its native code has no frame loop).
* **Shipping:** two WebView renderer thread-pool threads wake ~790 times a second (2.6% + 2.2% of a
  core in the trace); the UI thread, renderer main thread and SurfaceFlinger stay asleep. The audio
  log shows the WebView's AAudio stream opened 4 s after launch (the boot warm-up) and released
  35–48 s after the last sound, and every output thread was in standby at every phase end. So the
  hardware audio path does go quiet on Android; the remaining wake-ups are most likely Chromium
  clocking the never-suspended `AudioContext` into a silent sink (inference: the cost appears before
  the first touch too, and the code never suspends the context,
  `web/src/lib/audio/drawingSound.ts:193-220`).

### Findings and classes (pre-registered rules)

| Finding                                                                                                                                                                       | Arm      | Severity (rule)                                                                                                                                                                                | Class                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle in front costs ~11 app CPU-s/min plus about 7.5 in SurfaceFlinger (about +11 device-wide, about a fifth of one core), with no frames: the UI thread wakes on every vsync | RN       | **major** (over 6 CPU-s/min)                                                                                                                                                                   | **floor candidate** by the pre-registered rule: stock React Native forces it. A patch to React Native's two loops (post only when events or timers are pending) could remove it; unbuilt, a core patch with upkeep, so it may become fixable |
| Idle in front costs ~3–4 app CPU-s/min in the WebView renderer (~790 wake-ups/s); hardware audio output released after 35–48 s                                                | shipping | minor (over 0.6, under 6, not over 2× RN)                                                                                                                                                      | **unclear, likely fixable**: suspend the `AudioContext` when idle or when Sound is off; unvalidated                                                                                                                                          |
| Background keeps 1.9 CPU-s/min going in the WebView renderer (no audio output, no wake lock)                                                                                  | shipping | **major** by the pre-registered line (over 0.6). Softer than written: with no wake lock held, a screen-off phone can still sleep, so it costs only while the phone is awake for something else | **unclear, likely fixable**: suspend the `AudioContext` on pause, or let Capacitor pause the WebView (`KeepRunning` false); unvalidated                                                                                                      |
| Background                                                                                                                                                                    | RN       | no signal (0.05 CPU-s/min; audio released)                                                                                                                                                     | –                                                                                                                                                                                                                                            |
| Drawing CPU + GPU                                                                                                                                                             | both     | **no signal**: shipping +15% counting the app, RN +13% counting the whole phone; frames equal                                                                                                  | –                                                                                                                                                                                                                                            |
| Drawing heat: shipping's AP sensor rises 1.2–2.9 °C more (mean +2.1), skin +0.95, battery +0.75; no thermal-status change                                                     | shipping | **noisy, minor to major**: the two shipping runs fall on either side of the 2 °C line                                                                                                          | **unclear**: tracks shipping's longer high-clock residency on the mid CPU cluster; whether app-side changes lower it is untested                                                                                                             |
| Memory after a 10-min session: RN ~418 MB, shipping ~278 MB (both settle back after HOME: 338 vs 200)                                                                         | RN       | reported (feeds `rn-memory-bones.md`)                                                                                                                                                          | the probe is not the cause                                                                                                                                                                                                                   |

### State left behind

* The Galaxy, 08:19–11:57 under `dev-galaxy.lock` (rig lock per run).
  `art.splotch.app.dev.bestplain` was first launched by this lane (installed by the orchestrator).
  All three apps used here (`.dev.bestplain`, `.baseline.best`, `.dev.best`) are on a cleared page,
  Pen, Purple, with Auto-Save on Delete off and AI off; screenshot
  `battery-heat/keep/end-montage.png`. Their settings are as found (`.dev.best` Sound 33%), except
  `.dev.bestplain`'s drawer, expanded through its UI. Launcher in front.
* No device, display, battery or accessibility setting changed; no Save, so no new gallery pictures;
  no install, uninstall or reboot. The lane's on-device folder `/data/local/tmp/bh` was deleted. The
  store app and every other build were never touched.

## Could this flip the decision?

No. On the Galaxy neither arm has a drawing cost that clears the 20% line, and neither reaches a
higher thermal status in 10 minutes of toddler drawing. Both present at 120 Hz here, so this phone
cannot test the iPad worry (RN at ~116 fps against shipping's ~51); that half waits for the owner.

What it adds to each side:

* **RN:** one floor candidate, against RN: stock React Native wakes the UI thread and SurfaceFlinger
  on every vsync while the app sits in front, costing about a fifth of a core with nothing on screen
  changing. Both apps keep the screen on, and the lit screen likely costs far more than this (not
  measured), so the battery effect is small in absolute terms. It hardens the current call slightly;
  a React Native patch could remove it.
* **Shipping:** a never-suspended `AudioContext` costs ~3–4 CPU-s/min in front and ~1.9 in the
  background, likely a small fix. Its renderer runs the phone 1–3 °C warmer at the SoC while
  drawing, without a thermal-status change; noisy and unclear.

Net: battery and heat on the Galaxy do not move the verdict. The iPad half (ProMotion, RN's higher
frame rate) remains the open part of Codex's flip risk.
