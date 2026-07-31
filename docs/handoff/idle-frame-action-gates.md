# Handoff — distinguish action jank from static idle-frame gaps

> 2026-07-31 · branch `experiment/trusted-ipad-input` · PR
> [#682](https://github.com/KyleMit/Splotch/pull/682) · Amend the discrete-action scorer so a static
> renderer omission is not reported as product jank without masking deferred visible work.

## Objective & non-goals

**Objective.** Refine the action sampling/scoring contract using the Android sound-toggle trace and
the no-op idle control. A late `requestAnimationFrame` omission after an action is visibly settled
must not fail the action, while deferred rendering caused by the action must remain measurable.

**Non-goals.** Do not loosen the calibrated 20/32 ms gates, special-case sound, discard raw frames,
or use readiness alone as proof that pixels are settled.

## State

An `enable drawing sounds` sample reported a 50.1 ms post-action frame, but the setting was ready in
5.3 ms and the gap occurred roughly 425–475 ms after input. Its trace contains compositor
`BeginFrame` events at 425.824, 442.490, and 459.156 ms, with no main-thread frame or animation
callback until 462.338 ms. There was no long app task, layout, paint, raster, or GPU event of at
least 1 ms in the 380–520 ms window.

A 30-repeat no-op action then produced P95 16.8 ms and max 66.6 ms with no UI mutation. This proves
that the late sample is an ambient/static renderer omission under this transport, not sound work.

Evidence:

* `perf-profiles/2026-07-31T23-01-08-673Z-android-web-actions-advanced-controls-trace-window-3/trace.json`
* `perf-profiles/2026-07-31T23-25-19-480Z-android-web-actions-idle-control-sound-attribution/actions.json`

No scorer code was changed before handoff.

## Decisions made (and why)

* The sound setting is not a product performance failure on current evidence.
* Keep absolute post-action gates for work plausibly owned by the action. Only the observation
  window/attribution rule is under review.
* Use an idle control and action-aligned trace as the standard falsification test for late static
  gaps. A clean JS task table alone is not enough because compositor work can be asynchronous.
* Readiness time remains diagnostic. It may include WebDriver round trips on native targets and can
  precede deferred paint, so it cannot be the sole cutoff.

## Unverified assumptions

* An action-specific “settled” mark can be defined consistently for CSS transitions, worker-backed
  exports, image decode, navigation, and settings without adding production-only branches.
* A bounded quiet window after readiness will retain coloring/theme/rotation failures that complete
  state mutation before their expensive visual work.
* Idle normalization will remain stable across direct CDP, Appium, and Playwright transports.

## Done & verified

* `a977f457` added action-aligned marks, trace windows, and focused attribution data.
* Sound and no-op runs were repeated enough to distinguish action-local work from ambient idle
  behavior.
* The trace was inspected event-by-event; no product/GPU burst explains the late sound sample.
* The in-flight investigation requested before wrap-up is complete.

## Risks & next 3 steps

1. Write unit fixtures for: immediate jank, deferred post-ready paint, transition work, and a static
   no-op rAF omission. Make the desired classifications explicit before changing the scorer.
2. Trial one attribution rule at a time—prefer a settled/quiet observation boundary or idle-control
   normalization over a sound-specific exception. Re-run the same focused Android samples.
3. Cross-check the retained rule against known historical theme, coloring, screenshot, and rotation
   failures so it still rejects real deferred visual work.

The primary risk is producing green reports by truncating the window before asynchronous product
work begins. Historical negative controls are mandatory.

## Reread first

* `scripts/perf/action-probe.js`
* `scripts/perf/action-stats.mjs`
* `scripts/perf/android-web-actions.mjs`
* `scripts/tests/perf-actions.test.mjs`
* `docs/adrs/0090-tiered-real-ipad-performance-regression-gates.md`
* `docs/scratchpad/ipad-performance-investigation-2026-07.md`
