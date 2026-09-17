# Undo-ghost fix: before/after device evidence — 2026-09-17

Evidence for the fix in PR #2057 (issue #1775): the undo ghost now holds its first keyframe until
the frame that paints it has reached the screen. This packet is the raw material behind that PR's
tables. It is an evidence branch and is not proposed for merge.

## Builds

| Side     | Commit                                   | What it is                                                  |
| -------- | ---------------------------------------- | ----------------------------------------------------------- |
| `before` | da9f4070643901a6ce8327b5182278ff26f35b9d | `origin/main` at the start of the session                   |
| `after`  | 7f398fbb78462dbcaaa0d78fb885b0b42251f166 | the PR head (the fix; the later commit only changed a spec) |

Both sides are ordinary release builds (`npm run build`) served from the same host over the LAN with
`vite preview`. Neither carries the diagnostic instrumentation described below — the instrumented
runs are kept separately under `traces/` and were never used for the before/after pixel comparison.

## Devices

* iPad Pro 12.9-inch (5th generation), iPadOS 26.5, ProMotion on. Target: Safari.
* Samsung Galaxy S21 FE, Android 16, 120 Hz. Targets: Chrome 153, and the native app (debug build of
  the bundled static export, installed from the `after` tree).

**Not covered: the iPad native app.** Rebuilding it needs a code-signed device install this session
could not run, so that target carries no `after` evidence. Its `before` behaviour is in the
validation comment on #1775, where it failed the same way iPad Safari did.

## How it was driven and recorded

* iPad: WebDriverAgent W3C touch actions for every tap and stroke; XCTest screen recording
  (`/wda/video/start`, 60 fps, a frame written only when the screen changes). WebDriverAgent was
  launched directly with `xcodebuild test-without-building` — Appium's real-device discovery
  reported the iPad's UDID as unknown, the same stale-registry state the previous session hit.
* Android: Chrome DevTools Protocol touch events, `adb shell screenrecord` at up to 120 fps.
* Crayon case: clear, crayon + Yellow wave, crayon + Blue wave crossing it, Undo.
* Magic case: a coloring page, magic brush scribble, Undo.
* Reduced motion: iPad Settings → Accessibility → Motion → Reduce Motion, restored to off
  afterwards.

Every clip plays at normal speed.

## Files

| File                                   | What it is                                                         |
| -------------------------------------- | ------------------------------------------------------------------ |
| `1775-<side>-<target>-<case>*.mov/mp4` | The recordings, normal speed                                       |
| `ghost-ink-after-undo.txt`             | Ghost ink per recorded frame from the last full-ink frame, per run |
| `*.json`                               | Each run's driver log (host timestamps for every step)             |
| `traces/`                              | The diagnostic runs described below                                |

## The ghost-ink measure

Each frame is compared pixel by pixel with the last frame of its clip (ink gone); crayon sums the
excess of blue over red and green, magic sums the absolute RGB difference, normalized so 1 is the
whole stroke. It shows **what reached the screen**, not computed opacity. Read the first number
after the last full-ink frame: that is how much of the stroke the ghost's first visible frame
carried.

Limits, unchanged from the earlier pass and still true here:

* Android's hardware encoder refines detail over several frames after a large change, so an Android
  run's first post-undo frames read high for reasons that have nothing to do with the ghost — one
  `before` run reads 1.109, which is impossible and is encoder residue. Read Android as "starts at
  full strength and fades", not as a curve.
* The magic measure includes the coloring page's line art, so its tail settles around 0.25 rather
  than 0. The reduced-motion magic run sits at that floor with no fade, which is the "no ghost"
  reading for that case.
* XCTest screen recording costs about 10 ms of the very frame under study (measured: the long frame
  after Undo runs 65–71 ms unrecorded and 74–84 ms while recording).

## The diagnostic runs under `traces/`

The cause was established with a temporary build that reported, per frame after an undo, the phase
timings inside `engine.undo`, the ghost's animation `startTime`/`currentTime`, and its computed
opacity — read back out of the page through a hidden accessibility label, so no server was involved.
That build also carried switches to disable parts of the ghost. It is **not** the code in the PR and
was never used for the pixel comparison above. What it showed, on iPad Safari:

| Variant                                     | Long frame after undo |
| ------------------------------------------- | --------------------- |
| No ghost built                              | 17–18 ms              |
| Ghost built, never inserted                 | 70–72 ms              |
| Ghost inserted, animation removed           | 65–70 ms              |
| Unmodified                                  | 65–71 ms              |
| Ghost built from a short stroke             | 21–28 ms              |
| Ghost paint skipped, mask and subtract only | 17 ms                 |
| Ghost paint and mask only, no subtract      | 63–68 ms              |
| Ghost paint only                            | 49–54 ms              |
| Tiles outside the ghost's bounds skipped    | 69–72 ms (no change)  |

The synchronous JavaScript of `engine.undo` measured 1–3 ms in every variant, so the time is
deferred raster work landing in the frame's rendering update, and it scales with the ghost's area
rather than with the number of tiles blitted.

Two things this does not establish: whether that raster work is CPU or GPU side, and whether the
same costs hold in the iPad's native WKWebView.
