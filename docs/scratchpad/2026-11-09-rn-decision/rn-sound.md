# RN's late drawing sound on the Galaxy

2026-11-10 20:40 → 21:45, Claude. Device: the Galaxy (S21 FE, Android 16, 120 Hz). Builds:
`art.splotch.app.dev` (frozen RN probe, 427756f14) and `art.splotch.app.dev.best` (RN best probe,
09f06e86c). Raw dumps and scripts are in `rn-sound/` in the campaign scratch folder (no recordings
were made).

## Verdict

| Question                     | Answer                                                                                                                                                                                                                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is the owner right?          | **Yes, and it is worse than late.** With a steady 120 Hz stroke, RN's drawing sound **never reaches its level in 57 of 60 strokes** (both RN builds, 5 cold + 25 warm each). The other 3, all first strokes after launch, came in 6–11 dB short of it. Frozen and best behave the same                                                |
| Cause                        | **A bug in RN's JavaScript gain ramp** (`createNativeGain`, `src/platform/drawingAudio.ts`, shared by Android and iOS). Every touch packet restarts the 60 ms ramp at ~0 progress and cancels its 16 ms step, so at 120 Hz input the volume stays at ~0 until the finger pauses or JavaScript hitches. Confirmed by three causal runs |
| Second, smaller cause        | expo-audio's ExoPlayer plays through Samsung's deep-buffer output, whose first mixed audio lands 78–135 ms after touch-down. With the ramp working, RN is audible **122–282 ms** after touch-down (median ~135 ms); shipping keeps a low-latency AAudio stream running                                                                |
| Shipping                     | **Not measurable here.** Its WebView plays through an AAudio MMAP stream, which has no power history, and the release WebView has no DevTools socket. Shipping's "at once" rests on the owner's ears and its code (Web Audio ramps advance on the audio thread at any input rate)                                                     |
| Severity                     | **Major, RN only.** The drawing sound is effectively missing for steady strokes on 120 Hz screens. Not a floor: the main cause is a ~20-line fix                                                                                                                                                                                      |
| Price                        | Ramp fix **½ day** (code + touch-rate test + rerun of this harness). Android latency parity with shipping, optional: keep the take playing muted between strokes (**½–1 day**, unmeasured) or a native AAudio module (**1½–2½ days**)                                                                                                 |
| Robust audio rewrite covers? | **No.** It is an iOS AVAudioEngine module; Android stays on expo-audio. The ramp fix is needed anyway and covers both platforms                                                                                                                                                                                                       |
| iPad (not measured)          | Same code. On ProMotion (120 Hz) touch packets also arrive under 16 ms apart, so the iPad should show the same symptom. Owner case 7's iPad half will tell                                                                                                                                                                            |
| Could it flip the decision?  | **No.** It adds ½ day (up to ~3 days for full Android latency parity) to RN's repair bill; it is not a floor                                                                                                                                                                                                                          |

## Pre-registration (written 20:50, before any measured stroke)

* **Reading.** Sound latency L = t(sound) − t(down) for each stroke.
  * t(down): the kernel timestamp of the stroke's touch-down on the injected `uinput` touchscreen
    (`getevent -t`, CLOCK_MONOTONIC), converted to wall-clock time with a logcat line printed in
    both `-v monotonic` and `-v epoch` in the same run.
  * t(sound): the start of the first 50 ms bin at or after t(down) in the speaker output's "Signal
    power history" (`dumpsys media.audio_flinger`, HAL stream dump) whose power is at least 10 dB
    above that output's level in the 500 ms before t(down), and above −70 dB. This is the energy the
    speaker was actually fed, so it is the same witness for RN's AudioTrack and shipping's WebView
    stream. Resolution ±50 ms.
  * RN also has a second witness: AudioFlinger's local log `AT::add` for the app's uid (the track
    entering the mixer) with its volume columns.
* **Stroke.** One straight-line zigzag on blank paper, Pen, about 1.2 s long at about 0.9 device
  px/ms, which is above both arms' full-volume speed (0.45 backing px/ms). Each stroke has its own
  `uinput` device and is followed by an AudioFlinger dump.
* **Conditions per arm.** 5 cold launches (`am start -S -W`, first stroke 4 s after launch returns),
  each followed by 5 warm strokes about 3 s apart. That is 5 cold and 25 warm strokes per arm.
* **Arms.** `art.splotch.app.dev` (frozen RN), `art.splotch.app.dev.best` (RN best),
  `art.splotch.app.baseline.main` (frozen shipping), `art.splotch.app.baseline.best` (shipping
  best). Settings, media volume (4 of 15 on the speaker) and sound settings are left as found.
