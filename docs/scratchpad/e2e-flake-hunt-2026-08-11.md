# E2E flake hunt — 2026-08-11

## Method

The baseline machine exposes 10 logical CPUs. The normal local Playwright configuration derives 5
workers and disables retries; CI derives 10 workers and allows 2 retries. This hunt removes the CI
retry safety net and uses its higher contention:

```bash
SPLOTCH_E2E_PORT=43117 npm run test:e2e -- --workers=10 --retries=0
```

The first run executed all 400 Chromium and locally installed WebKit tests. It finished with 398
passes and 2 failures in 1 minute.

Independent full-suite runs restart the preview server between attempts so the managed-token rate
limit gets fresh state. The pre-fix discovery sample was:

| Run | Result  | Failures                                                               |
| --- | ------- | ---------------------------------------------------------------------- |
| 1   | 398/400 | AI preview setup; changelog contents disclosure                        |
| 2   | 399/400 | changelog contents disclosure                                          |
| 3   | 399/400 | changelog contents disclosure                                          |
| 4   | 397/400 | AI safety-refusal setup; Android Beta disclosure; changelog disclosure |
| 5   | 398/400 | Settings post-pinch scroll; changelog disclosure                       |
| 6   | 398/400 | AI error-state setup; changelog disclosure                             |

Across 2,400 pre-fix test executions, the six runs produced 11 failures in four clusters. No other
test failed.

## Observed failures

### AI preview ink misses its polling window

* Status: fixed and stress-verified
* Spec: `web/tests/ai-result.spec.ts`
* Test: `AI result modal › keeps result content inside the card at 700×420`
* Failure: `drawPreview` timed out after 5 seconds waiting for its canvas predicate to become true.
* Stress-run location: line 88 in `drawPreview`, reached while `prepareAiGeneration` was setting up
  the result-modal geometry test.
* Initial scope: setup/harness timing. The assertion failed before the result-card geometry under
  test ran.
* Full-suite frequency: the same `drawPreview` setup timeout appeared in 3 of 6 independent runs,
  under three different result-state tests.
* Reproduction: the isolated failing case passed 20/20 at 10 workers. A stronger amplifier ran the
  complete `ai-result.spec.ts` file 5 times at 20 workers: 94 passed and 6 failed. Two failures were
  the same `drawPreview` timeout, including the original 700×420 case. Four more tests reached the
  result dialog but exhausted a default 5-second wait before the mocked request or response state
  appeared. This makes the common issue broader than the named geometry case: async generation setup
  is bounded in wall-clock milliseconds that collapse under worker starvation.
* Fix: `drawPreview` retries the setup stroke only while no command exists and waits for committed
  undo history between attempts. The mock endpoint's `succeed` and `fail` controls now resolve only
  after the intercepted route has been fulfilled, so response assertions start from a delivered
  response rather than a queued intention.
* Verification: the same full-file amplifier passed 100/100 at 20 workers, zero retries, and
  `--repeat-each=5`.

### Phone changelog contents link remains hidden

* Status: fixed and stress-verified after two recurrences
* Spec: `web/tests/changelog.spec.ts`
* Test: `phone › picking a release from the contents lands it clear of the pinned row`
* Failure: the `Version 1.2.0` contents link resolved in the DOM but remained invisible until the
  30-second test timeout, so Playwright could not click it.
* Stress-run location: line 101, on the contents-link click.
* Initial scope: responsive disclosure setup or interaction timing. The target existed, but its
  containing disclosure was not visibly open when the click ran.
* Reproduction: the disclosure interaction failed in all 6 independent full-suite runs at 10 workers
  and zero retries. Five runs opened the link-click test with its target still hidden. In run 6, the
  earlier disclosure test instead clicked the summary but still found zero visible links. Both
  symptoms show that the one-shot summary click did not leave the native `<details>` open.
* First fix: both tests opened the disclosure through `retryOpen`, using a visible link as the ready
  sentinel. This retries the summary click when hydration restores the server-rendered closed state.
* Initial verification: the complete changelog spec passed 160/160 at 10 workers, zero retries, and
  `--repeat-each=20`.
* Recurrence: final full-suite validation run 1 reached the ready sentinel, then hydration closed
  the disclosure in the gap before the separate target-link click. The click waited on a hidden
  `Version 1.2.0` link until the 30-second test timeout. Opening and choosing must be retried as one
  outcome-driven transaction, not synchronized as two independent actions.
