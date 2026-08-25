# ADR-0142: Anchor Rotation Action Measurements at `resize`, Not `orientationchange`

**Status:** Active **Date:** 2026-08

## Context

The deployment-target matrix gates every discrete action on first frame (33.5 ms) and post-action
frame p95 (20 ms), measured by the in-page action probe from the action's anchor event. Rotation
actions anchored at whichever of `orientationchange` or `resize` arrived first
(`tools/perf/ios/capture-xcuitest-actions.mjs`, `measureRotation`).

That anchor made the rotation family the largest source of red cells in the matrix (issue 1197), and
the August 2026 campaign's re-measurement showed the failures were an artifact of the anchor, not of
the product:

* Safari dispatches `orientationchange`, then performs its own rotation transition and re-layout,
  then dispatches `resize`. A paired floor-control experiment on the physical iPad (Appium-rotated
  Safari, interleaved arms) measured that window at a flat 11 ms for the cheapest possible drawing
  page and 23–24 ms for Splotch — and the first paint at **0–1 ms after `resize`, on both pages,
  every round**. The page cannot paint into geometry the browser has not laid out yet; a clock
  started at `orientationchange` charges the page for the browser's transition, during which the OS
  is animating the rotation and nothing appears hung.
* The extra ~12 ms Splotch adds over the floor is the browser laying out the heavier rotated DOM
  before it will dispatch `resize` — not handler work. Removing the one app listener in that window
  (the engine's `orientationchange` rect refresh) did not move the delta.
* Native WKWebViews fire no `orientationchange` at all, so native rotation cells were already
  effectively anchored at `resize`. The published web/native asymmetry — web rotation first-frame
  40–48 ms failing, native 0–24 ms passing, on the same hardware — was a difference in measurement
  anchor, not in runtime cost.

Alternatives considered:

* **A documented per-action first-frame allowance for `ios-safari` rotation cells** (the ADR-0090
  pattern). Rejected: the allowance would encode the anchor asymmetry instead of removing it, its
  value would track page layout complexity rather than any product budget, and native and web cells
  would keep measuring different quantities under one label.
* **Keep the anchor and subtract a measured browser constant.** Rejected: the floor is per-device
  and per-page-complexity, so the constant would be a second calibration to maintain, wrong
  everywhere but the device it was measured on.

## Decision

`measureRotation` arms the action probe with `['resize']` only. The first frame of a rotation action
is the first `requestAnimationFrame` after the browser hands the page its new geometry — the same
quantity native runtimes were already measuring. The `orientationchange` timestamp still lands in
each sample's `activities` (the probe's `WINDOW_ACTIVITY_EVENTS` records both events independently
of the anchor), so a regression in the pre-`resize` window stays visible in artifacts without being
gated.

Verified on the physical iPad the night of the change: the four `empty after clear` / `with ink`
rotation first-frame cells went from 40–46 ms p95 (FAIL) to 1–2 ms (PASS) with post-action frame
gates unchanged, matching the floor experiment's prediction.

## Consequences

\+ Web and native rotation cells measure the same quantity, so cross-runtime comparison is honest.

\+ Four chronically red Safari rotation cells per mode pass without touching the gates, and the
remaining rotation reds are genuine product costs (the with-ink re-present straddling the 20 ms
frame gate).

\+ One less standing allowance: the gate table stays universal instead of growing a
browser-transition carve-out.

− Every previously published rotation first-frame number is incomparable with numbers captured after
this change; rotation cells must be recaptured, not trended across the boundary. The campaign-end
recapture covers this.

− The browser's `orientationchange`→`resize` window (11–24 ms measured here) is real wall-clock time
a child experiences during rotation, and it is no longer gated anywhere. It is browser- and
DOM-complexity-owned rather than frame-work-owned, but a large regression in it would now surface
only in artifact activities, not as a red cell.