* **Late** means L ≥ 150 ms (the campaign's first-stroke rule). **Never** means no qualifying bin
  before the touch-up plus 100 ms.
* **The number that would change the decision:** RN late or never on at least 3 of 5 cold strokes or
  at least 30% of warm strokes while shipping is late on neither confirms the owner's ears as an
  RN-only defect; then its cause and price decide whether it is a floor.

### Added at 21:05, after two uncounted functional runs and before any counted run

* **Shipping has no witness here.** Its WebView plays through an AAudio MMAP stream
  (`AudioMmapOut_*`), which bypasses the mixer and has no power history; the release WebView has no
  DevTools socket. Shipping's timing therefore rests on the owner's ears and its code. The counted
  runs cover the two RN arms only.
* **Hypothesis H1 (gain-ramp starvation).** `createNativeGain().setVolume` in
  `src/platform/drawingAudio.ts` restarts its 60 ms ramp on every call, takes its first step at ~0
  elapsed time, and cancels the pending 16 ms step. If touch packets arrive less than 16 ms apart,
  the volume never leaves ~0. **Predictions** (RN best, otherwise the registered stroke): with
  samples 8 ms apart, never audible; with samples 20 ms apart, audible within 150 ms; with samples 8
  ms apart and a 150 ms still hold at 600 ms, the sound comes in during the hold. One launch (6
  strokes) per condition; H1 fails if the 20 ms strokes stay silent.
* **Hypothesis H2 (output standby), added 21:15.** With 20 ms samples and strokes 1.5 s apart in one
  `uinput` session, so the deep-buffer output never reaches its 3 s standby, strokes 2–4 are audible
  within 100 ms and stroke 1 (after standby) is not. One launch, RN best.

## Results

Settings as found and left: media volume 4 of 15 on the speaker, ringer silent, each app's Sound
settings untouched, brush Crayon (the owner's choice, not Pen as registered). Every run
cold-launched the app (`am start -S -W`); the first stroke came 4.7 s after launch, the next five
~5.3 s apart.

**A deviation from the registered gate.** At this media volume (port volume −39 dB) RN's correct
full-speed level is about −79 dB: takes average −26 dBFS (`ffmpeg volumedetect`), times the 0.2
scratch gain (−14 dB), minus 39 dB. The 20 ms strokes below measure −72 to −80 dB. The registered
−70 dB gate assumed the louder volume of the owner's case 7 (port volume 0 dB then) and no working
stroke can reach it now. Both gates are reported; the second, declared after seeing the data, is 10
dB under the computed target (−89 dB).

| Run (RN, input)                                                      | Strokes        | Gate −70 dB (registered) | Gate −89 dB (declared later)                   | Peak level, median (max) | Track in the mixer after touch-down |
| -------------------------------------------------------------------- | -------------- | ------------------------ | ---------------------------------------------- | ------------------------ | ----------------------------------- |
| RN best, 8 ms samples (counted)                                      | 5 cold         | 5 never                  | 4 never, 1 at 114 ms                           | −130 dB (−83)            | 21 ms median                        |
|                                                                      | 25 warm        | 25 never                 | **25 never**                                   | −132 dB (−127)           | 17 ms                               |
| Frozen RN, 8 ms samples (counted)                                    | 5 cold         | 5 never                  | 3 never, 2 at 124 and 179 ms                   | −125 dB (−82)            | 20 ms                               |
|                                                                      | 25 warm        | 25 never                 | **25 never**                                   | −127 dB (−118)           | 17 ms                               |
| H1: RN best, **20 ms** samples                                       | 1 cold, 5 warm | 6 never                  | **6 audible**: 122, 134, 176, 178, 281, 282 ms | −77 dB (−75)             | 18 ms                               |
| H1: frozen RN, **20 ms** samples                                     | 1 cold, 5 warm | 6 never                  | **6 audible**: 126, 129, 129, 131, 135, 230 ms | −75 dB (−72)             | 19 ms                               |
| H1: RN best, 8 ms with a **150 ms still hold at 600 ms**             | 1 cold, 5 warm | 6 never                  | **6 audible during the hold**: 666–716 ms      | −79 dB (−77)             | 17 ms                               |
| H2: RN best, 20 ms, strokes 1.5 s apart (output kept out of standby) | 1 + 3          | 4 never                  | 228 ms (first); 128, 150, 169 ms               | −78 dB (−75)             | 16 ms                               |

* **H1 confirmed.** The same build, player and output become audible as soon as input arrives slower
  than the ramp's 16 ms step, or the finger holds still. The three cold strokes that came in each
  had one 41–50 ms input gap (probe `packetGap` max) and then held 6–11 dB under target.
* **H2 not confirmed.** Strokes close together moved the first mixed bin earlier (78–119 ms against
  122–135 ms after standby), but the gate was still crossed at 128–169 ms. The rest is ExoPlayer and
  the deep-buffer write path; it was not separated further (two-attempt rule).
* **Resolution.** Bins are 50 ms. Times are when audio reached the HAL; the speaker plays it
  slightly later.

## Cause: the Android/iOS gain ramp never advances at 120 Hz input (RN only)

`createNativeGain` (`src/platform/drawingAudio.ts`, shared by Android and iOS, unchanged on RN best)
emulates Web Audio's 60 ms `linearRampToValueAtTime` in JavaScript:

* every `setVolume(target)` call cancels the pending step, sets `from = currentVolume` and
  `started = now`, and runs one step at once, where progress is `(now − started) / 60 ms`, about 0;
* the next step is a 16 ms timer (`GAIN_FRAME_MS`).

`setVolume` runs on every touch packet. On the Galaxy at 120 Hz the packets are 8.4 ms apart (probe:
`packetGap` p50 8.36 ms, p95 10.6 ms; 142 `audioVolume` calls per 1.2 s stroke), so each packet
cancels the step before it fires and the volume stays at about 0. It rises only when a gap of at
least 16 ms happens: a JavaScript hitch, a pause or a slowing finger. That is the owner's "a long
long time to come in, if at all". Shipping's Web Audio ramp advances on the audio thread whatever
the input rate, so it comes in at once.

| Evidence                                                              | Method                                                                                                                                                    | Result                                                                                                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| The frozen source, run as is                                          | `createNativeGain` copied verbatim from 427756f14 into a Node simulation; timers fire on display frames, as React Native's Choreographer-driven timers do | 120 Hz packets: **0% of target for the whole 1.2 s stroke**. 60 Hz or 50 Hz packets: 50% at 56–68 ms. One 60 ms hitch at 600 ms: jumps to 100% |
| A candidate fix (Web Audio semantics: re-anchor at the running value) | Same simulation, ~20 lines                                                                                                                                | 50% of target at 56 ms at every input rate, hitch or not                                                                                       |
| Why tests missed it                                                   | `tools/tests/native-audio-adapter.test.mjs`                                                                                                               | Every ramp test calls `setVolume` once and advances timers; none calls it at touch rate                                                        |
| Age                                                                   | `git log -S GAIN_FRAME_MS`                                                                                                                                | Present since the native import, cb52f563d (2026-10-12)                                                                                        |

The track itself starts on time: AudioFlinger adds RN's AudioTrack to the mixer 12–26 ms after
touch-down in all 80 strokes.

**The owner's own strokes agree.** An AudioFlinger dump at 20:43 still held the deep-buffer power
history of owner case 7 (20:30–20:37). Case 7 ran at port volume 0 dB, a higher media volume than
the 4 of 15 found later, so there RN's sound reads −30 to −45 dB at full level.

| Time     | App (by uid) | Track playing | Speaker energy                                                                                  |
| -------- | ------------ | ------------- | ----------------------------------------------------------------------------------------------- |
| 20:30:38 | frozen RN    | 1.3 s         | **never audible**: −133 to −90 dB throughout                                                    |
| 20:34:42 | RN best      | 4.2 s         | nothing mixed for 390 ms, then −69, −64 dB: past −70 dB **~440 ms** after the track started     |
| 20:34:52 | RN best      | 1.8 s         | −122 to −97 dB from 700 ms, then −56 dB: past −70 dB **~1.05 s** after the track started        |
| 20:36:53 | RN best      | 1.9 s         | −46, −35 dB from 66 ms. Probably the Settings volume preview, which calls `setVolume` only once |

**A second, smaller RN delay on Android.** expo-audio's ExoPlayer plays through Samsung's
deep-buffer speaker output, which enters standby 3 s after the last track stops (`Standby delay` 3
s) and needs 22–122 ms (mean 77) to start again, with ~78 ms per write. In the 20 ms runs the first
mixed bins land 122–135 ms after touch-down, and the sound is at level 122–282 ms after it (median
~135 ms). Shipping's WebView keeps a low-latency AAudio MMAP stream running the whole time.

## Price

| Option                                                                                                                                                                   | Effort to production | Removes                                                         | Covered by the robust audio rewrite? |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | --------------------------------------------------------------- | ------------------------------------ |
| **Ramp fix**: `createNativeGain` re-anchors at the running value and keeps its step cadence (Web Audio semantics, ~20 lines), plus a test calling `setVolume` every 8 ms | **½ day**            | The missing sound, on Android and (by code) iOS                 | No: Android stays on expo-audio      |
| Keep the current take playing muted between strokes while the drawing screen is in the foreground                                                                        | ½–1 day, unmeasured  | Part of the 122–282 ms start on Android; costs a running stream | No                                   |
| A native Android module (AAudio/Oboe) playing the three takes from PCM, mirroring the iOS rewrite                                                                        | 1½–2½ days           | The deep-buffer start; Android parity with shipping             | No: a separate Android module        |

The ramp fix was simulated, not built: a device build waits for the iPad run's disk window. The H1
runs stand in for it on the device (the same build reaches its level within 122–282 ms once the ramp
can advance).

## Left

* Build RN best plus the ramp fix after `dev-ipad.lock` clears, and rerun the counted set
  (`rn-sound/bin/batch.zsh`): expected 0 of 60 never, latency ~122–282 ms.
* iPad half of owner case 7. Same code; expected to show the same symptom at 120 Hz.
* Shipping's latency has no programmatic witness on Android here.