* Final fix: opening the disclosure, clicking the target link, and observing its URL are one retried
  transaction with short per-attempt action bounds. If hydration closes the disclosure anywhere in
  that sequence, the whole user action is tried again.
* Final verification: the focused release-picking test passed 100/100 at 20 workers and zero
  retries.
* Second recurrence: a later full-suite run exposed the sibling phone disclosure test. Its
  `retryOpen` call saw the first link, returned, and hydration then removed all six links before the
  separate count assertion. The first final fix covered release selection but not the other test's
  transient-open boundary.
* Complete fix: both phone tests now treat the panel's computed pixel `max-height` as their ready
  sentinel. That value is produced only by the hydrated component's open-state effect, so a native
  pre-hydration opening cannot satisfy the helper and later be reset underneath the assertion.
* Complete verification: the whole changelog spec passed 400/400 at 20 workers, zero retries, and
  `--repeat-each=50`.

### Android Beta troubleshooting click does not open the disclosure

* Status: fixed and stress-verified after one recurrence
* Spec: `web/tests/android-beta.spec.ts`
* Test: `the troubleshooting panel starts collapsed`
* Failure: the initial collapsed-state assertion passed, but clicking the exact `Troubleshooting`
  text did not add the `<details open>` attribute within 5 seconds.
* Pre-fix frequency: 1 failure in 6 independent full-suite runs.
* Initial scope: a single interaction followed by an assertion, with no retry around the complete
  click-and-open outcome.
* Fix: the test opens through `retryOpen`, with the disclosure's `.rows` content as the visible
  ready sentinel, so a hydration reset causes another summary click instead of a false failure.
* Verification: the focused spec passed 50/50 at 10 workers and zero retries.
* Recurrence: after two clean restarted final runs, run 3 let `retryOpen` observe visible content
  and return, then hydration removed the panel's `open` attribute before the following assertion. As
  in the changelog recurrence, retrying to a transient pre-hydration state does not prove the final
  interactive state.
* Final fix: the test waits for the support email link that this page deliberately adds only in
  `onMount`, then asserts the hydrated panel starts collapsed and clicks it once. The interaction
  can no longer straddle hydration's state reset.
* Final verification: the focused disclosure test passed 100/100 at 20 workers and zero retries.

### Settings does not scroll after an outside-lift pinch

* Status: fixed and stress-verified
* Spec: `web/tests/settings-zoom.spec.ts`
* Test: `a scroll after a pinch finger lifted outside the pane scrolls instead of zooming`
* Failure: the pinch preconditions passed, but the following one-finger drag left the Settings
  pane's `scrollTop` at zero for the full 2-second polling window.
* Pre-fix frequency: 1 failure in 6 independent full-suite runs.
* Initial scope: asynchronous compositor-driven scrolling is given a fixed 2-second wall-clock
  window even though the run deliberately starves browser workers.
* Reproduction: the exact unfixed test failed 7/50 at 10 workers and zero retries. Every failure
  remained at `scrollTop === 0` for the whole polling window rather than merely landing late.
* Fix: the CDP driver now waits for a rendered frame between touch start, each move, and touch end.
  This keeps the compositor from receiving the whole synthetic gesture as one back-to-back burst
  that can be coalesced away under load.
* Verification: the exact amplifier passed 50/50 after the change, then the complete
  `settings-zoom.spec.ts` file passed 110/110 at 10 workers, zero retries, and `--repeat-each=10`.

### Tiled undo is sampled before its repaint completes

* Status: fixed and stress-verified
* Spec: `web/tests/flows-tile-history.spec.ts`
* Test: `tiled undo patches rebuild after the live canvas resizes`
* Failure: after the second undo, a one-shot pixel sample still found `[170, 113, 227, 45]` instead
  of `null`.
* Frequency: 1 failure in 3 post-fix full-suite runs.
* Initial scope: the assertion reads the composited canvas once immediately after undo. Other
  assertions in the same spec poll `firstOpaquePixel` while asynchronous tile repaints settle.
* Fix: both post-undo pixel outcomes now poll until the composite reflects the asynchronous tile
  repaint.
* Verification: the focused test passed 50/50 at 10 workers and zero retries.

### WebKit samples a zero-sized composite canvas

