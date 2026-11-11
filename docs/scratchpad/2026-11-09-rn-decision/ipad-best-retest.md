# iPad re-test of the best versions' fixes, and audio with Sound off

Lane: ipad-best-retest, 2026-11-11, Claude. Device: the iPad (iPad Pro 12.9-inch 5th gen, iPadOS
26.5). Arms: RN best `art.splotch.app.dev.best` (`claude/best-rn` @ `09f06e86c`, probe Release, app
binary sha256 `e602baf6…b493`) and shipping best `art.splotch.app.baseline.best`
(`claude/best-shipping` @ `f9d3b6ff6`, app binary `7ed74c15…7b77`), both already installed. Frozen
numbers come from `ipad-experiment.md` ("Device run result", `runs/device-20261110-173259`).

## Pre-registered read (written 2026-11-11 00:55 EST, before the run started)

A fix counts as **confirmed on the real iPad** when RN best shows 0 failures where frozen RN failed,
with shipping best still clean:

| Defect (fix on `claude/best-rn`)                      | Frozen RN on the iPad             | Confirmed when RN best shows                         | Shipping must show |
| ----------------------------------------------------- | --------------------------------- | ---------------------------------------------------- | ------------------ |
| New ink hidden after a rotation (d3e37c9f5)           | 1 of 36 invisible (block 5)       | 0 of 36 invisible                                    | 0 of 36 invisible  |
| Stroke ~0.3 s after closing Settings lost (a3754ff6c) | 3 of 3 lost at rest-300 (block 7) | stroke A lost 0 of 3 at rest-300                     | 0 of 3 lost        |
| Clear right after an Eraser lift fails (a3754ff6c)    | 5 of 5 valid tries failed         | Clear failed 0 of valid tries (and the error card 0) | 0 failed           |

Any RN best failure in a row means that fix **did not hold on this device**. A clean block 5 is weak
evidence on its own (frozen RN failed 1 in 36, so 0 of 36 is also likely by chance for an unfixed
build: (35/36)^36 ≈ 0.36); the read is reported with that caveat. The host-600 Settings condition
and the Pen controls are controls: a failure there in either arm is a new defect, not a fix result.

## Run

Command, with one deviation from the lane brief:
`zsh $C/ipad-experiment/bin/run-ipad-experiment.zsh --best --no-trace --blocks 5,7`. `--no-trace` is
an existing harness flag. Without it the device preflight runs a traced calibration (three lines per
arm under `xcrun xctrace`) before any block, which this lane must not do. Blocks 5 and 7 never read
the calibration (only blocks 1, 2 and 6 build trace windows), so their workload and scoring are
unchanged.

Harness change: `--best` (backup `experiment.mjs.bak-best`). It switches the two device bundle IDs,
writes `variant` and `bundleIds` into `preflight.json` and the preflight log line, and puts an "Arms
(best)" line at the top of `summary.md`. Nothing else changed.

Run directory: `$C/ipad-experiment/runs/device-20261111-004823` (00:48–01:55 EST, rc 0, 67 min;
`preflight.json` records `variant: best` and both IDs). Preflight found Sound on in both arms;
pacing gate `move32`, paced, 8.3 ms UIKit touch spacing in both arms. Block 5: 53 min, page and
theme churn applied 12 of 12 times per arm (Farm page, Dark, Light, clear), each arm's theme
restored to System. Block 7: 12 min, Auto-Save on Delete found off in both, orientation restored. No
trace was recorded, no lock was held by this lane during the run except the script's own
`dev-ipad.lock`, and the run released it.

## Result: all three fixes confirmed on the real iPad

| Defect                                          | Frozen RN (`device-20261110-173259`)                               | RN best                                                      | Shipping frozen → best | Read              |
| ----------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ | ---------------------- | ----------------- |
| New ink hidden after a rotation (block 5)       | 1 of 36 invisible (try 4, P→L after churn; still invisible at 3 s) | **0 of 36**; 72 of 72 new lines inked at the first shot      | 0 of 36 → 0 of 36      | **confirmed**     |
| Stroke A ~0.3 s after closing Settings          | lost 3 of 3 (rest-300)                                             | **landed 3 of 3** (coverage 0.995)                           | 0 of 3 → 0 of 3 lost   | **confirmed**     |
| Clear right after an Eraser lift                | failed 5 of 5 valid (error card 5, stroke lost 2); 5 tries invalid | **cleared 10 of 10, all valid**; error card 0, stroke lost 0 | cleared 10/10 → 10/10  | **confirmed**     |
| Knock-on: first Red stroke after a failed Clear | missing in 5 of 10 tries (made them invalid)                       | missing 0 of 10                                              | 0 → 0                  | gone with the fix |
| Controls: host-600 Settings, Pen control        | host-600 landed 3/3; Pen control cleared 2/2                       | host-600 landed 3/3; Pen control cleared 2/2                 | same                   | no new defect     |

