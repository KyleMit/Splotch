# Stall ink: strokes started during each arm's natural busy moments

2026-11-11, Claude (lane stall-ink). Device: the Galaxy (S21 FE, Android 16, 120 Hz). Arms, best
versions: RN `art.splotch.app.dev.best` (v2 probe Release, `claude/best-rn` @ `e703b8b79a08`) and
shipping `art.splotch.app.baseline.best` (`claude/best-shipping` @ `f9d3b6ff67d5`). Raw media,
scripts and logs: `stall-ink/` in the campaign scratch folder (rig file).

Question (bones, one per arm):

* **RN** decides a contact's fate when its first packet lands, so anything still holding the paper
  or the JavaScript thread then eats the stroke. The best version fixes the three known cases (Clear
  export, a dialog leaving, an Eraser read-back). Do strokes started during RN's *other* natural
  busy moments get lost or arrive late, and is the cause the JS-thread design (floor) or a small
  slip (fixable)?
* **Shipping:** during a WebView main-thread stall, WebKit drops a non-primary finger's samples, so
  a second finger draws a straight chord. How often does a natural stall do that, and does any stall
  lose or delay a stroke? (The Galaxy's WebView is Chromium, not WebKit: a chord here would be a
  Chromium result; the iPad run answers the WebKit half.)

## Pre-registered numbers (written 2026-11-11 ~02:00 EST, before any capture)

**Busy moments** (each on a dense picture: four 2 s Crayon scribbles over the top of the paper),
each followed by a probe stroke at **100, 300 and 700 ms** after the busy action's release, 3 tries
per delay:

| Code | Busy moment                                                     | Delay measured from                |
| ---- | --------------------------------------------------------------- | ---------------------------------- |
| U    | 5 filler strokes, then 5 quick Undo taps (150 ms apart)         | the last Undo tap's release        |
| S    | Save (the drawer's save button: an export to the gallery)       | the save tap's release             |
| R    | Home, 2.5 s, back to the app (resume)                           | the activity's resume (events log) |
| D    | Settings opened, then closed with × (**control**: a fixed path) | the × tap's release                |
| C    | Clear with Auto-Save on Delete **on** (switched back after)     | the Clear drag's release           |

**Probe strokes.** One finger: a 600 ms left-to-right wave (x 300→900, amplitude 18 px, wavelength
150 px, 8 ms samples). Two fingers: the same wave twice, 90 px apart, the second finger down 30 ms
after the first and lifting 20 ms before it. Every try ends with a warm control stroke 1.5 s later
on its own row (the timing reference). Pen, Purple, Size as found.

**Scoring per probe line** (final screenshot + screen recording; RN also the probe's cohort line):

| Outcome   | Rule                                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **lost**  | under 20% of the planned x span inked                                                                                                                                                              |
| **cut**   | 20–90% of the span inked                                                                                                                                                                           |
| **late**  | first ink ≥100 ms later than the same recording's warm controls (video Δ: onset − touch-down, minus the controls' median). RN cross-check: `firstDotMs` or the first packet's `receiptLag` ≥100 ms |
| **chord** | a line whose ink leaves the planned wave: fewer than 80% of its inked columns within 7 px of the wave's centre line, where the arm's own controls score ≥90%                                       |
| inked     | none of the above                                                                                                                                                                                  |

**Input-path control first:** per arm, 3 one-finger and 3 two-finger probes with no busy moment must
be inked (3 of 3 each, chord-free) before anything is counted. If the two-finger control fails in
either arm, two-finger results are dropped and only one finger is reported.

**What would change the decision** (the bar stays: RN must be clearly better for users; a tie goes
to shipping):

| Finding                                                                                                                                                                                                | Class and effect                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| An arm loses (lost/cut) **≥2 of 9** probes of one busy moment at 300 or 700 ms, or is late ≥250 ms in ≥2 of 3 tries at a delay                                                                         | **major** for that arm. 1 of 9 = rerun once (second and last attempt), pooled                                                             |
| The same at 100 ms only                                                                                                                                                                                | **minor** (a stroke a child starts within a tenth of a second of a tap), unless the other arm inks them all                               |
| RN major, and the probe log shows **packets reaching JS late** (first packet `receiptLag` ≥100 ms) or admitted late because JS was busy with work that has to run there (raster, encode, React commit) | **floor candidate (JS-thread design)**: counts against RN's bones; only a flip *toward* no-go                                             |
| RN major, and the cause is a lock, a window or a refusal at admission (`strokes 0` with packets present) set by one code path                                                                          | **fixable** (repair cost; adds to the bill, does not move the verdict)                                                                    |
| Shipping chords in **≥2 of 9** two-finger probes after one busy moment, or loses/delays a stroke as above                                                                                              | **shipping floor candidate** on this WebView: the only result here that could move the verdict toward RN, and only if the iPad repeats it |
| Neither arm crosses a line                                                                                                                                                                             | no change: natural busy moments are not a differentiator on the Galaxy                                                                    |

## Method as run

* **Input.** Android's `uinput` shell tool as a virtual two-slot touchscreen (`Splotch stall touch`,
  1:1 with 1080×2340), one on-device script per run, so every delay runs on the device. Builder
  `stall-ink/bin/mt.py` (multi-slot extension of the brushes lane's `ui.py`), plans `bin/gen.py`.
  `getevent -t` records each contact's true touch-down (CLOCK_MONOTONIC), so every delay below is
  the measured one (`act`), not the scripted one.
* **Resume (R)** cannot be scripted inside the app, so `bin/resume.sh` starts the uinput script,
  waits for its device node, then runs `cmd input keyevent KEYCODE_HOME` and
  `cmd activity start-activity` at scripted offsets on the same clock. The delay is measured from
  the app's `wm_on_resume_called` event. The app comes back 118–220 ms after the start command, so
  the probe waits 200 ms more (`RESUME_COMP_MS`); measured delays are 93–162 ms for the 100 ms slot.
* **Per run:** warm start, Clear, four 2 s Crayon scribbles over the top third (the dense picture),
  Pen, then three tries (one per delay, order rotated per run). Screen recording, the final
  screenshot, `getevent` and, for RN, the probe's `SplotchPerf` lines. Runs alternate arms (S R / R
  S by try set), rig lock held per batch of 4–8 runs.