* Status: fixed and stress-verified
* Spec: `web/tests/webkit-smoke.spec.ts`
* Test: `a pointer stroke puts ink on the canvas`
* Failure: the pre-stroke blank-canvas sample threw `IndexSizeError` from `getImageData(0, 0,
  canvas.width, canvas.height)` while both canvas dimensions were zero.
* Frequency: 1 failure in 3 post-fix full-suite runs.
* Initial scope: the shared `firstOpaquePixel` helper assumes the rendered composite canvas has
  non-zero dimensions. WebKit rejects a zero-width or zero-height `getImageData` request before the
  page finishes sizing the canvas.
* Reproduction: guarding the zero-size read removed the exception, but the focused test then failed
  6/50 at 10 WebKit workers because the post-stroke poll stayed blank. The same readiness race can
  therefore lose the stroke itself: `gotoApp` has returned and the input has a box while the live
  composite is still waiting for drawable dimensions.
* Fix: `firstOpaquePixel` treats a zero-area canvas as blank instead of issuing WebKit's invalid
  `getImageData` request. The smoke test also waits for the live composite to have drawable area
  before sending its pointer stroke, rather than using the prerendered input's visibility as engine
  readiness.
* Verification: after the initial 44/50 amplifier exposed the lost-stroke half of the race, the
  complete fix passed the same focused WebKit test 50/50 at 10 workers and zero retries.

### Pathological-stroke setup misses its first undo snapshot

* Status: fixed and stress-verified
* Spec: `web/tests/flows-tile-history.spec.ts`
* Test: `pathological strokes shorten undo depth before exceeding the patch budget`
* Failure: the first stroke completed, but the test's 5-second poll never observed its expected
  first undo snapshot; the debug snapshot count remained zero.
* Frequency: 1 failure in 3 post-fix full-suite runs.
* Initial scope: high-contention setup timing before the patch-budget behavior under test. The
  stroke helper returned, but the asynchronous drawing history did not reach the first committed
  snapshot inside Playwright's default assertion timeout.
* Reproduction: the complete expensive test passed 20/20 when isolated at 10 workers and zero
  retries, pointing to the mixed full-suite workload collapsing the setup's default five-second
  window rather than a deterministic patch-budget failure.
* Fix: the marker setup now retries the stroke only while history contains neither a committed nor
  pending command, and does not enter the expensive pathological-stroke loop until the first command
  is fully committed.
* Verification: the complete focused test passed 20/20 again after the fix at 10 workers and zero
  retries.

### Solid-pen coverage is sampled before the first stroke renders

* Status: fixed and stress-verified
* Spec: `web/tests/flows-palette-brush.spec.ts`
* Test: `the default pen lays solid ink with no crayon buildup`
* Failure: the first post-stroke `canvasInkStats` sample reported zero ink pixels, while the test
  requires more than 200.
* Frequency: 1 failure in the first full-suite run after the Android Beta final fix.
* Initial scope: both stroke samples are one-shot canvas reads immediately after `draw` returns.
  Mouse input completion does not prove the renderer committed the command or repainted the live
  tiles, and the second identical stroke needs its own non-visual commit sentinel before the
  no-buildup comparison is meaningful.
* Reproduction: the focused unfixed pen test failed 5/100 at 20 workers and zero retries, always
  with zero pixels in the first sample. The sibling crayon buildup test passed 100/100 under the
  same load and was recorded here as immune on that evidence. It was not: it carries the same
  flat-zero signature for an unrelated reason, and the green run had measured a precondition that
  was never the one at risk — see "Crayon buildup reads a mis-aligned tile composite" below.
* Fix: the pen test waits for the hydrated drawing harness before input, waits for each stroke's
  exact committed-history state, and polls for first-pass pixel coverage before recording the
  comparison baseline.
* Verification: the same focused pen amplifier passed 100/100 at 20 workers and zero retries.

### Parental-gate setup reaches a still-disabled AI button

* Status: fixed and stress-verified
* Spec: `web/tests/a11y.spec.ts`
* Test: `the parental gate has no serious accessibility violations`
* Failure: `openParentalGate` retried for 10 seconds, but `#aiImageButton` stayed disabled and each
  3-second click attempt timed out before the gate could open.