Details. Block 5's first shot came 188–243 ms after each RN stroke (shipping 220–292 ms), so every
try was certifiable; Undo removed the line 36 of 36 in each arm. Unlike the frozen run, block 5's
input was paced for every gesture (108 of 108 per arm, no burst), so its pre-registered verdict
stands: both arms **clean**. The achieved block 7 gaps matched the frozen run within ~10 ms
(rest-300 sequences 956–959 ms spans in both runs; host-600 885–1,008 ms vs 876–1,035 ms), so the
two runs timed the same sequences. Caveat kept from the pre-registration: block 5's 0 of 36 is weak
on its own (an unfixed build at the frozen rate shows 0 of 36 about a third of the time); the
rotation fix's stronger evidence is the simulator gate and the childless-view guard test
(`spike-rotation.md`, `best-versions.md`). Block 7's two fixes went from 3 of 3 and 5 of 5 failures
to 0, which chance does not explain. RN best's dialog has no close animation (the instant-exit
variant, `best-versions.md`); that visual difference is already priced, not new.

## Part 2: audio with Sound off (iPad, best builds)

**Method.** Source at the installed commits (the audio code is identical in the frozen builds: RN
best adds only the 4-line first-stroke change in `src/audio/drawingAudio.ts`; shipping best adds
nothing to audio). Device: three batches under `dev-ipad.lock` with this lane's own WebDriverAgent,
Sound toggled only in each app's Settings and switched back on (found on in both, left on in both).
The iPad's unified log was collected afterwards (`pymobiledevice3 syslog collect`) and read for
`audiomxd`, iPadOS's audio-session server: session activation
(`cmsSetIsActive … going active/inactive`, with category and mixability), activation denials,
speaker output clients (`client starting/stopping`), and `RTAID` speaker-output reports, which
appear every 10 s only while the speaker output is running. Shipping's audio runs in its WebView's
GPU process (`com.apple.WebKit.GPU`, mapped to the app by audiomxd's "inherits from host pid" line).
Phase times come from the driver's marks. Scorer: `$C/ipad-best-retest/bin/phases.py`. No other app
was opened or played; no system setting was touched.

| Condition                                             | RN best (`art.splotch.app.dev.best`)                                                                                | Shipping best (`art.splotch.app.baseline.best`)                                                                                                                                                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sound on: a stroke, then 15 s idle                    | Session active 0.8 s around the stroke; speaker output started 01:56:21.99, stopped 01:56:23.18; nothing while idle | Session active and speaker output running **the whole time the app is in front** once its Web Audio context exists: 02:02:02.8 → 02:08:04.4 (6 min), stopped only by the home button. Best-run pacing gate: same, 33 s of foreground |
| Sound turned **off mid-session**, 60 s idle, a stroke | 0 activations, no speaker output                                                                                    | **Session stays active; speaker output keeps running** (RTAID every 10 s, −120 dB, digital silence) through the minute with Sound off and the stroke, until the app is backgrounded                                                  |
| **Relaunched with Sound off**, 60 s idle, a stroke    | 0 activations, no speaker output                                                                                    | Session created at launch but never activated; no speaker output (02:00:44–02:02:02)                                                                                                                                                 |
| Category                                              | AmbientSound, Mixable                                                                                               | AmbientSound, Mixable (normally; see the reset finding below)                                                                                                                                                                        |

**Source agrees.** RN: `PLAYBACK_AUDIO_MODE` sets `playsInSilentMode: false` and
`interruptionMode: 'mixWithOthers'`, which expo-audio maps to `.ambient` (`AudioModule.swift`
`setAudioMode`). Players use `keepAudioSessionActive: false`, so the session deactivates 100 ms
after each pause, and `setEnabled(false)` releases every player when Sound goes off
(`src/audio/drawingAudio.ts`, `soundGates.ts`). Nothing loads while Sound is off. Shipping sets no
audio-session category anywhere in `ios/App` (WebKit manages it). `preloadFirstDrawSound` creates
the one `AudioContext` only when `canPlayDrawingSound()` holds, so a launch with Sound off creates
none. Nothing ever suspends or closes that context (`web/src/lib/audio/drawingSound.ts`): once
created, it keeps WebKit's output running while the app is in front, Sound on or off. That is the
iPad counterpart of the Galaxy's J15 "AAudio stream `started` continuously".

**Answer.**

* **(a) Does opening the app with Sound off stop or duck a parent's other audio?** **No, in either
  arm.** With Sound off neither app activates an audio session at launch or while drawing. With
  Sound on, both play as AmbientSound + Mixable with no duck option, which mixes with other audio
  and never stops or ducks it. The exception is shipping after an audio-server reset, below: its
  category becomes one that would stop other audio, but iPadOS refused every activation, so the
  result was silence, not interruption.
* **(b) Does it keep an audio session active (battery)?** **RN: no.** It holds no session with Sound
  off, and with Sound on only around each sound (≤ ~1 s per stroke). **Shipping: not if it was
  launched with Sound off; yes if Sound was on at any point in that app process.** The WebView then
  holds an active session with the speaker output rendering silence continuously while the app is in
  front: idle with Sound on, and still after Sound is turned off, until the app is backgrounded or
  relaunched. The power cost was not measured (no power instrument here). Class **fixable**,
  unbuilt: suspend the context when Sound goes off or after a few idle seconds, and resume it on the
  next stroke. That is a few lines in `drawingSound.ts`, plus a first-sound latency check after
  resume.

## Side finding: shipping's sound goes silent after an iPadOS audio-server crash

`audiomxd` crashed twice during this run's block 5. At 01:04:30 and 01:30:32, launchd reported a
SIGKILL termination `(1, 7, 9)` and ReportCrash wrote a fatal report for the corpse. Both came ~4 s
after a shipping try that followed page and theme churn, as the harness switched to RN. The cause is
unknown and not attributed. Tonight's frozen run also shows three audiomxd restarts (pid 105 → 850 →
862 → 888; that run also recorded Instruments traces).

