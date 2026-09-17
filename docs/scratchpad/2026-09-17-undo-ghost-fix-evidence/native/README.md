# iPad native (WKWebView) confirmation of the undo-ghost fix — 2026-09-17

The gap left open when PR #2057 merged: iPad Safari and both Android targets were validated, the
iPad **native** app was not. This packet closes it. Nothing here is a new change — it is validation
of merged work.

## Exact build under test

| What           | Value                                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product commit | 952ee0681fe0260f637b7217eb981df757627eb2 (the merge commit of PR #2057)                                                                                                          |
| Checkout       | clean worktree detached at that commit; `git status` empty before and after                                                                                                      |
| Web bundle     | `npm run cap:sync` → bundled static export in `ios/App/App/public` (no `server.url`, no LAN)                                                                                     |
| App build      | `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -destination id=<ipad> -derivedDataPath build -xcconfig ../local.xcconfig -allowProvisioningUpdates` |
| Install        | `xcrun devicectl device install app` → `art.splotch.app`, installationURL `…/C6226688-A40D-4B87-9D59-F35D871C75DB/App.app/`                                                      |

**Proof the installed app carries the fix**, checked in the built `App.app` before installing it:

* `App.app/public/_app/immutable/assets/0.DIIW4Zqb.css` contains `forwards paused` — the ghost's
  animation is declared paused.
* `App.app/public/_app/immutable/chunks/BWXFRaoC.js` contains `undo-ink-running` — the class
  `runWhenPainted` adds.

A note on how that proof came about: `npm run ios:run:device` reported "Running xcodebuild" and
"Deploying App.app" successfully, but the bundle it produced could not be located on disk, so what
reached the device could not be verified. The app was therefore rebuilt to an explicit
`-derivedDataPath`, that bundle's contents were checked, and **that** bundle was installed. A
successful deploy line is not evidence of which bundle was deployed.

## Device and driver

* iPad Pro 12.9-inch (5th generation), iPadOS 26.5, ProMotion on.
* Driven by WebDriverAgent W3C touch actions, launched directly with
  `xcodebuild test-without-building` plus `iproxy` — Appium's real-device discovery again reported
  the iPad's UDID as unknown (stale tunnel registry), as in the earlier passes.
* Recorded by XCTest screen recording (`/wda/video/start`, 60 fps, a frame written only on change).
  Every clip plays at normal speed.

## Verdicts

| Case                                           | Verdict            | Evidence                                                                                          |
| ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------- |
| Crayon ghost presents its intended early phase | pass               | 5 runs (3 landscape, 2 portrait), first visible frame 0.56–0.73 of the stroke                     |
| Older yellow ink stays stationary              | pass               | centroid moves ≤ 4.5 video px, not steadily                                                       |
| Crossing gaps remain correct                   | pass               | frame strip: blue passes under the yellow, gaps at crossings                                      |
| Magic ink still correct                        | pass               | 0.90 → 0.70 → 0.50 → 0.37 → 0.25, fades to ~0.07                                                  |
| Reduced motion suppresses the ghost            | pass               | crayon 1.00 → 0.07 → 0.02 in two frames, no fade curve; magic 0.99 → 0.06                         |
| Rapid repeated undo leaves no stale ghost      | pass               | second tap 120 ms after the first cuts the first ghost 0.94 → 0.09 in one frame; paper ends clean |
| Cancellation leaves no stale ghost             | pass, with a limit | see below                                                                                         |

### The crayon comparison

Ghost ink as a fraction of the stroke, per recorded frame, starting at the last full-ink frame:

| Run                                      | Series                                                   |
| ---------------------------------------- | -------------------------------------------------------- |
| **Before**, portrait (4 runs, published) | 0.97 → **0.14–0.18** → 0.12–0.15 → 0.10–0.12 → 0.08–0.10 |
| After, portrait run 1                    | 0.97 → 0.96 → **0.73** → 0.58 → 0.47 → 0.38              |
| After, portrait run 2                    | 0.96 → 0.97 → **0.63** → 0.49 → 0.38 → 0.32              |
| After, landscape run 1                   | 0.97 → 0.93 → **0.56** → 0.44 → 0.37 → 0.30              |
| After, landscape run 2                   | 0.98 → 0.95 → **0.58** → 0.47 → 0.37 → 0.31              |
| After, landscape run 3                   | 0.98 → 0.95 → **0.68** → 0.52 → 0.44 → 0.34              |

The before rows are the **previously published** numbers from
`docs/scratchpad/2026-09-17-undo-ghost-device-validation/ghost-ink-curves.txt` on
`claude/issue-1775-device-evidence`, produced by the same measuring script. They were not re-derived
here: that clip does not decode cleanly with this session's frame extractor (it yields a distorted
338×2374 frame), so re-measuring it would have introduced a geometry difference the published
numbers do not have.

