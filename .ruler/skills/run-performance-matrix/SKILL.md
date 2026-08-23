---
name: run-performance-matrix
description: Run Splotch's drawing, undo, and discrete-action performance suites across macOS web, physical or simulated iPad web/native, and physical or emulated Android web/native targets. Use when capturing a deployment-target performance snapshot, comparing renderer architectures, validating a performance fix across platforms, or refreshing the committed performance matrix.
---

# Run performance matrix

Capture comparable performance evidence across Splotch deployment targets without confusing
transport artifacts, simulator results, or stale builds with product behavior.

## Before running

Physical iPad or Android in scope? **Start with the `start-capture-session` skill.** It takes the
rig over and proves both devices will actually accept a capture — every other readiness check is
host-side, which is how a device blocked by Guided Access reports ready while every capture fails.

Read the `profiling` skill completely. Read the `mobile` skill completely when any iOS, Android, or
Capacitor target is in scope. Read [`references/platforms.md`](references/platforms.md) completely
before starting a multi-target run or any target whose setup is not already active.

Run `npm run info` and read the `perf:*` rows before composing commands. The script descriptions own
current flags; this skill owns sequencing and interpretation.

Record:

* branch and exact product commit;
* target, OS/browser/WebView version, model, orientation, and web/native mode;
* runner and input transport;
* input-fidelity classification;
* raw output path;
* whether the run is a snapshot, rejection check, or approval gate.

Never put device IDs, credentials, provider tokens, or signing data in committed artifacts.

## Choose the campaign

### Snapshot

Measure the current build and report what happens. Do not fix product failures during the capture.
Preserve the first valid red result instead of repeating until green. Use `--report-only` when the
runner would otherwise stop before saving the complete requested suite.

### Focused fix validation

Measure one action or brush on the first failing target, make one implementation change, and rerun
that exact test. Back out rejected trials. Once the candidate passes, run the same focused test on
the other targets whose rendering path could be affected. Do not broaden to the full matrix until
the focused result is stable.

### Architecture comparison

Use the current runner, probe, action plan, gates, viewport, and input plan against both builds.
Serve the control from a detached worktree and use the runner’s external `--url=` seam. Do not
compare an old runner with a new runner. Run at least three identical samples and report ranges or
median-plus-worst, including between-stroke and whole-window gaps rather than only in-contact P95.

## Run serially

Run one target at a time. Within a target, run one brush/action family at a time when diagnosing.
Stop or detach old preview, Appium, proxy, and forwarding sessions before changing targets. A single
machine’s GPU, simulator, browser, and Appium sessions contend with one another; parallel captures
are not comparable.

For a full target snapshot, capture:

1. drawing for pen, crayon, Magic, and eraser;
2. undo after pen history setup;
3. the full discrete-action plan with four repeats (one warmup plus three scored samples);
4. a screenshot or visible-state check when rendering topology changed.

Save each raw artifact path before continuing.

## Build discipline

Use a fresh instrumented build at the beginning of a target campaign. `PERF_MARKS` and the dev
harness are compile-time inputs; an ordinary build cannot be made instrumented by changing only the
server environment.

For a shared web preview:

```sh
npm run perf:build
npm run perf:serve --ignore-scripts
```

Reuse that preview with runner-specific `--no-serve`, `--no-build`, or `--ignore-scripts` flags as
described by `npm run info`. Rebuilding between two halves of one comparison invalidates the
comparison unless both halves deliberately use the new commit.

Native apps must be built/synced with performance marks before installation. Normal `npm run build`
and `npm run build:cap` run post-build guards that prove profiling seams and engine marks are
tree-shaken from release output. Run the applicable release build after changing a seam.

## Use the correct transport

* **Mac web:** headed Playwright WebKit for comparable local drawing/actions.
* **iPad web/native, physical or Simulator:** Appium/XCUITest drives native touch; the in-page probe
  measures frames. Physical MobileSafari is the calibrated iPad approval target.
