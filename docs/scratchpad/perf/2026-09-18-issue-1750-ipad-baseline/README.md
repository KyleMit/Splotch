# Issue 1750: physical-device baseline after PR 2069, and the undo-ghost settle

Physical-device evidence for [issue 1750](https://github.com/KyleMit/Splotch/issues/1750), captured
after [PR 2069](https://github.com/KyleMit/Splotch/pull/2069) stopped offscreen history-base tiles
from entering the deferred shadow drain. It answers two questions. What still reproduces on the
device? And does a bounded treatment that leaves pixels unchanged remove it?

`summary.json` holds every retained run as derived per-phase rows: frame intervals, `engine.*`
totals, the worst frame of each undo, history counters, ink coverage, and the served entry chunk.
The `pixelIdentity` block records the pixel-hash comparison. The file contains no device names, ids,
or raw event rows. The payload, runners, and analyzer that produced it sit beside it.

## Setup

* **Runtimes.**
  * iPad: a 12.9-inch iPad Pro on iPadOS 26.5, Safari 26.5, landscape, 1366×885 at DPR 2. Safari's
    rAF ran at 120 Hz (a median idle interval of 8.0 ms), so the 33.5 ms gate spans four refresh
    intervals.
  * Android: a phone running Android 10-class Chrome, portrait, 360×643 at DPR 3, with rAF at 60 Hz.
* **Workload.** `session-payload.js` runs in-page on `/dev/engine`, with a fresh page load for every
  run. The host only injects it and polls, so automation round trips sit outside every measured
  interval.
  * The paced session draws 30 crayon scribbles (the `crayon-scribbles` shape, 240 points each) at
    two moves per frame, 300 ms apart. It waits two frames for presentation and idles until history
    folding settles, plus 4 s. It then runs 20 undos and a 4 s tail.
  * Undos are either frame-paced or spaced 700 ms apart. Spacing lets each 420 ms ghost animation
    finish, which is how a child's taps arrive.
  * The burst session replaces the drawing with the CI gate's synchronous 22 × 1,200-op burst and
    then runs the same phases.
  * A continuous rAF sampler spans every phase, so a wait moved from one phase into another still
    shows up as a long frame.
  * Android uses a 24 px margin instead of 160 px, so its scribbles are not 40 px wide.
* **Frames.** `analyze.mjs` scores complete rAF-to-rAF intervals. A window takes every interval that
  overlaps it, so the frame an undo call lands in counts in full, including the synchronous work
  before and after the call.
* **Builds.** Every build is an `npm run perf:build` served over the LAN. Each run recorded the
  entry chunk that its page actually loaded.
  * Main: 7a2365631aba6078f94038235d661add6e2e42cb, served as `start.DY5Ge2nJ.js`.
  * Diagnostic: main plus a local, uncommitted per-page ghost-variant switch, served as
    `start.DwRqU7-9.js`.
  * First treatment, the unconditional settle: 1359b5a1f134321f4495d9181ffa99c70acbeb9e, served as
    `start.CtWzvEUl.js`.
  * Shipped treatment, the settle gated to iOS: bf24acfe9f8e92438c2738145347bd954f718dfa, served as
    `start.0crTjebm.js`.
* **Gate.** `ACTION_FRAME_MAX_GATE_MS` (33.5 ms), applied to the worst frame that overlaps each
  undo's window.
* **Host.** Captures ran one at a time. One sample, `confirm-product-2` in the ghost-variant set,
  overlapped about 2 s of local unit tests. It is retained, marked here, and agrees with its
  siblings.

## What still reproduces on the iPad after PR 2069

**Finger-paced crayon drawing is clean on both deposition pipelines.** Restamp is the web pipeline
and glaze-direct the native one. Over 40 s of paced drawing, each shows 0–1 frames over the gate.
Commit stays at or under 4 ms and history folds at or under 22 ms, and no frame exceeds 27 ms while
they run. At finger pace, glaze-direct gains nothing.

**The synchronous burst is about ten times slower on restamp.** Two runs per arm, in ABBA order:

| Arm          |  Burst task | Burst → presented | Worst undo frame after the burst |
| ------------ | ----------: | ----------------: | -------------------------------: |
| restamp      |     116.4 s |       13.3–13.6 s |                           7.73 s |
| glaze-direct | 12.0–12.3 s |         2.6–3.0 s |                         85–94 ms |

On restamp, `engine.draw` holds about 5.5 s of synchronous JavaScript per 1,200-op stroke. At finger
pace the relationship reverses: restamp spends 0.05 ms of draw JavaScript per op against
glaze-direct's 0.15 ms. The burst therefore measures back-pressure that a finger never builds up. It
confirms PR 2062's desktop mechanism on the device, but for a workload no child produces.

**Crayon undo overruns the frame gate, and the tile-read ghost causes it.** Restamp, undos spaced
700 ms apart, three interleaved rounds:

| Arm                      | Undos over 33.5 ms per run | Worst undo frame |
| ------------------------ | -------------------------- | ---------------: |
| crayon, product ghost    | 5, 5, 5 of 20              |         41–62 ms |
| crayon, ghost suppressed | 0, 0, 0 of 20              |         14–15 ms |
| pen, op-replay ghost     | 0, 0, 0 of 20              |         14–15 ms |

The ghost was suppressed by reporting Reduce Motion to this page only, which is the product's own
switch for skipping it. `engine.undo` held 1–9 ms of JavaScript throughout, so the missing time is
deferred rendering. This is the "~70 ms ghost build stall" that PR 2057 recorded and left in place.

## Which step of the ghost costs the frame

`ghostFromTiles` copies a crayon ghost from the live tiles. The undo restore then writes those same
tiles, and `subtractRemainingInk` reads them again. A diagnostic build switched between variants per
page:

| Variant (restamp, spaced undos) | Runs | Undos over the gate | Worst undo frame | `engine.undo` max |
| ------------------------------- | ---: | ------------------- | ---------------: | ----------------: |
| product                         |    4 | 4, 4, 4, 2 of 20    |         36–55 ms |            3–9 ms |
| cull reads to ghost bounds      |    1 | 3 of 20             |            41 ms |              5 ms |
| keep the mask alive             |    1 | 3 of 20             |            35 ms |              6 ms |
| settle (1-px readback)          |    4 | 0, 0, 0, 0 of 20    |         19–21 ms |          11–12 ms |
| cull + settle                   |    1 | 0 of 20             |            19 ms |             11 ms |

Only settling matters. The settle reads one pixel back from the ghost after its mask is applied and
before the restore writes the tiles, and that removes the over-gate frames. The worst whole frame,
which includes the added JavaScript, falls to 19–21 ms. This evidence cannot say whether the WebKit
cost is a copy-on-write detach of the tiles being written, or a raster that is simply resolved
earlier. It does show that the combined frame gets smaller rather than the cost moving elsewhere.

## The treatment, and why it is gated to iOS

The first treatment settled on every browser. On the iPad it held up against main, interleaved:

| Build                | Arm          | Undos over the gate | Worst undo frame | `engine.undo` max / total of 20 |
| -------------------- | ------------ | ------------------- | ---------------: | ------------------------------: |
| main                 | restamp      | 5, 6, 2 of 20       |         39–46 ms |                  3–5 / 41–46 ms |
| unconditional settle | restamp      | 0, 0, 0 of 20       |         20–27 ms |              13–21 / 172–196 ms |
| main                 | glaze-direct | 7 of 20             |            40 ms |                       4 / 44 ms |
| unconditional settle | glaze-direct | 0 of 20             |            27 ms |                     18 / 187 ms |

On Android Chrome it made things worse.

* **Main.** Undos 1 and 2 fall inside one deferred rAF interval of 1,389–1,417 ms, with 10–12 ms of
  undo JavaScript.
* **Unconditional settle.** The first undo became a synchronous readback of 1.30–1.46 s. That
  interval is about as long as main's, but now the main thread is blocked for it. Every later undo
  also carried about 20 ms more JavaScript (`engine.undo` 22–28 ms against 5–7 ms).

That moves the cost and adds to it. The shipped treatment therefore settles only where
`isIosDevice()` holds, meaning iPad Safari and the iOS WKWebView. Android keeps main's code path.

## The shipped treatment against main

The iOS-gated build (bf24acfe9f8e) ran interleaved with unchanged main on both devices, restamp,
undos spaced 700 ms apart:

| Device         | Build | Undos over the gate | Worst undo frame | `engine.undo` max / total of 20 |
| -------------- | ----- | ------------------- | ---------------: | ------------------------------: |
| iPad Safari    | main  | 5, 3 of 20          |         39–45 ms |                  5–6 / 47–49 ms |
| iPad Safari    | fix   | 0, 0 of 20          |         22–23 ms |              10–15 / 170–172 ms |
| Android Chrome | main  | 2, 2 of 20          |   1,383–1,384 ms |          11.3–11.4 / 122–125 ms |
| Android Chrome | fix   | 2, 2 of 20          |   1,419–1,436 ms |          11.4–11.6 / 131–136 ms |

On both devices, draw, commit, and fold are unchanged. 20 undo snapshots and 20 history-base rasters
are retained, and ink coverage after the undos is identical.

On Android, the over-gate interval spans undos 1 and 2 on both builds. There the fix differs from
main by a single user-agent test per undo. Main's five Android runs this session read 1,383–1,417
ms; the fix's two read 1,419–1,436 ms. Those ranges sit next to each other without overlapping. That
is recorded here, not rounded away.

## Pixels

Setting `pixelCheck` hashes every live-tile canvas before the first undo, then hashes the ghost
canvas and every tile at the first frame after each undo. The same input ran on main and on the
shipped fix, served by the iPad. The hashing reads the canvases back, so these runs are for
verification only and carry no timing.

* **Restamp, the pipeline iPad Safari ships.** All 20 ghost hashes and all 20 tile hashes match
  between main and the fix, and so does the tile state before the first undo. The pixels are
  byte-identical.
* **Glaze-direct, the native pipeline.** Its drawing varies from run to run on both builds, before
  any code this PR touches has run:
  * Main's pre-undo tile state was one value on three runs and a different value on one run.
  * The fix's pre-undo state was one value on two runs and a third value on one run.
  * Comparing runs that begin undo from the same state: fix-2 matches main-3 on all 20 ghosts and
    all 20 tiles.
  * Fix-1 matches fix-2 (same build, same starting state) on every ghost, but its tiles diverge from
    undo 10 onward. It diverges from main-3 at the same undo.

  That within-build variance predates this PR. It is recorded as a finding and does not count
  against the fix.

## Not settled here

* **Android's first-undo stall is a separate crayon restore cost.** With the ghost suppressed,
  crayon undo on Android Chrome still paid a 733–750 ms interval across undos 2 and 3. The pen
  control paid nothing over the gate. The iOS gate leaves this untouched, and nothing here
  attributes it.
* **Glaze-direct deposition and restore vary from run to run on the iPad.** See Pixels.
* **iPad native (WKWebView) was not captured.** The installed-app route is blocked on this host. The
  glaze-direct arm on iPad Safari stands in for native's pipeline under the same engine, but it is
  not a native measurement.
* **The real app was not driven through undo with trusted touch.** The `/dev/engine` page runs the
  engine and `app.css`, with synthetic input dispatched in-page. Appium's device discovery was
  stale, and the direct WebDriverAgent route has no capture that drives undo.
* **The burst's restamp cost remains.** It is real on the device and absent at finger pace.
  Switching web to glaze-direct changes where strokes cross (ADR-0148). That is a product decision,
  and this evidence does not force it.
