# iPad stall ink: strokes started during each arm's natural busy moments (BLOCKED)

Lane: ipad-stall-ink, 2026-11-11 04:02 → 04:20 EST, Claude. Device: the iPad (iPad Pro 12.9-inch 5th
gen, iPadOS 26.5, 120 Hz). Arms, best versions already installed: RN best v2
`art.splotch.app.dev.best` (`claude/best-rn` @ `e703b8b79`, probe Release) and shipping best
`art.splotch.app.baseline.best` (`claude/best-shipping` @ `f9d3b6ff6`). The Galaxy version of this
lane is `stall-ink.md`. Key frames: `ipad-stall-ink/keep/` in the campaign scratch folder.

**Status: no counted capture was made. The iPad is locked behind its passcode, and only the owner
can unlock it.** Both causes are below. The plan stays pre-registered for a re-run.

## What happened

| Time (EST) | Step                                                                                                | Result                                                                                                                                                                                                                         |
| ---------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 04:05      | `dev-ipad.lock` taken; iPad free space 119.0 GB (stop line 12 GB); own WebDriverAgent (WDA) started | WDA ready. Both best apps in landscape, Pen, Purple, cleared page, same chrome geometry (Save at 366,962 pt)                                                                                                                   |
| 04:06      | Functional check before any timing: RN best, one Pen line, tap **Save screenshot**                  | iPadOS's Photos prompt: "“Splotch” would like to add to your Photos" (Don't Allow / Allow). **RN best has never been granted Photos on the iPad.** WDA's `/alert/text` did not see it (it belongs to SpringBoard, not the app) |
| 04:07      | Left unanswered, as the brief requires; terminated RN best (`devicectl … terminate`) to remove it   | The prompt stayed on the home screen after the app died (`keep/prompt-after-app-killed.png`)                                                                                                                                   |
| 04:07      | WDA `/wda/lock`, then `/wda/unlock`, to dismiss the prompt without choosing                         | **The iPad has a passcode** (`ideviceinfo -k PasswordProtected` = true; the rig note "passcode not required" was stale). `/wda/unlock` stops at "Enter Passcode" (`keep/passcode-after-lock.png`)                              |
| 04:11      | WDA stopped. Nothing entered or guessed at the passcode screen. Warning added to the rig file       | No lane can drive the iPad until the owner unlocks it                                                                                                                                                                          |

Lesson (rig file): never send `/wda/lock` to the iPad. A permission prompt outlives the app that
raised it, so the only clean exits are the owner's answer or leaving the device untouched.

## Pre-registered numbers (written 04:15 EST, before any counted capture)

Same moments, delays and thresholds as `stall-ink.md`, adapted to WDA on the iPad. The
orchestrator's three round-3 corrections apply: (1) the unit is the **trial**, one independent busy
action; line counts are secondary; (2) a chord on the **primary** finger counts, as on an extra one;
(3) a lock or a late packet is not a class by itself: **fixable** only with a fix that passes its
gate, **floor** only with a demonstrated tradeoff, otherwise **unclear**.

**Moments** (dense picture first: four 2 s Crayon scribbles over the top third, then Pen):

| Code | Busy moment                                                   | Delay measured from      | Needs                        |
| ---- | ------------------------------------------------------------- | ------------------------ | ---------------------------- |
| N    | none (input-path control), 3 one-finger + 3 two-finger trials | –                        | –                            |
| D    | Settings opened, closed with × (known-window control)         | the × tap's release      | –                            |
| S    | Save (camera button)                                          | the Save tap's release   | Photos add access in the app |
| C    | Clear with Auto-Save on Delete on (switched back off after)   | the Clear drag's release | Photos add access in the app |
| U, R | Undo burst, resume (only if time is left)                     | as on the Galaxy         | –                            |

Delays 100, 300 and 700 ms; per moment and delay 3 one-finger and 3 two-finger trials per arm, arms
alternating per trial set.