* **Scoring** (`bin/score.py`, `bin/vidrows.mjs`): final ink from the screenshot (from the fullest
  video frame where a later Clear wiped it); first ink from the recording, relative to the same
  recording's three warm controls (their spread was within ±10 ms in every clean run). RN cohort
  lines are matched to their contact by time (the line is written after the lift, later when
  JavaScript was blocked).
* **Chord and gap metrics have positive controls** (`bin/gen_chordctl.py`, runs `ctl-*-X2f`): a
  second finger that sends no samples for 60/120/200 ms. RN drew a straight chord each time (flagged
  3/3). Shipping drew a chord for 60 ms (flagged) and *broke the line* for 120 and 200 ms (flagged
  cut), so a long sample drop shows up as a gap there, not a chord.

### Reusing the method on the iPad

The plan and the scoring are device-agnostic; only the injector is Android's. In `stall-ink/bin/`
(campaign scratch folder):

| File                                                     | Portable?                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gen.py` (plans: moments, delays, rows), `mt.py` (wave)  | the plan is; coordinates are the Galaxy's portrait pixels. On the iPad scale the rows into the paper and keep the wave (600 ms, 8 ms samples, 18 px amplitude, 150 px wavelength; second finger +32 ms)             |
| `mt.py` Script, `run.zsh`, `run-resume.zsh`, `resume.sh` | Android only (uinput, getevent, screenrecord). The iPad equivalent is the ipad-experiment harness's WDA W3C actions with per-contact pacing (`move32`); bursts there are a harness artefact (`spike-multitouch.md`) |
| `score.py`, `vidrows.mjs`, `brief.py`, `table.py`        | portable: they need `marks.json`, a final screenshot, a screen recording and each contact's touch-down time on the recording's clock (Android: `getevent`; iPad: the probe's cohort lines or the WDA timeline)      |
| `gen_chordctl.py`                                        | the chord/gap positive control; run it first on any new rig                                                                                                                                                         |

## Input-path control (before counting anything)

| Run                                                             | RN best                          | Shipping best                                                 |
| --------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------- |
| One finger, 3 waves                                             | 3/3 inked, on-wave 1.00, Δ ±3 ms | 3/3 inked, on-wave 1.00, Δ ±34 ms                             |
| Two fingers, 3 × 2 waves                                        | 6/6 inked, on-wave 1.00          | 6/6 inked, on-wave 1.00                                       |
| Chord control: second finger sends no samples for 60/120/200 ms | 3/3 drawn as chords, 3/3 flagged | 60 ms chord flagged; 120/200 ms drawn as a break, flagged cut |

The two-finger path is reliable in both arms, so two-finger results count. `adb shell input` was not
used for any stroke (its colour-tap artefact, rig file).

## Results

Each cell is 9 probe lines: 3 one-finger tries + 3 two-finger tries (6 lines), one try per run,
three runs per cell. "act" is the measured delay. Δ = first ink later than the same recording's warm
controls. RN columns add the probe's cohort (`strokes`, the first packet's wait for the JavaScript
thread `receiptLag`).

| Moment                            | Delay (act)                   | RN best: lines OK                                                                                       | Shipping best: lines OK                                                                          |
| --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| U: 5 quick Undos (Pen fillers)    | 100 / 300 / 700               | **9/9 · 9/9 · 9/9**, Δ ≤ 33 ms, receiptLag ≤ 31 ms                                                      | **9/9 · 9/9 · 9/9**, Δ ≤ 20 ms                                                                   |
| V: 5 Undos of long Crayon strokes | 100 / 300 / 700               | 3/3 · 3/3 · 3/3 (one run), Δ ≤ 32 ms                                                                    | 3/3 · 3/3 · 3/3 (one run)                                                                        |
| S: Save (camera button)           | 100                           | **0/9 lost** (cohort `strokes 0`, packets present, receiptLag 957–1,071 ms)                             | **0/9 chord**: 62–74% of each line drawn straight (on-wave 0.27–0.38), one and two fingers alike |
|                                   | 300                           | **0/9 lost** (receiptLag 1,063–1,102 ms)                                                                | **0/9 chord**: 36–46% straight (on-wave 0.54–0.64)                                               |
|                                   | 700                           | **0/9 lost** (receiptLag 691–730 ms)                                                                    | 9/9 shape intact; hidden under the save polaroid until ~1.45 s (UI, not counted late)            |
|                                   | 1,000 / 1,500 / 2,200 (1 try) | lost · lost · inked (2.2 s: on time by the probe; hidden under RN's own polaroid)                       | inked (hidden) · inked · inked                                                                   |
| D: Settings closed (control)      | 100                           | 4/9 (the second finger at 132 ms inks every time: window ~100–140 ms)                                   | **0/9 lost** (window ~240 ms, known)                                                             |
|                                   | 300 / 700                     | 9/9 · 9/9                                                                                               | 9/9 · 9/9                                                                                        |
| R: Home, 2.5 s, back (resume)     | 93–166                        | 3/9: 3 chord, 2 start hook, **1 lost (93 ms)**; receiptLag 71–95 ms                                     | 5/9: 2 chord, 2 start hook                                                                       |
|                                   | 277–383 / 681–777             | 9/9 · 9/9 (Δ ≤ 86 ms)                                                                                   | 9/9 · 9/9                                                                                        |
| C: Clear, Auto-Save on Delete on  | 100                           | 9/9 land, **all late**: first ink Δ 292–426 ms, then a ~1 s freeze mid-stroke (receiptLag 901–1,037 ms) | **0/9**: 6 chord, 2 cut, 1 lost (the hang below); Δ 190–310 ms                                   |
|                                   | 300                           | 9/9 land, **all late**, Δ 187–1,230 ms (receiptLag 812–1,087 ms)                                        | 9/9, Δ ≤ 54 ms. Under full-log load (repeat runs) 4/5 chord or late, Δ 123–172 ms                |
|                                   | 700                           | 9/9 land, **all late**, Δ 544–784 ms (receiptLag 455–704 ms)                                            | 9/9                                                                                              |
|                                   | 1,000 / 1,500 / 2,200 (1 try) | late 450 ms · inked · inked                                                                             | inked · inked · inked                                                                            |

203 of 204 warm controls inked; the one lost is the hang below. Key frames: `stall-ink/keep/` (Save
rows side by side, the Clear 100 ms frames, the resume start distortion, the chord control).

### A shipping hang: 10 s ANR after an auto-saving Clear (1 of 69)

In run `sh-C1f-1` (03:17) the third auto-saving Clear never happened on screen: the WebView stopped
drawing during the Crayon scribble before it, the Clear, the probe and its control drew nothing,
that Clear's picture was never saved, and Android killed the app 14 s later: `reason=6 (ANR)`,
"Input dispatching timed out … Waited 10000ms for MotionEvent" (ApplicationExitInfo and the dropbox
report, excerpt in `keep/sh-C1f-1-anr-excerpt.txt`). The drawing was lost (the next run found a
blank page). Stacks at the ANR: the UI thread in `HardwareRenderer.syncAndDrawFrame` waiting on
RenderThread; RenderThread in `WebViewFunctor::drawGl` waiting on WebView's
`Chrome_InProcGpuThread`, which sat in the Adreno driver's `glCopyTexSubImage2D` on a mutex; the app
used 107% CPU, 95% of it kernel time, 406 major faults.

It did not come back in 4 repeat runs with full logging (12 Clears) or a 36-Clear soak (three runs
of 12 auto-saving Clears on fresh Crayon, `bin/soak.zsh`): every Clear saved, no frame gap over 0.93
s, no exit record. RN ran the same 36-Clear soak clean and had no exit record all lane. Pooled:
**shipping 1 hang in 69 auto-saving Clears (and 0 in ~28 Saves); RN 0 in 57 Clears and ~28 Saves.**

## Causes

| Finding                                                             | Evidence                                                                                                                                                                                                                                                                                                                                 | Cause                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| RN loses every stroke started within ~1.6 s of Save                 | 29/29 lines lost from 100 ms to 1.5 s (3/3 more in the traced run); every cohort has its packets and `strokes 0`; packets waited 0.16–1.10 s for JS. atrace (`keep/atrace-save-stalls.txt`): the JS thread (`mqt_v_js`) ran 213 ms, then 876 ms without a break, from 70 ms after the tap                                                | `useSavePicture` runs the capture inside `runCommand` (`src/useDrawingScreen.ts`): input lock + `busy` until the export resolves, so a contact whose first packet lands meanwhile is refused for life. The **same slip** the best version removed from Clear (the guardrails spike's departing export: no command, no lock); Save was not ported. Under it, the export's PNG work holds the JS thread ~1.1 s |
| RN inks 0.3–1.2 s late after an auto-saving Clear                   | 27/27 lines at 100–700 ms land (the best version's fix holds) but late, and the 1.0 s try too; receiptLag 0.42–1.09 s; at 100 ms the first dot lands and then the line freezes ~1 s mid-stroke                                                                                                                                           | The departing picture's export (capture, PNG encode and decode, compose) runs on the JavaScript thread, the thread that inks. The guardrails spike's "late ink" residual, now measured on the best version                                                                                                                                                                                                   |
| Shipping bends strokes into straight chords after Save              | 18/18 lines at 100 and 300 ms, one finger as well as two; the line's start is a straight segment until ~0.6–0.7 s after the tap. atrace: the Android UI thread sat 480 ms in `Choreographer#doFrame → draw`, waiting on `WebViewFunctor::drawGl`, which waited on WebView's in-process GPU thread (417 ms busy); `kswapd` busy alongside | Shipping's export makes WebView's GPU thread work ~0.4–0.5 s, and the WebView draw functor holds the **UI thread**, which is where the WebView's touches arrive. Samples that wait out the stall reach the page as one move (the line resumes from the latest point): on Android WebView the samples are lost, not just late. Same family as the iPad WebKit chord, here on the primary finger too           |
| Shipping chords at 100 ms after an auto-saving Clear                | 8/9 lines chord or cut, Δ 190–310 ms; clean from 300 ms (Δ ≤ 54) except under extra load                                                                                                                                                                                                                                                 | The same export path, a shorter stall (Clear wipes at once; no polaroid)                                                                                                                                                                                                                                                                                                                                     |
| Shipping ANR (1 of 69)                                              | above                                                                                                                                                                                                                                                                                                                                    | The same chain stuck for > 10 s: UI thread → WebView draw functor → in-process GPU thread in the Adreno driver's `glCopyTexSubImage2D`                                                                                                                                                                                                                                                                       |
| Both arms bend the start of a stroke begun ~100–160 ms after resume | RN 6/9, shipping 4/9 lines with a start hook or a flattened first ~100 px; RN also lost one finger at 93 ms; clean from ~280 ms in both                                                                                                                                                                                                  | The app-open animation: the window is still scaling when the touch lands, so the first samples map through a moving transform. OS behaviour, not an app stall. RN's JS was also busy ~70–95 ms on resume (receiptLag), below any line                                                                                                                                                                        |

