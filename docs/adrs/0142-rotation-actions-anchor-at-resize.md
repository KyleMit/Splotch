# ADR-0142: Anchor Rotation Action Measurements at `resize`, Not `orientationchange`

**Status:** Accepted — amends [ADR-0090](0090-tiered-real-ipad-performance-regression-gates.md)
**Date:** 2026-08

## Context

The deployment-target matrix gates every discrete action on first frame (33.5 ms) and post-action
frame p95 (20 ms), measured by the in-page action probe from the action's anchor event. Rotation
actions armed the probe on whichever of `orientationchange` or `resize` arrived first
(`tools/perf/ios/capture-xcuitest-actions.mjs`, `measureRotation` — shared by the iOS, Android
browser, and desktop action harnesses through `runActionSweep`).

Which event arrives first is a per-runtime race, measured on the physical devices on 2026-08-25
(evidence corpus `perf-profiles/evidence/2026-08-25-rotation-anchor/`):

| runtime                 | ordering                          | gap                                                                        |
| ----------------------- | --------------------------------- | -------------------------------------------------------------------------- |
| iPad Safari             | `orientationchange` then `resize` | 11 ms floor page bare; 23–24 ms app bare; 24–49 ms inside the action sweep |
| iPad WKWebView (native) | `resize` then `orientationchange` | `orientationchange` trails by ~523 ms                                      |
| Android Chrome          | `orientationchange` then `resize` | 16–43 ms (app page)                                                        |

So the same label measured different quantities per runtime: Safari and Android cells started their
clock at `orientationchange` and charged the page for the browser's own rotation transition and
re-layout — a window during which the OS animates the rotation and the page's new geometry does not
exist — while native cells started at `resize` because it happened to win the race there. A paired
interleaved floor-control experiment on the iPad put Safari's window at a flat 11 ms for the
cheapest possible page, with the first paint 0–1 ms after `resize` on both the floor and the app,
every round; a handler-mutation test showed the app's extra ~12 ms is browser layout of the heavier
DOM, not listener work (the three app registrations in that window — the engine's rect refresh and
the two deferred viewport-sync arms in `layout.svelte.ts` — either defer or are cheap).

Alternatives considered:

* **A documented per-action first-frame allowance for `ios-safari` rotation cells** (the ADR-0090
  pattern). Rejected: the allowance would encode the anchor race instead of removing it, its value
  would track page layout complexity rather than any product budget, and runtimes would keep
  measuring different quantities under one label.
* **Keep the anchor and subtract a measured browser constant.** Rejected: the window is per-device,
  per-browser, and per-page-complexity — a second calibration that is wrong everywhere but where it
  was measured.

## Decision

`measureRotation` arms the action probe with `['resize']` only, for every runtime the shared sweep
drives. The `orientationchange` timestamp still lands in each sample's `activities` (the probe's
`WINDOW_ACTIVITY_EVENTS` records it independently of the anchor), and the probe now also records the
Screen Orientation API's `change` event, so the pre-`resize` window stays visible in artifacts
without being gated.

What the re-anchored first-frame gate means per runtime — stated plainly, because it differs:

* **iPad Safari: the rotation first-frame gate is structurally inert.** Safari dispatches `resize`
  inside the same rendering turn whose rAF timestamp the probe records as the frame time, so
  `firstFrameMs` reads 0–2 ms by construction (24 of 24 post-change samples). The app's own rotation
  work is deferred past the anchor by design (`RESIZE_SETTLE_MS`, `ROTATION_VIEWPORT_SETTLE_MS`) and
  is scored where it lands: inside the post-action frame window, which is the gate that carries the
  signal for Safari rotations. The four previously red Safari first-frame cells did not get faster —
  they stopped measuring the browser's transition.
* **Android Chrome: the gate keeps dynamic range.** Post-`resize` first frames measured 0.1–54 ms on
  the physical phone — the page sometimes takes real frames to paint after geometry lands, and the
  gate can still catch that.
* **iPad WKWebView: the first `resize` precedes committed layout.** The engine's unmeasured-rect
  guard rejects it and rebuilds ~160 ms later, so native first-frame readings (0–25 ms observed)
  describe the pre-layout resize, not a fully laid-out paint. The post-action window again carries
  the real signal.

## Consequences

\+ Every runtime's rotation clock starts at the same event, so cross-runtime comparison stops being
a comparison of anchors.

\+ The browser-transition charge is gone: the previously red Safari first-frame cells (p95 40, 46,
34, 32 against 33.5) and the Android cells' 16–43 ms `orientationchange` head start no longer count
against the app.

− **The rotation first-frame gate no longer measures anything on Safari** (see above). The
post-action frame gates are the operative rotation gates there; a future regression confined to the
pre-`resize` window surfaces only in artifact activities, not as a red cell.

− Previously published rotation first-frame numbers are incomparable with post-change numbers, and
`check:matrix-staleness` cannot see the boundary — its measured surface is deliberately product
code, not the harness. The campaign-end recapture covers this instance; durable instrument-identity
recording is issue 1293.

− Re-partitioning `postActionFrames` at a different anchor can shift marginal post-gate values
between runs (the with-ink Safari cell read post p95 20 before and 22 after, inside its observed
run-to-run spread) — a straddling cell needs samples, not a single sweep, per issue 1290.

− ADR-0090's transition-analysis note that "the app still responds 23–29 ms later" during the system
rotation interval described this anchor's view; under this ADR that window is attributed to the
browser transition, and 0090 carries an amendment note pointing here.