| After the reset                               | RN                                                                      | Shipping                                                                                                                                                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Best run, 01:04 → relaunch at 02:00           | Recovered on its own: AmbientSound, Mixable, 95+ activations in block 7 | WebView session came back **SoloAmbientSound, non-mixable**; **49 of 49** activation attempts denied ("not allowed to play … lock stopper"; "Operation denied. Cannot start playing"). **Drawing sound silent ~56 min**, until the app was relaunched |
| Frozen run, blocks 3, 4, 5, 7 (22:01 → 23:11) | Recovered                                                               | Same: SoloAmbient non-mixable, 77 of 77 attempts denied, no activation                                                                                                                                                                                |

Severity: **minor, shipping, unclear class.** The sound is lost until relaunch, but only after an
iPadOS audio-daemon crash, and whether real use (rather than this harness's rapid app switching)
triggers one is unknown. A fix is plausible: declare the Web Audio session as ambient
(`navigator.audioSession.type = 'ambient'`) and re-check it on resume. It is unbuilt and unverified.
This is also the first log evidence for shipping's Web Audio on the iPad: outside the reset it does
play (owner-packet case "Sound on/off, both apps" noted none).

## Raw data and cleanup

Device batches and screenshots:
`$C/ipad-best-retest/{audio-20261111-015550, audiomid-20261111-020435, home-20261111-020746}`
(marks, results, Settings screenshots showing Sound off and restored) and
`$C/ipad-best-retest/keyframes/` (RN best try 4 after churn, its post-Clear and post-Undo first
shots, a block 7 rest-300 and two Eraser→Clear results, both preflights). The run's `summary.md`,
`runs.jsonl`, `preflight.json` and `b7-timing.json` stay in its run directory. Device log archives,
their text extracts and the run's other screenshots were deleted after scoring.

## Could this flip the decision?

No. All three RN defects the real iPad reproduced are fixed in RN best and verified on the device,
so they stay "fixable". On audio, RN behaves better at rest: it holds no session with Sound off and
holds one only around each sound. Shipping keeps the speaker output running while in front once its
sound has started, and loses its sound after an audio-server reset. Both shipping issues are small
and fixable, so neither is a floor, and neither makes RN "clearly better for users" on its own.
