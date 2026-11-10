# Drawing-performance lane

2026-11-09/10, Claude. Devices: the Galaxy (S21 FE, Android 16, 120 Hz) and the iPad (Pro 12.9-inch
5th gen, iPadOS 26.5, 120 Hz). Arms: RN = `art.splotch.app.dev` (RN source 427756f14), shipping =
`art.splotch.app.baseline.main` (shipping source ef3d1eb20). Both Release. Raw logs, traces and
screenshots: `perf/` in the campaign scratch folder (rig file).

## Pre-registered decision numbers (written before any capture)

A difference smaller than the "flip" margin is a **tie**, and a tie goes to shipping. "Not measured"
is not "equal".

| Device | Metric                                                                                                        | RN wins if                                                                                                                                | RN loses if                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Galaxy | `gfxinfo` janky-frame share, swipe workload, median of 3                                                      | ≥0.5 points lower than shipping, ranges not overlapping, and p99 frame time not worse                                                     | ≥0.5 points higher (ranges not overlapping) **or** p99 ≥8.3 ms (one frame) worse |
| Galaxy | Frame time p90 / p99                                                                                          | supporting only                                                                                                                           | p99 worse by ≥8.3 ms in the median                                               |
| Galaxy | Cold launch `am start -W -S` TotalTime, median of 3                                                           | ≥100 ms faster, ranges not overlapping                                                                                                    | ≥100 ms slower, ranges not overlapping                                           |
| Galaxy | PSS after ~300 strokes                                                                                        | supporting only                                                                                                                           | ≥1.5× shipping **and** >400 MB, or growth across the session ≥2× shipping's      |
| iPad   | Fair pair (same WDA gesture into both, all-process Animation Hitches)                                         | shipping freezes ≥100 ms in ≥4 of 6 dense-Crayon runs, RN in none, and RN cuts lost in-contact time ≥50% in every pair (coordinator rule) | RN freezes ≥100 ms in ≥2 runs where shipping does not                            |
| iPad   | Fallback (no WDA): RN native replay under Animation Hitches                                                   | **cannot** award an iPad win (asymmetric input path)                                                                                      | hitch-time ratio >5 ms/s in contact, or a ≥100 ms hitch in ≥2 of 3 runs          |
| iPad   | Cold launch, median of 3                                                                                      | ≥100 ms faster, ranges not overlapping                                                                                                    | ≥100 ms slower, ranges not overlapping                                           |
| Both   | First-stroke hold (RN probe `emissionLateness` / `firstDotMs` on the first cohort after a normal cold launch) | —                                                                                                                                         | **major** if >100 ms in ordinary use; **blocker** if the first stroke loses ink  |

Interpretive guardrails, also fixed in advance:

* A Galaxy `gfxinfo` win alone is a presentation-counter win, not "clearly better for users": both
  arms were already under ~2.2% janky in October. Android weighs second; it cannot answer the iPad
  question.
* The October Galaxy pair (RN 1.50% vs shipping 2.10% janky, 312 vs 677 ms launch) compared an RN
  **Release** with a shipping **Debug** build at older sources. The Release-vs-Release numbers below
  supersede it.
* Every cold first-stroke attempt is kept; iOS logs are collected after the run, never streamed.

## Galaxy (app-agnostic, Release vs Release)

Settings, both arms, read from each app's Settings: light, portrait lock, Sound on at 50% (as
shipped), default Pen, default purple, default size, no coloring page; 7 extra coloring books ready
in both (shipping's download settled before capture). RN = the **plain** Release (probe compiled
out, APK sha256 371533dd…). Shipping APK sha256 df2529e2…. Android 16, WebView 157.0.8103.38,
battery 100% on USB, thermal status 0. Runs interleaved S R R S S R; app foreground confirmed before
every swipe batch; every run's ink admitted (blank before, ~250k ink pixels after in both arms).
Input = `adb shell input swipe` (OS injection path, identical for both). The `jank.py` script was
not found; `perf/bin/galaxy-draw.sh` rebuilds its documented workload (twelve 700 ms swipes, 250 ms
gaps, Clear settled 3 s before `gfxinfo` reset). RN draws ink into a Skia `TextureView` (default
`opaque=false`), so its ink frames go through the app's HWUI frames that `gfxinfo` counts;
shipping's WebView draws through HWUI's functor, also counted.

