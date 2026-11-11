# Export soak: a rate for shipping's export hang on the Galaxy

2026-11-11, Claude (lane export-soak). Device: the Galaxy (S21 FE, Android 16, 120 Hz, WebView 137).
Arms, best versions as installed by the best-versions lane (not reinstalled): RN
`art.splotch.app.dev.best` (`claude/best-rn` @ `e703b8b79a08`, v2 probe Release) and shipping
`art.splotch.app.baseline.best` (`claude/best-shipping` @ `f9d3b6ff67d5`). Raw logs and tools:
`export-soak/` in the campaign scratch folder (rig file).

Question: the stall lane saw shipping best hang once and get ANR-killed during an auto-saving Clear
(WebView's GPU thread stuck in the Adreno driver's `glCopyTexSubImage2D`; drawing and save lost): 1
hang in 69 auto-saving Clears and ~28 Saves, none in 48 repeats. RN best: 0 in 57 Clears and ~28
Saves. What is the rate per export, per arm and per export path?

## Pre-registered design (written 2026-11-11 ~04:15 EST, before any counted run)

**Cycle** (one on-device `uinput` script per run; the stall lane's two-slot driver `mt.py`, no
`adb shell input` strokes):

| Step | Action                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------- |
| 1    | Dense Crayon picture: four 2 s Crayon scribbles over the top third (the stall lane's `dense()`) |
| 2    | 0.3 s, then **Save** (the drawer's camera button, the default path)                             |
| 3    | 5 s (the save lands, the polaroid flies; each arm's 4 s save cooldown counts from the landing)  |
| 4    | One more 2 s Crayon scribble (so the next export is a different picture)                        |
| 5    | 0.3 s, then **Clear** with Auto-Save on Delete **on** (the trash drag): the auto-saving export  |
| 6    | 4.5 s before the next cycle (≥4 s between any two exports; Clear → next Save ≈ 13 s)            |

* **Run** = Crayon selected, 12 cycles (12 Saves + 12 auto-saving Clears = 24 exports), Pen
  selected, ~4.3 min. Both arms in a batch run the identical script (same random seed); seeds differ
  between batches.
* **Batch** = one run per arm, order alternating by batch (shipping first in odd batches, RN first
  in even ones), ~48 exports under one hold of `dev-galaxy.lock`, released between batches (≥60 s).
  Target **10 batches = 240 exports per arm (120 Saves + 120 Clears)**; 12 batches if time allows.
  The pilot (2 cycles per arm) is not counted.
* **Conditions.** Warm starts (`am start` without `-S`), never force-stopped, so each app's process
  ages through the soak as in the stall lane (the ANR'd process was 1.7 h old). The other arm stays
  alive in the background, as it was at the ANR. **No screen recording and no streamed full logcat**
  (the stall lane ran both): this soak measures the rate under ordinary load. That is a deliberate
  difference; screen recording makes SurfaceFlinger compose a virtual display on the GPU and is a
  candidate contributor to the stall lane's hang.
* **Guard.** An on-device watchdog stops the input script within ~0.3 s if the app's pid changes,
  the app leaves the foreground (`oom_score_adj` ≠ 0) or logcat reports an ANR, so strokes never
  land on the launcher (which holds the store app) or an ANR dialog.

**Detectors, every run:**

| Detector                                                                                                  | Counts as                                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `dumpsys activity exit-info <pkg>` record since the run start, reason other than user/force-stop          | **hang/kill** (ANR) or **crash** (app or WebView renderer)                                                                   |
| `dumpsys dropbox` `data_app_anr` / `data_app_crash` / `data_app_native_crash` / tombstone since the start | same (cross-check)                                                                                                           |
| logcat errors since the start: `ANR in`, `Input dispatching timed out`, `FATAL`, `Fatal signal`           | same (cross-check)                                                                                                           |
| New MediaStore rows owned by the app vs exports attempted                                                 | **lost save** (each missing row)                                                                                             |
| `dumpsys gfxinfo <pkg>` (reset per run): slowest histogram bucket and frames ≥ 700 ms                     | **freeze** = a frame ≥ 2 s without a kill; ≥ 700 ms logged as a long frame (UI thread only; RN's JS thread is not seen here) |
| End-of-run screenshot                                                                                     | context only                                                                                                                 |

**Hang onset.** The stall lane's hang began during the Crayon scribble *before* its Clear (the
WebView stopped drawing then), so a hang is not attributed to export by default. Without screen
recording, the watchdog samples `/proc/<pid>/task/<tid>/schedstat` every 0.5 s for the UI thread,
RenderThread and (shipping) WebView's `Chrome_InProcGpuThread`, on the device clock; the script's
marks are placed on that clock from the moment the virtual touchscreen appears. Each hang is placed
in its phase: **drawing** (a scribble in progress), **export** (≤ 2 s after a Save tap or a Clear
release) or **idle**. The ANR record's "Waited 10000ms" gives a latest bound.

**Reporting.** Every count is given **per export path (Save, auto-saving Clear) and per arm**, with
its rate and **one-sided 95% upper bound** (0 in 120 still allows 2.5%; 0 in 240 allows 1.2%), plus
**drawing-time exposure** (seconds of scribbling per arm, since a hang can start while drawing) and,
for each hang, **what the child would lose** (strokes and drawing seconds since the last landed
save; whether that picture's auto-save landed). The stall lane is pooled as a prior **once**: its 48
clean repeats are inside its 69 Clears, so shipping's prior is 1 hang in 69 auto-saving Clears and 0
in ~28 Saves; RN's is 0 in 57 Clears and 0 in ~28 Saves.

**What would change the decision.** The ~1% line below is a pre-registered classifier for this
campaign, not a safety boundary: a crash that loses a toddler's drawing is a blocker-class event at
any rate, so the bounds are reported whatever the class.

| Result (per arm)                                                                                                         | Class and effect                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Pooled hang/kill rate on either path **≥ 1%** (Clear: ≥ 2 more in 120 here → 3/189 = 1.6%; all exports: ≥ 3 more in 240) | **floor candidate** (for shipping: WebView + GPU driver); for shipping it counts toward RN, pending an iPad check |
| 1–2 more hangs here, below that line                                                                                     | **repeatable flag**: blocker-class event, class unclear; reported with its bound, not a verdict                   |
| **0 more in ≥ 200 exports**                                                                                              | **rare flag only**: no change to the verdict; the upper bound is reported as the residual risk                    |
| Any hang/kill on the Save path (every user's path) or that starts while drawing                                          | named separately: it moves the event from an opt-in setting to the default path, or off export altogether         |
| Lost saves without a kill, or freezes ≥ 2 s, in ≥ 1% of exports                                                          | **major** for that arm (data loss / visible freeze); class by cause                                               |

The same lines apply to RN. At most two attempts per hypothesis: if a hang reproduces, its trace and
the UI/GPU thread stacks are kept (trimmed) and the soak continues; no second design is tried.

## Method as run

* **Setup (04:11–04:16, under `dev-galaxy.lock`).** Auto-Save on Delete switched **on** in both best
  apps (Settings › Saving; screenshots `export-soak/look/{sh,rn}-saving-on-s.png`). Both found on a
  cleared page, Pen, Purple, Camera button on, AI off.
* **Pilot (not counted):** 2 cycles per arm. Both 4/4 exports saved; no exit record; shipping's
  slowest UI frame 500 ms (its known export stall), RN's 121 ms. Saved PNGs 1080×2016: shipping ~2.5
  MB, RN ~1.05 MB.
* **Watchdog positive control (not counted):** HOME pressed during RN's post-Save wait; the watchdog
  saw `oom_score_adj` 200 and stopped the input script 0.0 s into the next sample; the virtual
  touchscreen disappeared and no stroke reached the launcher.
* **Hang-onset metric control:** in the pilots the UI thread ran ≥ 49 ms/s (shipping) and ≥ 227 ms/s
  (RN) in every 0.5 s sample that overlapped a scribble, against 0–5 ms/s (shipping) idle; a sample
  under 20 ms/s while a scribble is being injected flags a stalled UI thread.
* **Tools** (`export-soak/bin/`): `gen.py` (plans; `mt.py` from the stall lane), `exs-dev.sh`
  (device-side player + watchdog + schedstat sampler), `run.zsh` (one run and its detectors),
  `score.py`, `soak.zsh` (unattended batches, lock per batch, stops on any anomaly), `table.py`.
* **Two scorer fixes after the first counted run (b01-sh), before any other:** (1) the run stopped
  on 2 "UI-silent while drawing" samples that were the 0.5 s window *before* a scribble, overlapping
  it by 10 ms; a sample now counts as "while drawing" only when a scribble covers ≥ 0.4 s of it
  (b01-sh rescored: 0). (2) The sampler had picked a short-lived RenderThread (tids wrap); it now
  takes the RenderThread with the earliest start time. Neither changes the hang, kill or lost-save
  detectors.

## Results (12 batches, 04:17–06:55 EST)

Both arms ran the identical 12 scripts (seed per batch), alternating which went first. Every run
completed all 24 exports; the watchdog never fired.

| Arm (Galaxy, best build) | Path              | Hangs/kills here | Rate | One-sided 95% upper | Pooled with the stall lane (once) | Pooled one-sided 95% upper | Lost saves |
| ------------------------ | ----------------- | ---------------- | ---- | ------------------- | --------------------------------- | -------------------------- | ---------- |
| Shipping `baseline.best` | Save (default)    | **0 / 144**      | 0%   | 2.06%               | 0 / 172                           | 1.73%                      | 0          |
|                          | Auto-saving Clear | **0 / 144**      | 0%   | 2.06%               | 1 / 213 (0.47%)                   | 2.21%                      | 0          |
|                          | All exports       | **0 / 288**      | 0%   | 1.03%               | 1 / 385 (0.26%)                   | 1.23%                      | 0          |
| RN `dev.best`            | Save (default)    | **0 / 144**      | 0%   | 2.06%               | 0 / 172                           | 1.73%                      | 0          |
|                          | Auto-saving Clear | **0 / 144**      | 0%   | 2.06%               | 0 / 201                           | 1.48%                      | 0          |
|                          | All exports       | **0 / 288**      | 0%   | 1.03%               | 0 / 373                           | 0.80%                      | 0          |

| Detector, per arm (12 runs each)                           | Shipping best                                                                                              | RN best                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Drawing exposure (scribbling while the app ran)            | 25.0 min (720 Crayon strokes)                                                                              | 25.0 min (720 strokes; 720 probe cohorts, 0 refused)          |
| `exit-info` records since 04:00 (any reason)               | 0                                                                                                          | 0                                                             |
| dropbox `anr`/`crash`/tombstone since 04:00 (whole device) | 0 (the last entry is the stall lane's 03:17 ANR)                                                           | 0                                                             |
| logcat `ANR in` / input timeout / `FATAL` / `Fatal signal` | 0                                                                                                          | 0                                                             |
| Saved / attempted (MediaStore rows owned by the app)       | 288 / 288; PNGs 2.40–2.52 MB                                                                               | 288 / 288; PNGs 0.98–1.12 MB                                  |
| Slowest UI frame per run (gfxinfo)                         | **500–800 ms, one per export**: 500–550 ms in 6 runs, 800 ms in 6 (b03–b06, b08, b09; 145 frames ≥ 700 ms) | 125–150 ms                                                    |
| Frames ≥ 2 s (freeze)                                      | 0                                                                                                          | 0                                                             |
| UI thread silent while a scribble was injected             | 0 samples                                                                                                  | 0 samples                                                     |
| Process age over the soak (warm starts, never killed)      | 0.98 → 3.6 h                                                                                               | 2.85 → 5.3 h                                                  |
| RSS before → after each run                                | 130–165 → 158–182 MB, flat                                                                                 | 135–357 → 364–441 MB, flat (no growth across 12 runs)         |
| Probe: worst first-packet wait for JS (`receiptLag`)       | n/a                                                                                                        | 38–75 ms per run (every stroke began ≥ 4.5 s after an export) |

**Hang onset and picture loss:** no hang to place; nothing lost. Every picture drawn was saved.

**Context, not counted:**

* Shipping's export holds its UI thread (the stall lane's WebView draw-functor wait) for one 500 ms
  or one 800 ms frame per export. The 800 ms runs began after another lane installed and ran a third
  WebView build (`baseline.export`) at 04:39; five Splotch processes were alive throughout, with
  ~1.0–1.25 GB available and ~3 GB swapped. The bimodal length was not isolated. No frame reached 2
  s.
* One extra shipping-best picture (04:21:53, 2.08 MB) was saved while shipping best was still in
  front after `b01-sh` and another lane held the Galaxy (its app resumed at 04:22:19). It did not
  come from this lane's input and is excluded.
* Condition difference from the stall lane, by design: no screen recording, no streamed full logcat.
  The stall lane's hang came under both (`screenrecord` keeps the encoder and a GPU composition path
  busy). Whether that load is needed to reach the hang is not tested here.

## Verdict by the pre-registered lines

| Defect                                                                            | Arm      | Result here                        | Class and effect                                                                                                                                                                                       |
| --------------------------------------------------------------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hang → ANR kill during export, drawing and save lost (stall lane, 1 in 69 Clears) | shipping | **0 in 288** (144 Save, 144 Clear) | **rare flag only**: blocker-class when it happens, but no floor. Pooled 1 in 385 exports (0.26%; ≤ 1.23% at 95%); on the default Save path 0 in 172 (≤ 1.73%). Not reproduced without screen recording |
| Hang/kill during export                                                           | RN       | 0 in 288                           | none seen: 0 in 373 pooled (≤ 0.80%)                                                                                                                                                                   |
| Lost saves without a kill, freezes ≥ 2 s                                          | both     | 0 / 0                              | none                                                                                                                                                                                                   |
| One 0.5–0.8 s UI-thread frame per export                                          | shipping | every export                       | already counted by the stall lane (its Save chord); the 800 ms variant is new context, cosmetic on its own                                                                                             |

**Could this flip the decision?** No. The only open item that could have become a shipping floor did
not recur in 288 more exports under ordinary load. It stays a rare, unexplained, blocker-class flag
on shipping (one Galaxy ANR, under screen recording), with a residual risk of ~1% per export at 95%
confidence that this soak cannot rule out. The same soak bounds RN's export crash risk the same way.

## State left behind

* The Galaxy, 04:11–06:57 under `dev-galaxy.lock` per batch (released between; other lanes used the
  gaps). Both best builds: page cleared, Pen, Purple, **Auto-Save on Delete off again** (on
  04:12–06:56; `export-soak/look/{sh,rn}-saving-off-s.png`, `{sh,rn}-end-s.png`), AI off, Sound
  untouched, launcher in front. Neither was reinstalled, force-stopped or killed. Store app, `.dev`,
  `.dev.mem`, `.baseline.main` never touched.
* Gallery: **586 new pictures by this lane** (shipping best 292 = 288 + 4 pilot; RN best 293 = 288 +
  4 pilot + 1 watchdog control), MediaStore ids from 1000001116; nothing deleted. The 1 extra
  shipping picture above and the export spikes' own pictures share that id range.
* Raw run folders (`export-soak/runs/`, ~85 MB of logs, scripts and full-size screenshots) deleted
  after scoring; `score.json` per run, `summary.log`, the soak logs, `look/*-s.png` and the tools
  remain (3.6 MB; `gen.py <name> <seed> 12` regenerates any script).
