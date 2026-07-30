# Handoff — automated compositor lag detection

> 2026-07-30 · branch `fix/ipad-render-scale` · Make the physical-iPad harness reliably detect the
> real-screen starvation before using it to iterate on fixes.

## Objective & non-goals

Build a repeatable, fully automated physical-iPad test that can reproduce and score the lag seen
during real drawing. The first milestone is not another rendering fix; it is proving that
programmatic input traverses the same path as a finger and that the harness can distinguish the
laggy 2x baseline from the 1.5x mitigation.

Once that is true, turn the score into a regression test and use the same harness for fast A/B
iteration.

Do not:

* claim a final root cause yet;
* treat fast JavaScript event handling or low engine timings as proof that the screen presented a
  frame;
* accept a synthetic run unless its input signature matches the real capture;
* merge unrelated coalescing work from draft PR #662 into this experiment;
* make MobileSafari conclusions from a Capacitor `WKWebView` run without a separate MobileSafari
  reproduction.

## State

* Branch: `fix/ipad-render-scale`
* Pull request: none. The user approved creating a draft, but specifically does not want the final
  cause overstated. If a draft is opened for this branch, describe the 1.5x change as a measured
  mitigation and use `Refs #659`, not `Fixes #659`.
* Remote state before this handoff commit: `origin/fix/ipad-render-scale` was at `1bd474e3`; local
  was one commit ahead.
* Relevant commits:
  * `0e738813` — records the investigation's dead ends and saves the profiling tooling.
  * `1bd474e3` — caps the drawing backing-store scale at 1.5x.
  * `1f5583d4` — qualifies the attribution throughout the docs and profiling skill.
* Production candidate: `web/src/lib/drawing/engine.ts` defines `MAX_RENDER_SCALE = 1.5`.
* Open draft PR #662 is an independent pointer-event coalescing experiment. It reduced style
  recalculation but did not reduce composite work or demonstrate an improvement in felt lag. Leave
  it open and separate.

Two useful harness-only commits exist on branch `free-draw-window`:

* `f76bbac9` — stops the metrics from hiding stalls between strokes.
* `a8e90655` — reports the free-draw window in the probe's install line.

They add `--free-draw=N`, retain whole-window data, and report in-contact, between-strokes, and
full-window populations. They are not on the current branch. Cherry-pick only those two commits onto
a neutral experiment branch; do not merge `free-draw-window`, because that branch also contains PR
#662.

Primary files:

* `scripts/perf/real-screen-probe.js` — browser probe, raw frame/event/engine tables, and the
  current JavaScript-dispatched input driver.
* `scripts/perf/real-screen-stats.mjs` — observed refresh beat, phase summaries, late-window
  analysis, and engine-work attribution.
* `scripts/perf/ipad-frames.mjs` — physical-device orchestration through WebKit Inspector.
* `scripts/perf/ipad-session.mjs` and `scripts/perf/webkit-inspector.mjs` — existing device
  transport.
* `scripts/tests/perf-real-screen.test.mjs` — pure stats and probe-contract tests.
* `scrapbook/perf/2026-07-29-ipad-real-screen/findings.md` — evidence and the full A/B table.
* `docs/adrs/0015-capped-dpr-canvas-rendering.md` — rendering-scale decision.
* `docs/adrs/0079-physical-ios-device-capture-webkit-inspector-protocol.md` — device capture
  architecture.
* `docs/adrs/0083-real-screen-capture-on-device.md` — real-screen measurement method and its limits.
* `.agents/skills/profiling/SKILL.md` and `.agents/skills/profiling/ipad-device-profiling.md` —
  canonical operating procedure for the current harness.

## Measured signal to reproduce

The measured symptom is **real-screen render starvation**, not slow pointer handling:

* A hand-drawn capture had frames delayed by 335–1422 ms.
* Pointer moves continued to be handled about every 8.3 ms.
* Event queue delay stayed around 5–7 ms.
* Only about 5 ms of marked engine work occurred inside the 1422 ms frame gap.
* `engine.commit` itself took roughly 1–3 ms.
* In the matching manual Safari Timeline baseline, all 15 commits were associated with composites
  longer than 200 ms. There were 293 composites totaling 5047 ms over 9.3 seconds, with a 255.9 ms
  maximum.
* Those long composites began 2–192 ms after the `engine.commit` mark closed.

The synthetic drivers did not reproduce this. One move per frame, 83 Hz, 240 Hz pen input, the HUD
path, and a four-minute soak all remained smooth. That is the fidelity gap this handoff exists to
close.

The manual A/B results were:

| Variant                                          | Long composites / commit | Composite ms / drawing second | Observation              |
| ------------------------------------------------ | -----------------------: | ----------------------------: | ------------------------ |
| 2x baseline                                      |                     1.00 |                         543.7 | Visible lag              |
| Pooled patch canvases                            |                    ~0.90 |                             — | Allocation not candidate |
| 2x without snapshot                              |                     0.15 |                         395.9 | Improved trace           |
| 2x without snapshot, optional layers hidden      |                     0.17 |                         464.1 | User: worst run          |
| 1x diagnostic                                    |                     0.02 |                         171.4 | User: not too bad        |
| 1.5x candidate, production snapshot path enabled |                     0.13 |                         422.6 | 2 long / 16 commits      |

These are separate hand-drawn runs, so input and thermal state were not controlled. They support
candidates, not a final cause:

1. Snapshot paper-patch capture/readback or synchronization around stroke commit is the strongest
   discrete trigger candidate.
2. Backing-store pixel area is the strongest continuous-cost signal.

The 1.5x cap cuts the DPR2 backing-store pixel count by 43.75% while leaving export scaling
independent. It is the current measured mitigation.

## Detection contract

Implement two related outputs.

### Regression signal

Derive a render-starvation episode only from retained raw data:

1. A `requestAnimationFrame` gap exceeds a threshold derived from the observed display interval,
   provisionally `4 × observedFrameIntervalMs`.
2. Trusted touch pointer events were handled during the gap.
3. Marked engine work accounts for only a small fraction of the gap.
4. Associate the episode with the nearest finger lift or `engine.commit:end`, using a reported
   attribution window rather than deleting samples outside it.

Report at least:

* starvation episodes per commit;
* starvation milliseconds per drawing second;
* worst animation-frame gap;
* commits followed by starvation within the attribution window;
* the in-contact, between-strokes, and whole-window populations separately.

Keep thresholds named and unit-bearing. Calibrate them from repeated baseline captures before making
the CLI fail. A useful initial unit fixture is the real signature: a 1422 ms frame gap containing
trusted moves about every 8.3 ms, 5–7 ms event queue delay, and about 5 ms of engine work. Add
clean, idle, and between-strokes fixtures too.

### Diagnostic attribution

Run a system compositor/render trace over the same gesture. Prefer an `xctrace` spike using the
Animation Hitches template and inspect `xctrace export` output for MobileSafari render/commit
hitches. WebKit Timeline can be started with `console.profile()` / `console.profileEnd()`, but
exporting usable Timeline data may still require Web Inspector frontend automation because the raw
protocol path previously returned zeroed timestamps.

The regression test may gate on the starvation proxy once it is validated. The system trace is for
attribution and correlation; it need not be the first CI-style assertion.

## Input-fidelity gate

The current driver constructs and dispatches JavaScript `PointerEvent` objects. Replace that as the
primary reproduction path with OS-mediated input against MobileSafari on the physical iPad.

Try a disposable Maestro spike first because it is already in the project. If it cannot address
MobileSafari reliably or its events do not match the hand capture, use XCUITest/WebDriverAgent
coordinate gestures. Do not commit a permanent driver choice until it passes the fidelity gate.

Extend the raw event table long enough to prove:

* `event.isTrusted === true`;
* `pointerType === "touch"`;
* move cadence overlaps the hand capture, roughly 115–134 moves per second;
* timestamps and coalesced-event behavior are comparable;
* several pointer moves are handled while a delayed screen frame is pending;
* pressure, radius, width, and height are recorded if they help distinguish injected input from a
  real finger.

A green run that fails any of these checks says only that the synthetic path is fast. It does not
test issue #659.

## Decisions made (and why)

* Treat presentation starvation as the primary regression signal. Main-thread engine duration did
  not explain the visible pauses.
* Keep raw tables and derive classifications in `real-screen-stats.mjs`. Filtering in the probe made
  earlier between-stroke stalls invisible and made later analysis impossible.
* Use the observed refresh interval for thresholds. The physical iPad's effective cadence is not
  safely represented by a hard-coded 8.33 ms.
* Use paired A/B/A/B runs after reproduction. This helps expose order, device temperature, and
  inspector overhead.
* Keep detection and attribution separate. An rAF/input signature can support a fast regression
  gate; Timeline or Instruments is needed to say where the time went.
* Keep the automation experiment off the mitigation branch. Begin from `origin/main` and apply only
  the two isolated harness commits.

## Rejected or retired approaches

* More aggressive JavaScript event rates: they did not reproduce the problem.
* The four-minute synthetic soak: it stayed clean.
* Canvas-allocation pooling as the primary cause: the pooled run retained nearly one long composite
  per commit.