| Metric (pre-registered)                                     | Shipping runs → median                     | RN runs → median              | Verdict by the pre-registered rule |
| ----------------------------------------------------------- | ------------------------------------------ | ----------------------------- | ---------------------------------- |
| Janky-frame share, 12-swipe workload                        | 1.86, 1.37, 1.78% → **1.78%**              | 1.45, 1.53, 0.96% → **1.45%** | **Tie** (−0.33 pt, ranges overlap) |
| Frame time p50 / p90 / p99 (ms, gfxinfo)                    | 9/10/11, 9/10/11, 9/10/12                  | 7/8/10, 7/8/10, 6/8/10        | RN 1–2 ms lower; not "worse"       |
| Cold launch `am start -W -S` TotalTime, ms                  | 355, 333, 323 → **333**                    | 300, 285, 274 → **285**       | **Tie** (−48 ms, under 100)        |
| PSS after 300 strokes (app + WebView renderer for shipping) | ≈321, 320 MB (run 1 renderer not captured) | 310, 306, 314 MB              | **Tie** (no arm ≥1.5×)             |

Supplementary (not pre-registered; added once the first numbers were in):

| Metric                                                                             | Shipping                                                                               | RN                            | Reading                                                                                                                                                |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Janky share, **dense** session (300 × 150 ms strokes into one picture)             | 2.55, 2.41, 2.61% → **2.55%** (`Slow issue draw commands` 136, 115, 126 vs RN 3, 3, 0) | 0.37, 0.30, 0.33% → **0.33%** | RN ahead by 2.2 pt, non-overlapping. Shipping's misses are render-thread (WebView functor) draws. Both arms under 3%: a counter win, not a visible one |
| p99 frame time, dense (ms)                                                         | 12, 11, 11                                                                             | 10, 16, 10                    | Tie                                                                                                                                                    |
| PSS before → after the dense session (MB)                                          | app 168.5→163.0 + renderer 107.3→158.1 = 276→321; 279→320                              | 256→310, 256→306, 255→314     | Growth RN +50…59 MB, shipping +41…45 MB; same end point                                                                                                |
| Launch to drawing controls visible (screen-recorded, trash button first drawn), ms | 452, 446, 480 → **452**                                                                | 633, 600, 601 → **601**       | Shipping shows the controls ~150 ms sooner, though RN's `TotalTime` is lower (RN's first frame is its splash; controls come later)                     |
| Launch to settled screen, ms                                                       | 619, 605, 637                                                                          | 691, 649, 620                 | Tie                                                                                                                                                    |

Defect seen on the way (RN only, **cosmetic**): RN's first drawn UI frame paints the toolbar under
the status bar, then jumps it down a frame or two later as the safe-area inset and paper grain
arrive (`perf/shots/rn-launch-toolbar-shift.png`). Shipping draws the toolbar in place and only
fades the status-bar colour.

**Galaxy verdict:** on the pre-registered workload RN and shipping tie on smoothness, launch and
memory. On a dense 300-stroke picture shipping misses ~3 frames/s at 120 Hz (2.5%) where RN misses
~0.4/s — a real but small counter difference that a toddler is unlikely to see. Shipping shows its
controls ~150 ms sooner on a cold launch. Nothing here clears the "clearly better for users" bar.

## iPad

