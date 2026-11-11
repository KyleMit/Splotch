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

## Results

Pending: phase 2 waits until the Galaxy is free.