Undo (5 quick taps, Pen or long Crayon strokes) cost nothing measurable in either arm: RN best's
tile-snapshot Undo kept receiptLag ≤ 31 ms. The dialog control matched the known windows (RN best
~100–140 ms, shipping ~240 ms), so the harness reproduces the fixed path as `spike-input-loss.md`
and `best-versions.md` described.

## Verdicts by the pre-registered lines

| Defect                                                                                           | Arm      | Severity (rule)                                                                                           | Class                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Every stroke started within ~1.6 s of Save is lost                                               | RN       | **major** (9/9 lost at 300 and at 700 ms)                                                                 | **fixable** (unbuilt): the Clear fix's lock-free departing export applied to Save; ~0.5–1 agent-day by analogy with the Clear fix. Not validated here                                                                                                                                                        |
| Strokes after an auto-saving Clear (and, once the Save lock goes, after Save) ink 0.3–1.2 s late | RN       | **major** (late ≥ 250 ms in 3/3 tries at 300 and 700 ms); opt-in setting for Clear, default path for Save | **unclear: the JS-thread design cost.** Export work on the thread that inks delays ink for its whole length. Fixable only by moving export off the JS thread (native encode or a worklet runtime): the guardrails spike's unbuilt 1.5–3 days, uncertain. No other natural busy moment stalled RN's JS thread |
| Strokes started within ~0.5 s of Save are drawn as straight chords                               | shipping | **major** (9/9 chords at 300 ms)                                                                          | **unclear**: the trigger (GPU work in shipping's export holding the UI thread through the WebView draw functor) is shipping's own and probably avoidable; the sample loss during any UI-thread stall is WebView's (a floor shared with the iPad's WebKit chord)                                              |
| Strokes started ~0.1 s after an auto-saving Clear chord or cut                                   | shipping | minor (100 ms only; RN is late there too)                                                                 | as above                                                                                                                                                                                                                                                                                                     |
| Hang → ANR kill, drawing and its auto-save lost, after an auto-saving Clear                      | shipping | **blocker-class event, rare** (1 of 69 Clears; 0 of ~28 Saves)                                            | **unclear**: platform GPU-driver stall reached through WebView's draw functor during export. Not reproduced in 48 further Clears                                                                                                                                                                             |
| Start of a stroke begun ~0.1 s after resume is bent                                              | both     | cosmetic (OS window animation)                                                                            | n/a (OS)                                                                                                                                                                                                                                                                                                     |