* Frequency: 1 failure in the second full-suite run after the pen fix.
* Initial scope: the AI action is gated on a non-empty canvas. The test draws immediately after
  `gotoApp`, then asks the shared parental-gate helper to click AI without first observing that the
  drawing enabled the button.
* Fix: the shared parental-gate opener now owns an outcome-driven setup stroke. It redraws only
  while the AI button remains disabled and does not try to open the gate until that product
  precondition is true. The separate AI-report flow uses the same helper.
* Verification: the exact accessibility test passed 100/100 at 20 workers and zero retries, then the
  complete parental-gate spec passed 105/105 at 20 workers and `--repeat-each=5`.

### Crayon buildup reads a mis-aligned tile composite

* Status: fixed and stress-verified; surfaced after the hunt closed, as issue #966
* Spec: `web/tests/engine-crayon.spec.ts`
* Test: `crayon strokes keep paper tooth and build up without muddying`
* Failure: the first coverage sample returned a flat 0 against a `> 0.3` bound — the solid-pen
  signature above, in a spec that entry had exempted.
* Frequency: 1 failure in a full `npm test` run; 3 in 50 under `--repeat-each=10`; 1 in 5 at
  `--workers=1`.
* Initial scope: read as another commit-and-repaint race on the strength of the matching signature.
  It is not one. Instrumenting the failing `page.evaluate` showed the stroke painting an identical
  2,551 non-transparent pixels in passing and failing runs alike — only the sampled region came back
  empty, and only in the runs where a whole row of tiles above it still carried the 300×150 canvas
  default.
* Root cause: `resizeTiledRenderer` defers a hidden tile's backing store and migrates one tile per
  frame, so for the ~16 frames after the initial resize a hidden tile reports the size it last held.
  `compositeVisibleLiveTiles` measured each row and column from those backings, preferring visible
  tiles wherever a row had one — a row whose tiles are all hidden has none, so it took 150 where the
  grid is 75. The inflated row pushed every later row 75px down the composite, and `pixelsIn` read
  paper coordinates off the ink.
* Fix: each tile publishes the backing size the renderer intends it to have, and the composite
  builds its grid from that instead of from backings that lag it.
* Verification: the exact test passed 100/100 at 20 workers and zero retries, then the complete
  `engine-crayon.spec.ts` passed 100/100 under the same load.
* Scope note: the composite is shared by every spec that reads pixels through `renderedCanvasHandle`
  and by the `/dev/engine` harness, and three of that file's other four one-shot readers sample
  regions the same shift would move. The mis-alignment is a defect in the seam, not a missing wait
  in each caller, so the seam fix covers the class where per-spec polling could not have.

## Post-fix full-suite validation

| Run | Result  | Failures                                            |
| --- | ------- | --------------------------------------------------- |
| 1   | 398/400 | tiled undo repaint; WebKit zero-sized canvas sample |
| 2   | 400/400 | none                                                |
| 3   | 399/400 | pathological-stroke first snapshot                  |

## Final full-suite validation

| Run | Result  | Failures                                |
| --- | ------- | --------------------------------------- |
| 1   | 399/400 | changelog recurrence                    |
| 2   | 400/400 | none                                    |
| 3   | 400/400 | none                                    |
| 4   | 399/400 | Android Beta recurrence                 |
| 5   | 399/400 | solid-pen first-stroke sample           |
| 6   | 400/400 | none                                    |
| 7   | 399/400 | parental-gate AI precondition           |
| 8   | 400/400 | none                                    |
| 9   | 399/400 | changelog disclosure sibling recurrence |
| 10  | 400/400 | none                                    |
| 11  | 400/400 | none                                    |
| 12  | 400/400 | none                                    |

Across the entire hunt, 21 independent full-suite runs executed 8,400 tests and exposed 19 failures
in 9 clusters. The final current-code sample is three consecutive 400/400 runs: 1,200 executions at
10 workers with retries disabled and no failures.

## Resolution order

1. Changelog disclosure hydration.
2. AI generation setup and mock delivery.
3. Android Beta disclosure hydration.
4. Settings synthetic-gesture pacing.
5. Tiled-undo repaint sampling.
6. WebKit live-canvas readiness.
7. Pathological-stroke history setup.
8. Solid-pen commit and repaint sampling.
9. Parental-gate non-empty-canvas setup.

The following issue was found after the hunt closed and is not among the 19 failures above:

* Live-tile composite grid geometry.
