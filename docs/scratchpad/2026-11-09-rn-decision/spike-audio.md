# Fix spike: the RN iPad first-stroke hold

2026-11-10 00:00–01:56, Claude. Device: the iPad (Pro 12.9-inch 5th gen, iPadOS 26.5).

* **Frozen arm:** `art.splotch.app.dev`, the RN probe Release at 427756f14.
* **Spike arm:** `art.splotch.app.spike`, the RN probe Release of local branch
  `claude/spike-ios-first-stroke-audio` at 6c93c0993. That is 427756f14 plus one commit, never
  pushed.
* **Method:** perf.md's quiet cold replay. `bursty-120-240`, `--terminate-existing`, no Instruments,
  the log collected after the run.
* **Metrics:** the first-stroke hold is cohort 1's `longestGap`. The replay's `emissionLateness.max`
  is shown alongside.

Raw logs and scripts are in `spike-audio/` in the campaign scratch folder.

## Verdict

| Question                           | Answer                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause (Q1)                         | **Confirmed: the drawing sound.** With it off, 0 of 5 launches held. The mechanism is a **launch race**: the pencil takes are still unloaded when the first stroke starts, so loading them, priming them and the first play all happen during that stroke                                                                                           |
| Fix tried (Q2)                     | `createDrawingAudio`'s `setForeground(true)` now prepares the loop, as the Clear sound's already does. That is **4 lines** in `src/audio/drawingAudio.ts`, plus 1 new and 1 reordered test in `tools/tests/native-drawing-audio.test.mjs` (+20/−1 in 2 files). `npm run check` and the 6 audio test files pass. Without the fix, the new test fails |
| Gate (Q4): 10 cold, no gap ≥100 ms | **Strict rule: 9 of 10.** Run 1, the first launch after install, held 183 ms for a **non-audio** reason: a fresh install holds 97 ms with the drawing sound off. Leaving out first-after-install launches, **0 of 10** cold launches held (max 34.5 ms). The audio-race signature is gone in 12 of 12 sound-on spike launches                       |
| Sound still plays                  | Yes, by the log. Every run shows 9–12 AVPlayer `timeControlStatus=2` events and 6–7 audio-session activations (about one per stroke). Cohort 1 makes ~290 volume calls. No "Drawing sound is unavailable" message                                                                                                                                   |
| Effort to land                     | **½ day** for this fix: the code and test exist; left are the PR, review and `test:tools`. **1½–2½ days** for the robust AVAudioEngine fix                                                                                                                                                                                                          |
| Could it flip the decision?        | It removes the "major" first-stroke hold. The RN-only iPad defect drops to two minor holds: one once per install, and one ~113 ms hold on about 5% of loop wraps                                                                                                                                                                                    |

## Q1: sound-off control (frozen build, no code change)

The replay cannot toggle sound, so the setting was written as a persisted record instead.

* **The record:** a valid v16 `Documents/splotch-sound-settings-v1/sound-1.json` with
  `drawingSoundEnabled: false`. It was built with the app's own `snapshot()` and checked by a round
  trip through `parseSoundSettings` (`spike-audio/bin/sound-off-record.mjs`).
* **How it got there:** a single-file copy into the app's data container with
  `xcrun devicectl device copy to --domain-type appDataContainer --domain-identifier <bundle id>`.

| Arm                           | Cold launches | First-stroke gap ≥100 ms | First-stroke gaps, ms (emission max) | Launches the OS kept inactive ≥200 ms |
| ----------------------------- | ------------- | ------------------------ | ------------------------------------ | ------------------------------------- |
| Frozen, sound on (perf.md)    | 6 archived    | 3                        | **105, 123, 128** / 22, 38, 26       | 3, exactly the 3 that held            |
| Frozen, drawing sound **off** | 5             | **0**                    | 25, 20, 30, 26, 29 (all ≤25)         | 5 of 5                                |

## What actually holds (from the frozen runs' collected logs)

* **The launch window.** In every launch that held, UIKit kept the app **inactive for 204–857 ms**
  after launch (deactivation reason 12 was removed late). In every clean launch that window was 6–7
  ms.
* **The refused prepare.** During that window the drawing screen paints and goes idle, so
  `useDrawingProduct` calls its idle `audio.prepare()` while `AppState` is still `inactive`. The
  call is refused because `foreground` is false.
* **No retry.** `setForeground(true)` in `createDrawingAudio` does not prepare. The Clear sound's
  `setForeground` (`pageTurnSound.ts`) does: in exactly those launches, its player loaded 0.01 s
  after the app became active.
* **The first stroke does the loading.** Its `begin()` loads the three takes **2.5–3.2 s after
  activation**. It then primes one take while playing another, and activates the session for the
  first time, all during the stroke. That is perf.md's 119 ms `currentMediaSelection` wait in the
  hitches-1 trace. Just before it, a 169 ms synchronous `remoteXPCPlayer_SetRateWithOptions` XPC ran
  on a player queue.