**The fair pair could not run.** WebDriverAgent still fails "Timed out while enabling automation
mode" at 22:15 and 23:22 (Settings › Developer › Enable UI Automation not yet granted), so no OS
gesture can reach either app and the pre-registered 6-pair dense-Crayon rule is **unscored**. Per
the rule, unknown keeps shipping for now. Shipping's in-page fallback was also closed: the frozen
shipping iOS build is Release, whose WKWebView Capacitor leaves non-inspectable, and
`pymobiledevice3 webinspector opened-tabs` found nothing to attach to (Web Inspector also appears
off). Building an inspectable shipping variant would change the arm, so it was not attempted (≈10
minutes of the 45-minute fallback box used).

Both arms on the iPad run Night Mode and landscape (they follow the device; no touch to change it).

### RN only: native replay under all-process Animation Hitches

RN probe Release (`art.splotch.app.dev`, RN 427756f14), `bursty-120-240` (5 strokes, 1,428 packets,
Pen), cold launch per run, `xctrace record --template 'Animation Hitches' --all-processes`, log
collected after the run. Scored from `hitches-frame-lifetimes` (display swap gaps inside each
stroke, first 80 ms of each stroke skipped as alignment margin because the replay line is stamped
from JavaScript after the last emission) and from the app's rows in `hitches`.

| Run                                                             | Lost in-contact presentation time  | Longest in-contact gap | Gaps ≥100 ms | App hitches (count, ms/s of contact) |
| --------------------------------------------------------------- | ---------------------------------- | ---------------------- | ------------ | ------------------------------------ |
| 1                                                               | 207 ms (1.78%); stroke 1 alone 161 | **126 ms** (stroke 1)  | 1            | 2 × 8 ms, 1.4 ms/s                   |
| 2                                                               | 75 ms (0.64%)                      | 31 ms                  | 0            | 2 × 8 ms, 1.4 ms/s                   |
| 3                                                               | 70 ms (0.60%)                      | 31 ms                  | 0            | 2 × 8 ms, 1.4 ms/s                   |
| `finger-session-1` (35.6 s, 23 strokes, up to 2 fingers; 1 run) | 181 ms (1.43%); stroke 1 alone 141 | **134 ms** (stroke 1)  | 1            | 1 × 8 ms, 0.7 ms/s                   |

Pre-registered fallback rule: RN fails if the hitch ratio is >5 ms/s (it is 1.4) or a ≥100 ms freeze
appears in ≥2 of 3 runs (1 of 3 `bursty` runs). **RN passes, narrowly**, and the one freeze is the
first-stroke hold below. Apple's `hitches` table did not flag the 126 ms freeze at all — no frame
was pending while the main thread was blocked — so only the frame-lifetime gaps catch it, as
shipping's `PROFILING-IPAD.md` warned. Outside the first stroke, RN's in-contact presentation is
close to clean (≤17 ms lost per 2.4 s stroke; ≤10 ms per stroke in the finger session, whose
two-finger segments the scorer pairs approximately). This says nothing about shipping, and the
replay bypasses UIKit touch delivery, so it is a renderer result, not a user-input result.

### Cold launch, both arms

`xctrace record --template 'App Launch' --launch -- <bundle id>`, process terminated first,
interleaved S R R S S R; RN = **plain** Release (`rn-plain/Splotch.app`, binary sha256 5078bb75…),
shipping = `App.app` (binary sha256 a6538949…). Measured from the process's first lifecycle phase to
the end of "Initial Frame Rendering" — the first native frame, which in both apps is the launch
screen, not the drawing UI.

| Arm      | First frame, ms (3 runs) → median | To "Foreground – Active", ms |
| -------- | --------------------------------- | ---------------------------- |
| Shipping | 125, 124, 117 → **124**           | 142, 141, 134                |
| RN       | 458\*, 100, 111 → **111**         | 461, 120, 114                |