* Hiding optional DOM layers as a complete explanation: that run was subjectively the worst and did
  not improve the composite metric.
* Reading low `engine.commit` duration as a healthy frame: the longest stalls began after that mark
  ended.
* Treating PR #662 as the lag fix: it changes event processing and style recalculation, but the
  available trace did not show a composite improvement.

## Unverified assumptions

* XCUITest/WebDriverAgent or Maestro produces MobileSafari events sufficiently close to physical
  digitizer input to trigger the compositor behavior.
* The two harness-only commits cherry-pick cleanly onto the current `origin/main`.
* Animation Hitches can observe useful MobileSafari or WebKit render activity on this device and
  exports machine-readable timestamps.
* The WebKit probe clock can be correlated accurately enough with the Instruments clock.
* The 2x baseline remains reproducible on demand and the 1.5x candidate separates from it under
  controlled input.
* The 1.5x candidate's subjective improvement is real; the prior manual runs did not settle that
  question.

If trustworthy OS-mediated software input still stays clean, stop iterating on synthetic browser
APIs. The fallback is a physical conductive stylus or XY actuator plus an external 120/240 fps
camera, both driven and scored by the Node orchestrator.

## Done & verified

* Physical iPad confirmed that the 1.5x candidate creates a 1923×1372 drawing canvas at device pixel
  ratio 2.
* Unit tests: 918 passed.
* Asset-generation tests: 120 passed.
* Repository-script tests: 399 passed.
* Playwright E2E: 208 passed, including WebKit.
* `npm run check`: no errors or warnings.
* `npm run lint`: passed.
* `npm run format:check`: passed. dprint emitted a cache-permission warning but exited successfully.
* `npm run check:adrs`: passed.
* `npm run ruler:check`: generated agent files are in sync.
* `git diff --check`: clean before this handoff.
* Temporary A/B worktrees and development servers were removed or stopped.

## Risks & next 3 steps

1. **Prove trusted input can reproduce the baseline.**
   * Resume and consume this handoff on `fix/ipad-render-scale`.
   * Re-read the profiling skill and ADRs listed below.
   * Fetch, then create a neutral branch from `origin/main`:

     ```sh
     git fetch origin
     git switch -c experiment/trusted-ipad-input origin/main
     git cherry-pick f76bbac9 a8e90655
     ```

   * Add the input-fidelity fields to the raw event table.
   * Use the existing WebKit Inspector transport while a disposable Maestro or
     XCUITest/WebDriverAgent driver draws long strokes, short strokes, and a free-draw window in
     MobileSafari.
   * Success means trusted touch events match the hand-input cadence and at least one repeated 2x
     run shows the real starvation signature. Do not proceed from synthetic-only clean runs.

2. **Turn the signature into a deterministic scorer.**
   * Add a pure `starvationEpisodes(...)` analysis to `scripts/perf/real-screen-stats.mjs`.
   * Add fixture coverage to `scripts/tests/perf-real-screen.test.mjs` for the real 1422 ms episode,
     a clean drawing, idle time, and a stall between strokes.
   * Report all populations and raw output. Run controlled 2x/1.5x A/B/A/B trials with the same
     gesture script.
   * Only add a nonzero CLI exit or regression threshold after repeated 2x baseline runs trigger and
     repeated clean/1.5x runs distinguish themselves.

3. **Correlate the scorer with compositor evidence.**
   * List available `xctrace` templates and wrap the automated gesture in an Animation Hitches
     recording.
   * Export the trace, identify render/commit hitch rows, and correlate them with probe frame gaps
     and `engine.commit:end`.
   * If `xctrace` cannot expose MobileSafari activity, try Web Inspector frontend automation around
     `console.profile()` / `console.profileEnd()`.
   * If neither software driver reproduces the hand-drawn signature despite passing the fidelity
     checks, document that negative result and move to the physical-actuator/camera fallback.

The largest risk is building a precise test around input that never exercises the problem. Require
the baseline reproduction before optimizing the scorer or choosing a permanent automation stack.

## Reread first

1. `.agents/skills/profiling/SKILL.md`
2. `.agents/skills/profiling/ipad-device-profiling.md`
3. `scrapbook/perf/2026-07-29-ipad-real-screen/findings.md`
4. `docs/adrs/0079-physical-ios-device-capture-webkit-inspector-protocol.md`
5. `docs/adrs/0083-real-screen-capture-on-device.md`
6. `docs/adrs/0015-capped-dpr-canvas-rendering.md`
7. `scripts/perf/real-screen-probe.js`
8. `scripts/perf/real-screen-stats.mjs`
9. `scripts/perf/ipad-frames.mjs`
10. `scripts/tests/perf-real-screen.test.mjs`