* **When loading wins the race, priming works.** In the clean launches the takes loaded 0.2 s after
  activation. They were primed, and the session was deactivated, before the stroke. PR 3105's
  priming does its job, but only in that case.
* **Returning from the background (inferred from code, not measured).** Going to the background
  releases the takes, and only the next stroke reloads them. So in the frozen build the first stroke
  after any return to the app should hold the same way. The replay only runs at launch, so this was
  not measured.
* **perf.md's preflight hold (163 ms, 33 ms in) may not be the audio race.** It was probably the
  build's first launch after install; see the first-install row below. Its log is not archived.

## Q3/Q4: the spike's gate

* **Build:** installed beside the frozen builds (`SPLOTCH_APP_ID_SUFFIX=.spike`, derived data
  `builds/ios-dd-spike`, artifact `builds/rn-spike-audio/Splotch.app`). The bundle is stamped
  `6c93c0993` and was built from the spike worktree.
* **Launch conditions:** every gate launch was held inactive for 204–936 ms. The frozen build held
  in 3 of 3 such launches.

| Launches (spike, sound on unless noted)  | First-stroke gap, ms (@ ms into stroke)                    | Takes loaded, s after active | Notes                                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Gate 2–10 + one extra (10 cold launches) | 18.8, 22.9, 23.5, 18.9, 32.7, 20.6, 19.4, 31.8, 34.5, 22.7 | 0.01 in every run            | Primes done and the session deactivated 0.6–1.1 s after activation                                                          |
| Gate 1 (first launch after install)      | **183** (@13), emission max 126                            | 0.01                         | The takes were loaded and primed 2 s before the stroke. 16 "Metal Compiling Shader" lines and 518 network tasks in this run |
| Fresh install, drawing sound **off**     | **97** (@12), emission max 84                              | none                         | The same 16 shader compiles and 518 network tasks. The hold does not need the sound                                         |
| Fresh install, sound on (repeat)         | 81 (@33), emission max 78                                  | 0.06–0.08                    | Same signature                                                                                                              |

* **A first-launch-after-install hold (new, minor, not audio).** On a fresh install the first stroke
  holds 81–183 ms about 12–33 ms in, with or without sound. It is the only launch type (3 of 24 on
  either build) where Metal compiles shaders and the coloring packs download, and both land inside
  the hold. It happens once per install, and probably again after an update. It is RN only as far as
  measured; shipping's equivalent is unmeasured. Warming up Skia's pipelines at launch is the
  obvious probe.
* **A rarer later-stroke hold (in both builds; the fix does not cause it).** Gate runs 9 and 10 each
  held a *later* stroke for 113 ms. Both times this happened exactly when a looping take reached its
  end and the player moved on to its queued copy, an item that had never played
  (`_advanceCurrentItemAccordingToFigPlaybackItem`, right after that copy's
  `BatchPropertyLoadComplete`). Priming covers only each take's first item. The takes are 5.04 s
  long and start at a random point, so long strokes wrap often. 2 of the 39 wraps in all 18 sound-on
  runs held (0 of 13 on the frozen build). That rate fits the frozen build's 0 holds in 24 later
  strokes. It is the issue 3028/3003 class (an unprimed `AVPlayerItem`) again.

## Effort and risk

| Option                                                                                                                                 | Effort to production | Removes                                                                                              | Risk it adds or leaves                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| This spike (prepare on return to the foreground)                                                                                       | ½ day                | The launch race, and by code the reload after returning from the background                          | **Low.** Session use is unchanged (`mixWithOthers`), and the session still deactivates ~1 s after priming, so there is no battery cost. A volume-0 prime now runs on every return to the foreground. The web export shares this code, so a tab that becomes visible again re-prepares, the same path as its idle startup prepare. **Left:** a touch within ~1 s of the app becoming active still meets the load and prime; the loop-wrap hold (~5% of wraps); the first-install hold |
| `keepAudioSessionActive: true` (perf.md's first idea)                                                                                  | not tried            | Probably nothing: the session activating at stroke time is a symptom of the late load, not the cause | Keeps the session active the whole time the app is in the foreground                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Play the 3 takes from AVAudioEngine/AVAudioPlayerNode buffers (an iOS module, as `SplotchClearSound` already does for the Clear notes) | 1½–2½ days           | On iOS: the first-play, loop-wrap and seek holds (issues 3003, 3028); priming and cueing can go      | A new native module to own: gain ramps, interruptions, media-services reset, route changes. Android stays on expo-audio                                                                                                                                                                                                                                                                                                                                                              |

Incident (fixed): restoring the sound-off control's record, a `devicectl copy to` of an empty
*directory* with `--remove-existing-content true` wiped the frozen probe's whole `Documents` folder.
Two files mattered, and both were restored by 00:36:

* `splotch-settings-activity-sessions.txt` = "6". This is inferred: the per-launch counter saturates
  at 6 and had not changed since 23:05.
* `splotch-last-network-online` = "true".

The app recreates its three empty directories itself on its next launch. `Library/` was not touched.
Recorded in RIG.md.