\* first launch after installing the plain build (360 ms in system interface initialization, a
one-off dyld cost); a pre-run shipping launch after a long idle took 322 ms the same way. **Tie**
(13 ms). Time to a drawable screen is **not measured on the iPad**: no screen recording is available
there, and the Galaxy shows that first-frame timing can invert the visible order (RN's lower
`TotalTime`, shipping's sooner controls).

## First-stroke hold (RN, iPad)

Every cold first stroke kept. Same probe build, `bursty-120-240` unless noted; every replay starts
drawing 3 s after the paper's first layout. Sound on at 50% (the default; the iPad's sound record is
empty, so defaults apply). "Hold" = the first cohort's `longestGap` (no new ink handed to the view)
and the replay's `emissionLateness.max` (the main thread could not even deliver the next touch
packet).

| Cold launch                       | Instrument        | First dot (ms) | Hold: longest gap, ms (at ms into the stroke) | Packet late by (ms) |
| --------------------------------- | ----------------- | -------------- | --------------------------------------------- | ------------------- |
| preflight (earlier today)         | none              | 12.6           | **163** (at 33)                               | 162                 |
| control 1                         | none              | 22.8           | **105** (at 181)                              | 103                 |
| hitches 1                         | Animation Hitches | 33.7           | **123** (at 332)                              | 122                 |
| hitches 2                         | Animation Hitches | 28.4           | 38 (at 69)                                    | 33                  |
| hitches 3                         | Animation Hitches | 27.3           | 26 (at 81)                                    | 18                  |
| control 2                         | none              | 25.3           | 22 (at 73)                                    | 14                  |
| hitches, `finger-session-1` trace | Animation Hitches | 31.9           | **128** (at 323)                              | 121                 |
| Later strokes, all runs (24)      | —                 | 2.4–9.5        | 18–25                                         | —                   |

* **Recurs:** 4 of 7 cold launches hold the first stroke 105–163 ms; no later stroke ever does. What
  a child sees: the first dot lands promptly, then 0.03–0.33 s into the stroke the line stops
  following the finger for about an eighth of a second and catches up. No ink is lost (1,428/1,428
  packets delivered every run).
* **Cause (from the hitches-1 trace, attempt 2 of 2):** the main thread spends 119 ms blocked in
  `-[AVPlayerItem currentMediaSelection]` ←
  `_informObserversAboutAvailabilityOfCurrentMediaSelection` ← an AVFoundation asset notification,
  waiting on the player queue's synchronous XPC to the media server. It is the only main-thread wait
  over 15 ms in the 26 s trace. That is the drawing sound's first play — the same signature as issue
  3028, which PR 3105's priming (included in 427756f14) claimed to take from 5/10 to 0/10. **The fix
  does not hold on this build.** A sound-off control on the iPad was not run: there is no touch to
  flip the switch, and the sound record is a 16-version schema not worth hand-writing at 23:00. The
  stack attribution stands without it.
* **Galaxy:** no equivalent. Preflight's first packet was 28 ms late and its first cohort's longest
  gap (26 ms) matches later cohorts.
* **Severity: major** by the pre-registered rule (>100 ms in ordinary use), in RN only as far as
  measured. **Not established:** whether shipping's iPad first touch has an equivalent (no way to
  drive it), and post-Clear / post-Settings first strokes (no touch to reach Clear or Settings).

### Galaxy first stroke, both arms (app-agnostic)

Cold launch, 3.5 s wait, then `screenrecord` while two identical 600 ms horizontal swipes run 1.5 s
apart; ink extent per video frame (`perf/bin/firststroke.mjs`). RN plain vs shipping, S R R S (the
first two shipping attempts started on the open Tool Drawer that the journeys lane had left, drew
nothing, and were set aside; the drawer was closed in both apps and shipping re-run).

| Run    | Longest no-growth gap, stroke 1 / stroke 2 (ms) | First ink, stroke 2 − stroke 1 (s) |
| ------ | ----------------------------------------------- | ---------------------------------- |
| ship-1 | 21 / 18                                         | 2.188                              |
| ship-2 | 25 / 17                                         | 2.190                              |
| rn-1   | 29 / 26                                         | 2.142                              |
| rn-2   | 26 / 25                                         | 2.158                              |