## Comparison limits

* **Orientation.** The published baseline was captured in portrait. Both orientations were captured
  here; the portrait runs are the like-for-like comparison, and the landscape runs are included
  because the session's other targets were landscape. Stroke geometry — and therefore the ghost's
  area — differs between them, so compare within an orientation.
* **Different sessions.** Before and after were captured in separate sessions on the same device,
  not back to back. The driver, recorder, gesture shapes and measuring script are the same.
* **The measure.** A per-frame pixel difference: it shows what reached the screen, not computed
  opacity. Its tail has a residue floor (compression, and the blue/yellow overlap), so read the
  first frames after the ink goes, not the last.

## Improved presentation vs unchanged rendering cost

These are separate facts and only the first is demonstrated here:

* **Presentation phase, improved:** the ghost's first visible frame now carries 0.56–0.73 of the
  stroke rather than 0.14–0.18, and the fade proceeds smoothly from there. That is the animation
  starting at its first keyframe instead of a quarter of the way through.
* **Ghost rendering cost, unchanged and not measured on native:** the ~70 ms the ghost's own canvas
  takes to rasterize was measured on iPad **Safari** with an instrumented build. That build was not
  installed natively, so this packet makes no claim about the native figure. The merged change adds
  no work to that path — it moves only when the animation's clock starts — and the ghost still does
  not appear until its first frame is painted.

## The cancellation limit

Drawing a new stroke *while the ghost is still fading* could not be injected on the device:

* A tap on Undo followed by a stroke inside the **same** W3C pointer sequence has its undo tap
  swallowed — the blue stroke stays on the paper, so no undo happened (captured twice, at 60 ms and
  160 ms gaps).
* Two **parallel** pointer sources in one payload are rejected by WebDriverAgent.
* Two **separate** requests serialize: the stroke lands ~300 ms+ after the tap, by which time the
  fade has finished (measured: the ghost ran 0.90 → 0.01 before the stroke began).

So cancellation was confirmed by the paths that could be driven:

* **Rapid repeated undo** — the second undo cancels the first ghost mid-fade, which is the same
  `cancel()` path, and with the first ghost's deferred start still pending. The first ghost is cut
  from 0.94 to 0.09 in a single frame and the paper ends with both strokes gone and nothing left
  over (`1775-native-rapid-fast-after.png`).
* **Draw after the fade** — correct end state: the undone blue is gone, the older yellow untouched,
  the new red stroke present, no ghost residue (`1775-native-cancel-mid-after.png`).
* The draw-cancels-a-live-ghost path is covered in CI by `web/tests/drawing-motion.spec.ts` ("undo
  retires ink immediately beneath a shrinking overlay and drawing cancels it"), which pauses the
  animation and draws while the overlay is on screen.

## Files

| File                                    | What it is                                                     |
| --------------------------------------- | -------------------------------------------------------------- |
| `1775-native-after-crayon-t{1,2,3}.mov` | Crayon undo, landscape, normal speed                           |
| `1775-native-after-portrait-t{1,2}.mov` | Crayon undo, portrait — the like-for-like baseline comparison  |
| `1775-native-after-magic-t1.mov`        | Magic-ink undo on a coloring page                              |
| `1775-native-after-reduced-*.mov`       | Reduce Motion on, crayon and magic                             |
| `1775-native-rapid-fast.mov`            | Two undos 120 ms apart                                         |
| `1775-native-rapid-double.mov`          | Two undos ~440 ms apart                                        |
| `1775-native-cancel-mid.mov`            | Undo, then a new stroke as soon as the driver could deliver it |
| `1775-native-after-crayon-frames.png`   | Frame strip at fixed offsets from the last full-ink frame      |
| `ghost-ink-native-after.txt`            | The per-frame numbers behind the table                         |
| `*.json`                                | Driver logs with host timestamps for every step                |

Reduce Motion was switched back off and the app returned to landscape after the captures.