* **Android Chrome web:** direct CDP via `perf:android:browser:actions` for actions. Do not approve
  browser frames from the Appium action transport.
* **Android native:** Appium attached to the Capacitor WebView with
  `--native-app --native-webview-class=android.webkit.WebView`.

Appium automation round-trip time is not an application frame metric. The probe must measure inside
the page. Native rotation must go through whatever orientation control the product actually offers,
and restore what it changed; do not bypass product persistence with a test-only preference mutation.
Which control that is depends on the platform, and the runner resolves it rather than assuming:

* Where the product persists an in-app rotation lock, the run flips that Settings control and
  restores the observed lock and orientation in cleanup.
* On a native tablet there is no such control — `supportsOrientationLock()` is false because iPadOS
  windowing ignores an in-app lock — so device rotation is the only path the product offers and the
  runner takes it, recording `platformOwnsRotation` in the capture. A missing toggle there is the
  product's answer, not a targeting failure; treating it as unavailable is what left the iPad
  simulator's native landscape cells unmeasured in the 2026-08-20 campaign.

Shells differ by mode too, and an action plan that assumes one will time out against the other. A
landscape phone renders the compact Settings shell — quick toggles and a pointer to portrait instead
of the section list — so the sweep measures that shell's own controls under compact-specific labels
and records which shell it measured. Compare a mode against the same shell, never across two.

## Apply fidelity tiers

Only a hand-calibrated physical target may approve its deployment class. The physical-iPad web
calibration checks trusted cadence/contact geometry and owns the Safari gates. Native iPad,
simulator, Android, and Mac samples remain advisory until separately calibrated even when their
timing gates pass.

Use emulators, simulators, and local browsers as rejection tiers:

* a failure is a useful lead and may reject a candidate after attribution;
* a pass does not prove the physical device is good;
* the iOS Simulator is known to reproduce the historical pre-tiling Magic/crayon/undo cliff and is a
  valuable architecture negative control.

Never relabel one target’s calibration as another target’s approval.

## Interpret a failure before fixing

Read the raw action/drawing sample and the action-aligned trace. Determine whether work is owned by
the action:

1. check input time, first frame, readiness, post-action intervals, and transition completion;
2. inspect engine marks, long tasks, layout, paint, raster, and GPU/compositor bursts;
3. compare the same window with an idle/no-op control when the page is already static;
4. distinguish an interval that began before event delivery from work after delivery;
5. retain deferred image decode, worker response, CSS transition, and compositor work even if DOM
   state was ready earlier.

A late rAF gap with no UI mutation and no corresponding app/layout/paint/raster/GPU work can be an
idle renderer omission. It is not automatically product jank. Conversely, do not truncate the window
at a DOM-ready flag when visible work is still pending.

## Report the result

For drawing, report paint P95/P99/max and the cumulative lost-frame share of in-contact time. For
undo, report engine P95 and next-frame P95/max. For actions, report first-frame P95, post-action
frame P95, post-action max, activation fidelity, and the count/list of failed actions. Include input
fidelity and the raw artifact path beside the result.

When refreshing the committed matrix:

1. update `scrapbook/performance/2026-07-31-deployment-target-matrix/sources.json` with raw sources
   from one clearly identified product commit;
2. run the report generator shown in that directory’s `index.md`;
3. inspect `data.json`, `index.md`, and `index.html`;
4. keep unavailable rows explicit;
5. do not copy raw timelines or device identifiers into the scrapbook.

If a target was blocked, record the exact last successful setup check and continue to the next
target in a snapshot campaign.

## Verification

After harness or scorer changes, run focused script tests plus `npm run check`, `npm run lint`, and
`npm run format:check`. Reanalyze preserved captures when metric definitions change. Cross-check a
new scorer against known historical failures so a convenient green rule does not hide deferred
visual work.

After product changes, run the focused behavior tests for the changed interaction and visually check
the real route. Timing without correct pixels, alignment, undo semantics, sound, or rotation state
is a failed trial.