**The bones question for RN.** Its other natural busy moments split cleanly. Undo, resume and a
dialog closing do not hold the JS thread long enough to matter. Export does: Save loses strokes
through a fourth lock of the same kind as the three fixed ones (a slip), and both exports delay ink
0.3–1.2 s because they run on the JS thread. That delay is the JS-thread design showing, but on
movable work, so it is unclear rather than a floor: it becomes a floor only if moving export off the
JS thread fails. RN keeps the stroke's shape through the stall (every sample arrives, late).

**The chord question for shipping.** On the Galaxy, natural stalls bend strokes after Save every
time (100 and 300 ms) and after an auto-saving Clear at 100 ms; nothing else (Undo, resume, a
dialog) stalls it. Android WebView loses the samples for the primary finger as well as extra ones,
so it is not only a multi-finger problem here. Shipping keeps the stroke but bends its shape; RN
keeps the shape but delays it (or loses it, on Save, until the lock is fixed).

**Could this flip the decision?** Not by itself. Both arms have an export stall with a user-visible
cost, RN's longer (and losing strokes on Save, a cheap fix) and shipping's shorter (bending them).
RN gains one more priced repair (~0.5–1 day) and confirms one unclear item (export off the JS
thread). Shipping gains its first crash-class event: one ANR in 69 auto-saving Clears on the Galaxy.
If a longer soak puts that above ~1% on the default Save path, it is a shipping floor candidate
(WebView + GPU driver) and counts toward RN; at 1 in 69 and 0 in 48 repeats it is a flag, not a
verdict.