No hold in either arm on the Galaxy. RN's first stroke inks ~30–50 ms later relative to its second
stroke than shipping's does (the shorter stroke-2 − stroke-1 interval), matching the probe's
first-cohort first dot (35 ms vs 15–30 ms later). **Minor**, RN only.

## Fix-spike candidate: the iPad first-stroke hold (RN only)

* **Mechanism (trace-backed):** AVFoundation posts a media-selection availability notification for
  the drawing sound's `AVPlayerItem` to the main queue around the first real `play()`. Its handler
  calls `currentMediaSelection`, which waits synchronously on the item's queue while that queue is
  in a synchronous XPC to the out-of-process media server. With `keepAudioSessionActive: false`, the
  first stroke's `play()` is also when the session reactivates, which is the likely reason the media
  server is slow right then. Priming at volume 0 (PR 3105) evidently does not reach the same state.
* **Cheapest probe (½ day incl. 10-launch replay check):** keep the drawing takes' audio session
  active while foregrounded (expo-audio `keepAudioSessionActive: true`, or activate the session once
  when priming), then rerun `bursty-120-240` cold 10× and count first-cohort gaps ≥100 ms.
* **Robust fix (1–2 days):** play the three pencil takes from in-memory buffers on an
  `AVAudioEngine`/`AVAudioPlayerNode` in a small native module, so no `AVPlayerItem`, media
  selection, seek or remote item exists on the drawing path (this also retires issue 3003's
  seek-blocking class). Expected to remove the hold entirely; keep the replay count as the gate.

## Gaps against the method challenge

* The fair iPad pair (same WDA gesture into both, all-process hitches, 6 dense-Crayon pairs) is
  **not run**: no UI automation. Shipping's iPad drawing is **pending the owner** (owner-packet
  candidates: the setup case to enable UI Automation, and a first-stroke feel case).
* Brush was the default Pen in every run; no Crayon/Magic, no post-Clear or post-Settings first
  strokes, no sound-off control on the iPad (no touch). The Galaxy runs were all sound-on.
* `gfxinfo` was not calibrated against a deliberately stalled-ink control. On the iPad the RN
  first-stroke freeze itself served as the positive control for frame-lifetime gaps (caught there,
  missed by Apple's `hitches` table).
* Three samples per cell, not paired confirmations.

## Verdict

| Device | Axis                      | Result                                                                                                                    |
| ------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Galaxy | Drawing smoothness        | Tie on the pre-registered workload; RN ahead on a dense 300-stroke picture (0.33% vs 2.55% janky), both <3%               |
| Galaxy | Cold launch               | Tie on `TotalTime` (285 vs 333 ms); shipping shows controls ~150 ms sooner                                                |
| Galaxy | Memory                    | Tie (~310 vs ~320 MB after 300 strokes, shipping counted with its WebView renderer)                                       |
| Galaxy | First stroke              | No hold in either; RN first ink ~40 ms later (minor)                                                                      |
| iPad   | Drawing smoothness        | **Unanswered** for the comparison. RN alone is clean after its first stroke (≤1.8% lost, 1.4 ms/s hitches)                |
| iPad   | Cold launch (first frame) | Tie (111 vs 124 ms); time to drawable UI unmeasured                                                                       |
| iPad   | First stroke              | **RN major defect**: 105–163 ms freeze in 4 of 7 cold first strokes, drawing-sound AVFoundation call; shipping unmeasured |

RN does not show the "clearly better for users" drawing win this lane was asked to find: where a
fair comparison was possible (the Galaxy) the arms tie on every pre-registered number, and on the
top-weighted iPad the only hard finding is an RN-only first-stroke freeze. The one thing that could
flip toward RN is the unscored iPad fair pair: if shipping freezes ≥100 ms under real touch while RN
(after the audio fix) does not, RN earns its iPad win. Nothing here argues for RN today.