**Building a delay with WDA.** XCTest drops idle time between contacts that do not overlap inside
one request (the next touch lands 1–3 frames after a lift), and two requests leave 0.46–0.58 s
between them (`ipad-input-loss.md`). So a trial is one request: the busy tap (60 ms hold), then a
rest contact on the Purple swatch (the current colour, so its tap changes nothing) held D − 2 joins,
then the probe. The rest-contact trick is how block 7 reached ~0.3 s after a dialog
(`ipad-best-retest.md`). The N trials use the same request with the busy tap on Purple too, so they
also control for the rest contact.

**Probe strokes.** One finger: a 600 ms left-to-right wave, x 300 → 780 pt (800 pt/s), amplitude 16
pt, wavelength 160 pt, as 32 ms waypoints (`move32`: XCTest interpolates touches at the display rate
between them; the device pacing gate measured 8.3 ms). Two fingers: the same wave twice, 90 pt
apart, in lockstep (down and up together), because XCTest moves a touch onto another contact's
position when contacts lift one at a time (`ipad-experiment.md`, probe 9). A warm control stroke on
its own row 1.5 s after the probe. Scoring screenshot 2.5 s after the probe lifts, after both apps'
save polaroid has gone.

**Timing on iOS without video or Instruments**, per quantity:

| Quantity                    | Source                                                                                                                                      | Error                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Achieved delay              | UIKit `EventDispatch` touch frames in the unified log, collected after each batch (stages nothing on the iPad): busy lift → probe down      | ±1 frame (8.3 ms) per end. UIKit logs on the app's main thread, so a main-thread stall makes it read long |
| Fallback delay              | Planned offsets plus the two joins measured in the N trials                                                                                 | ±2 frames                                                                                                 |
| RN lateness                 | Probe cohort: `firstDotMs` (first sample → first dot handed off) and max `receiptLag` (native touch timestamp → JavaScript receipt)         | ms; independent of the host clock and of main-thread logging                                              |
| RN lost vs refused          | Cohort present with `strokes 0` = reached the paper and refused; no cohort = never reached it                                               | exact                                                                                                     |
| Shipping first-ink lateness | **Not timeable** here (no video, no Instruments, release WebView not inspectable)                                                           | –                                                                                                         |
| Shipping stall witness      | A chord's x extent ÷ 0.8 pt/ms = how long into the stroke the samples were dropped                                                          | ±1 waypoint (32 ms)                                                                                       |
| WDA pacing                  | Every probe's touch frames: span 0.8–1.25× planned, median ≤ 12 ms, ≥ 80% of 100 ms bins hit; else the trial is invalid (burst), not scored | –                                                                                                         |

**Scoring per line** (final screenshot; RN also its cohort): **lost** < 20% of the x span inked;
**cut** 20–90%; **chord** < 80% of inked columns within 4 pt of the wave's centre line, where the
arm's own N controls score ≥ 90%; **late** (RN only) `firstDotMs` or max `receiptLag` ≥ 100 ms above
the N controls' median. A trial is **hit** when any of its lines is lost, cut, chord or late.

**Positive controls before counting.** Per arm: N trials inked and chord-free (3/3 + 3/3); D at 300
and 700 ms shows the known windows (RN best inks, shipping inks from ~0.25 s); a chord control (a
wave whose middle 60, 120 and 200 ms are one straight segment) must be flagged 3/3 in both arms. If
the two-finger N trials fail in an arm, two-finger trials are dropped there.

**What would change the decision** (RN must be clearly better for users; a tie goes to shipping):

| Finding                                                                                                                                             | Severity and effect                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| An arm has **≥ 2 of 6 trials hit** at 300 or 700 ms for one moment (1 of 6: 3 more trials, pooled ≥ 2 of 9), or RN late ≥ 250 ms in ≥ 2 of 3 trials | **major** for that arm                                                                                   |
| The same at 100 ms only                                                                                                                             | **minor**, unless the other arm is clean there                                                           |
| Shipping chords or loses in ≥ 2 of 6 trials after one moment on the iPad (WebKit)                                                                   | the only result here that could move the verdict toward RN, and only with a class better than "unclear"  |
| RN major on the iPad                                                                                                                                | adds to RN's bill; floor only if moving export off the JavaScript thread is shown to need a big tradeoff |
| Any hang or crash in either arm                                                                                                                     | reported per arm with its rate; blocker-class if it loses the drawing                                    |
| Neither arm crosses a line                                                                                                                          | no change                                                                                                |