## Follow-ups worth the time

1. A 200-export soak per arm (Save and auto-saving Clear, dense Crayon, Galaxy) to put a rate on the
   shipping ANR. `bin/soak.zsh` does it unattended once Auto-Save is on; add Saves with a 4 s gap.
2. RN: port the lock-free departing export to Save and rerun `S1f-*` (expect 9/9 inked, late ~1 s);
   then price export off the JS thread.
3. iPad: the same moments with WDA. WebKit's chord affects extra fingers only; Save and Clear are
   the moments to drive.

## State left behind

* The Galaxy, 01:54–03:56 under `dev-galaxy.lock` (rig lock per capture batch). Both best builds:
  page cleared, Pen, Purple, Auto-Save on Delete **off** again (switched on 03:10–03:55 for C and
  the soak; screenshots `runs/look/saving-off-4.png`), AI off (untouched), launcher in front. RN
  best was found on Crayon and is left on Pen. Settings sound/volume untouched (RN 33%, shipping
  50%). Store app, `.dev`, `.dev.mem`, `.baseline.main` never touched.
* Shipping best was killed once by the ANR above (03:17:28) and relaunched by the next run.
* Gallery: **208 new pictures**, MediaStore ids 1000000908–1000001115 (111 shipping best, 97 RN
  best): Saves and auto-saving Clears. Nothing deleted.
* Raw recordings, video tables, full logcats and the two 0.5 GB atrace dumps were deleted after
  scoring; `stall-ink/runs/*/score.json`, screenshots and `keep/` remain (~235 MB).
