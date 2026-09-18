# Issue 1750 — physical-device baseline after PR 2069, and the undo-ghost settle

Physical-device evidence for [issue 1750](https://github.com/KyleMit/Splotch/issues/1750), taken
after [PR 2069](https://github.com/KyleMit/Splotch/pull/2069) stopped offscreen history-base tiles
from entering the deferred shadow drain. It answers two questions: what still reproduces on the
device, and whether a bounded, pixel-preserving treatment removes it.

`summary.json` holds every retained run as derived per-phase rows: frame gaps, `engine.*` totals,
per-undo worst frames, history counters, ink coverage, and the served entry chunk. It contains no
device names, ids, or raw event rows. The payload, runners, and analyzer that produced it are beside
it.

## Setup

* **Runtimes.** A 12.9-inch iPad Pro on iPadOS 26.5, running Safari 26.5 in landscape at 1366×885,
  DPR 2. Safari's rAF ran at 60 Hz on the 120 Hz panel, so frame gaps land on 8.3 ms multiples. An
  Android phone on Android 10-class Chrome, in portrait at 360×643, DPR 3.
* **Workload.** `session-payload.js`, run in-page on `/dev/engine`, with one fresh page load per
  run. The host only injects the payload and polls for the result, so automation round trips sit
  outside every measured interval. The paced session draws 30 crayon scribbles (the
  `crayon-scribbles` shape, 240 points each) at two moves per frame, 300 ms apart. It waits two
  frames to present, then idles until history folding settles plus 4 s. It then runs 20 undos, each
  followed by a 4 s tail. A continuous rAF sampler covers every phase, so a wait moved from one
  phase into another still shows as a frame gap. Undos are either frame-paced or spaced 700 ms
  apart. Spacing lets each 420 ms ghost animation finish, which is how a child's taps arrive. The
  burst session is the CI gate's synchronous 22 × 1,200-op burst, followed by the same phases.
  Android used a 24 px margin in place of 160 px so that its scribbles are not 40 px wide.
* **Builds.** Every build was a `npm run perf:build` served over the LAN. Each run recorded the
  entry chunk the page actually loaded.
  * Main: 7a2365631aba6078f94038235d661add6e2e42cb, served as `start.DY5Ge2nJ.js`.
  * Diagnostic: main plus a local, uncommitted per-page ghost-variant switch, `start.DwRqU7-9.js`.
  * First treatment: 1359b5a1f134321f4495d9181ffa99c70acbeb9e, the unconditional settle,
    `start.CtWzvEUl.js`.
  * Shipped treatment: bf24acfe9f8e92438c2738145347bd954f718dfa, the settle gated to iOS,
    `start.0crTjebm.js`.
* **Gate.** `ACTION_FRAME_MAX_GATE_MS` (33.5 ms), applied to the worst frame in each undo's window.
* **Host.** Captures ran one at a time. One sample, `confirm-product-2` in the ghost-variant set,
  overlapped about 2 s of local unit tests; it is retained, marked, and agrees with its siblings.

## What still reproduces on the iPad after PR 2069

**Finger-paced crayon drawing is clean on both deposition pipelines.** Over 40 s of paced drawing,
restamp (web) and glaze-direct (native) each show 0–1 frames over the gate. Commit is ≤ 4 ms,
history folds are ≤ 22 ms, and no frame exceeds 27 ms while the folds run. Glaze-direct gains
nothing at finger pace.

**The synchronous burst is roughly ten times slower on restamp.** Two runs per arm, ABBA:

| Arm          |  Burst task | Burst → presented | Worst undo frame after the burst |
| ------------ | ----------: | ----------------: | -------------------------------: |
| restamp      |     116.4 s |       13.3–13.6 s |            7.73 s (the 2nd undo) |
| glaze-direct | 12.0–12.3 s |         2.6–3.0 s |                         85–94 ms |

Restamp's `engine.draw` is about 5.5 s of synchronous JavaScript per 1,200-op stroke. At finger
pace, restamp's per-op draw JavaScript is lower than glaze-direct's (0.05 ms against 0.15 ms), so
the burst prices back-pressure that a finger never builds. That confirms PR 2062's desktop mechanism
on the device, for a workload no child produces.

**Crayon undo overruns the frame gate, and the tile-read ghost is the cause.** The undos were spaced
700 ms apart on restamp, over three interleaved rounds:

| Arm                      | Undos over 33.5 ms per run | Worst undo frame |
| ------------------------ | -------------------------- | ---------------: |
| crayon, product ghost    | 5, 5, 5 of 20              |         41–62 ms |
| crayon, ghost suppressed | 0, 0, 0 of 20              |         14–15 ms |
| pen, op-replay ghost     | 0, 0, 0 of 20              |         14–15 ms |

The ghost was suppressed by reporting Reduce Motion to the page only, which is the product's own
gate for skipping it. `engine.undo` held 1–9 ms of JavaScript throughout, so the time is deferred
rendering. This is the "~70 ms ghost build stall" that PR 2057 recorded and left untouched.

## Which step of the ghost costs the frame

A crayon ghost is copied from the live tiles (`ghostFromTiles`). The undo restore then writes the
same tiles, and `subtractRemainingInk` reads them again. A diagnostic build switched one variant per
page, and every variant left the pixels identical:

| Variant (restamp, spaced)  | Runs | Undos over the gate | Worst undo frame | `engine.undo` max |
| -------------------------- | ---: | ------------------- | ---------------: | ----------------: |
| product                    |    4 | 4, 4, 4, 2 of 20    |         36–55 ms |            3–9 ms |
| cull reads to ghost bounds |    1 | 3 of 20             |            41 ms |              5 ms |
| keep the mask alive        |    1 | 3 of 20             |            35 ms |              6 ms |
| settle (1-px readback)     |    4 | 0, 0, 0, 0 of 20    |         12–14 ms |          11–12 ms |
| cull + settle              |    1 | 0 of 20             |            13 ms |             11 ms |

Only settling matters. Reading one pixel back from the ghost, after its mask and before the restore
writes the tiles, removes the over-gate frames. The worst frame, which contains the added
JavaScript, falls to 12–14 ms. This evidence does not say whether the WebKit cost is a copy-on-write
detach of the written tiles or a raster that is simply resolved earlier. What it does show is that
the combined frame is smaller, not moved.

## The treatment, and why it is gated to iOS

The first treatment settled on every browser. On the iPad it held, against main, interleaved:

| Build                | Arm          | Undos over the gate | Worst undo frame | `engine.undo` max / total of 20 |
| -------------------- | ------------ | ------------------- | ---------------: | ------------------------------: |
| main                 | restamp      | 5, 6, 2 of 20       |         39–46 ms |                  3–5 / 41–46 ms |
| unconditional settle | restamp      | 0, 0, 0 of 20       |         14–22 ms |              13–21 / 172–196 ms |
| main                 | glaze-direct | 7 of 20             |            40 ms |                       4 / 44 ms |
| unconditional settle | glaze-direct | 0 of 20             |            18 ms |                     18 / 187 ms |

On Android Chrome it regressed. Main pays two deferred frames on the first two undos (631–777 ms);
the settle turned the first undo into a 1.30–1.46 s synchronous readback, and every later undo
carried about 20 ms more JavaScript (`engine.undo` 22–28 ms against 5–7 ms). That is cost moved and
grown, so the shipped treatment runs the settle only where `isIosDevice()` holds (iPad Safari and
the iOS WKWebView). Android keeps main's path byte for byte.

## The shipped treatment against main

The iOS-gated build (bf24acfe9f8e), interleaved with unchanged main on both devices. Undos were
spaced 700 ms apart on restamp:

| Device         | Build | Undos over the gate | Worst undo frame | `engine.undo` max / total of 20 |
| -------------- | ----- | ------------------- | ---------------: | ------------------------------: |
| iPad Safari    | main  | 5, 3 of 20          |         39–45 ms |                  5–6 / 47–49 ms |
| iPad Safari    | fix   | 0, 0 of 20          |         13–16 ms |              10–15 / 170–172 ms |
| Android Chrome | main  | 2, 2 of 20          |       740–744 ms |          11.3–11.4 / 122–125 ms |
| Android Chrome | fix   | 2, 2 of 20          |       782–800 ms |          11.4–11.6 / 131–136 ms |

On both devices draw, commit, and fold are unchanged, 20 undo snapshots and 20 history-base rasters
are retained, and ink coverage after the undos is identical. The Android over-gate frames are undos
1 and 2 on both builds. On Android the fix differs from main by one user-agent test per undo. Across
the five Android main runs this session, the worst frame read 740–777 ms. The fix's 782–800 ms is
inside the spread of this measurement but not inside main's observed range. It is recorded here
rather than rounded away.

## Not settled here

* **Android's first-undo stall is a separate crayon restore cost.** With the ghost suppressed,
  crayon undo on Android Chrome still paid a 670 ms frame on its second undo, and the pen control
  paid nothing. The iOS gate leaves it untouched, and nothing here attributes it.
* **iPad native (WKWebView) was not captured.** The installed-app route is blocked on this host, and
  the glaze-direct arm on iPad Safari stands in for native's pipeline under the same engine. It is
  not a native measurement.
* **The trusted-touch real app was not driven through undo.** The `/dev/engine` page runs the engine
  and app.css, with synthetic input dispatched in-page. Appium's device discovery was stale, and the
  direct WebDriverAgent route has no undo-driving capture.
* **The burst's restamp cost stays.** It is real on the device and absent at finger pace. Switching
  web to glaze-direct changes crossings (ADR-0148), so that remains a product decision that this
  evidence does not force.