## What the code predicts (no device evidence)

Read at the installed commits; platform-shared code unless noted.

| Moment               | RN best (`e703b8b79`)                                                                                                                                                                                                                                                                                                                                                          | Shipping best (`f9d3b6ff6`)                                                                                                                                                                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Save                 | `useSaveAction` runs `capturePicture` (`surface.exportPng`) inside `runCommand`: the input lock covers the export, then is released before `savePicture` asks Photos. No platform branch, so iOS should also **lose** strokes begun during the export; how long that is on the iPad is unmeasured (Galaxy ~1.1 s of JS work). The prompt seen at 04:06 came after this capture | PNG encode in a Web Worker, then `FileReader.readAsDataURL` and `Media.savePhoto({ path: dataUrl })` (`web/src/lib/drawing/imageSave.ts`): a multi-MB string crosses the Capacitor bridge, parsed on the app's main thread, where UIKit takes touches. Whether that bends, delays or drops samples on WebKit is the open device question |
| Auto-saving Clear    | Clear wipes at once (`keepDepartingPicture`, no lock) and exports the departing picture on the JS thread: ink should land **late**, not lost (Galaxy 0.3–1.2 s)                                                                                                                                                                                                                | Same export and bridge path as Save, without the polaroid                                                                                                                                                                                                                                                                                |
| Photos never granted | Both moments end in the Photos prompt on first use, so neither can be measured on the best builds until the owner answers it                                                                                                                                                                                                                                                   | Not tested; probably the same (no earlier lane saved from this bundle ID on the iPad)                                                                                                                                                                                                                                                    |

`useSavePicture.ts` is identical in the frozen RN probe (`427756f14`), whose app on the iPad
(`art.splotch.app.dev`) holds Photos access since owner case 1 (2026-11-10), as does frozen shipping
(`art.splotch.app.baseline.main`). The export internals differ (best changed `DrawingSurface`,
`skiaInkScene` and others), so a Save run on the frozen builds would test the lock, not the best
version's export time, and frozen RN's Clear still has the lock the best version removed.

## To re-run

1. Owner: unlock the iPad, then answer RN best's pending Photos prompt and decide whether both best
   apps may add to Photos (Save and auto-saving Clear need it; lanes never answer it).
2. A lane takes `dev-ipad.lock`, checks free space (≥ 12 GB), starts WDA
   (`ipad-experiment/bin/wda-up.zsh device …`), runs the positive controls above, then S and C,
   taking `rig.lock` per batch. Expected ≈ 1.5 h for both arms.
3. Clear RN best's page first: it holds the one Pen line from 04:06.

## Could this flip the decision?

No. Nothing was measured. The iPad half of the Save and auto-saving Clear question is still open,
and the Galaxy result stands alone. The code says RN's Save lock should repeat on iOS (a priced
repair on the Galaxy) and leaves WebKit's behaviour after shipping's export unknown.

## State left behind

* The iPad: **locked at the passcode screen** since 04:07. RN best terminated with one purple line
  on its page and its Photos prompt unanswered (it may still show after unlock). Shipping best
  untouched (it was in front at 04:05; Pen, Purple, cleared page). Sound, Auto-Save and orientation
  unchanged in both. The store app never touched. No Instruments, no reboot, no picture saved.
* WDA stopped; `dev-ipad.lock` released; `rig.lock` never taken (no timed capture).
* Scratch: `ipad-stall-ink/` (16 MB: three key frames in `keep/`, look screenshots, `bin/x.mjs` and
  `bin/savecheck.mjs`).
