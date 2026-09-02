# E2E flake hunt — 2026-09-02

The working behind PR \#1556 and the ADR-0078 §4a amendment it carries. The list came from a log
sweep of 106 `test.yml` runs (2026-08-29T18:38Z to 2026-09-02T00:52Z) that extracted the
retried-pass annotations `web/playwright-flaky-reporter.ts` emits: 52 masked flakes in 39 runs,
every one shipped green under `retries: 2`. That sweep's scratch files are gone; its table is
reproduced in the PR.

## Method

Cloud container, 4 logical CPUs (`availableParallelism()` = 4, so 4 workers is the supported CI
contention level, ADR-0078). Every discovery and validation rep ran through the sweep driver, which
unsets the CI variables (retries off) and boots a fresh preview server per rep:

```bash
npm run test:e2e:sweep -- --workers=4 --reps=3 --out=<dir>            # discovery, built once
npm run test:e2e:sweep -- --workers=4 --reps=6 --prebuilt --out=<dir> # with instrumented probes
npm run test:e2e -- <specs> --workers=8 --retries=0 --repeat-each=N  # diagnostic amplification
```

A rep of the full suite (581 tests) takes about 340s at 4 workers here.

## Container baseline

Two specs fail deterministically in this container, before and after every change, 13 of 13 reps,
and are green in CI. They are the floor every tally below sits on and are not part of the hunt:

* `pwa-registration.spec.ts` › serves canonical precache bytes for offline DPR 1 and DPR 3 page
  previews — offline, the service worker answers the `max-240px` request with the 160px sized asset
  (`decodedWidth: 160`) where the spec expects the canonical 267px fallback bytes.
* `store-drawing-replay.spec.ts` › pointer and engine replay render the same compiled scene — the
  `custom` colour swatch never satisfies Playwright's stable check within the 30s test budget.

A third, `flows-parental-gate.spec.ts` › the bundled privacy page gates its provider terms link,
went red in 4 of 13 full-suite reps here (`solveParentalGate` never finds the keypad digit, 15s),
and once in a full-suite run at 8 workers. It is absent from the CI sweep's list and was not chased.

## Pre-fix discovery, 4 workers, retries off

| Rep      | Listed-test failures                                                                         |
| -------- | -------------------------------------------------------------------------------------------- |
| sweep1 1 | none                                                                                         |
| sweep1 2 | none                                                                                         |
| sweep1 3 | `ai-report` › a failed refusal report offers an in-place retry (`Try again` never found, 5s) |
| sweep2 1 | none on the real specs; probe `refusal retry 1` failed (dump below)                          |
| sweep2 2 | none on the real specs; probe `cancel 1` failed (dump below)                                 |
| sweep2 3 | none                                                                                         |
| sweep2 4 | none                                                                                         |
| sweep2 5 | none                                                                                         |
| sweep2 6 | none                                                                                         |

9 reps, 1 red rep on the real ai-report spec, 0 on tiled history, the hexagon gap, and the safe-area
matrix. One full-suite run at 8 workers (diagnostic only) additionally timed out tiled history at
30.2s mid-stroke.

## The ai-report cluster

### What was ruled out first

* **The launch dead zone at rest.** The confirm dialog flies in from the Report control, and
  `modalDialog` arms `launchGuard`'s 72px / 600ms zone there. A geometry probe at 390×844 put the
  landed Cancel button 193px and Send 130px from that origin, so a click on a landed dialog cannot
  be in the zone.
* **Isolated contention.** `ai-report.spec.ts` alone, 8 workers, `--repeat-each=10`: 100 executions,
  0 failures. Instrumented probes at 4 workers under six busy-loop CPU burners: 24 executions, 0
  failures. Every click in those runs was dispatched 421ms to 931ms after `showModal()`, after the
  350ms fly-in had finished.
* **A slow fly-in.** CDP `Animation.setPlaybackRate(0.05)` stretched the fly-in to 7s; Playwright's
  click waited the whole 7.3s and landed. A slow animation moves every frame and is never "stable".

### The capture

Instrumented copies of the two click shapes (patched `showModal` to timestamp the open; window
capture-phase listeners logging every pointer phase with its target, the dialog's rect, and
`getAnimations()` state) ran 12 per rep inside 6 full-suite reps at 4 workers. Two failed:

```
sweep2 rep 1, probe refusal retry 1 (attempts 0, dialog still open, focus on Cancel):
  pointerdown +52ms  (198.7,519.9) target=button.btn.brand:Send report dialog=187/501/17/21 anims=running/pending@0
  pointerup   +52ms  (198.7,519.9) target=button.btn.brand:Send report dialog=187/501/17/21 anims=running/pending@0
  click       +53ms  (198,519)     target=button.btn.brand:Send report dialog=187/501/17/21 anims=running/pending@0
  origin: --origin-x: 0px; --origin-y: 89.5px  (viewport centre 195,422 → origin 195,511.5)

sweep2 rep 2, probe cancel 1 (dialog still open, focus on Cancel):
  pointerdown +107ms (259.8,723.7) target=button.btn.wash:Cancel     dialog=255/705/17/21 anims=running/pending@0
  pointerup   +108ms (259.8,723.7) target=button.btn.wash:Cancel     dialog=255/705/17/21 anims=running/pending@0
  click       +108ms (259,723)     target=button.btn.wash:Cancel     dialog=255/705/17/21 anims=running/pending@0
  origin: --origin-x: 68.5px; --origin-y: 293.5px  (→ origin 263.5,715.5)
```

The dialog is 17×21px — `min(92vw, 336px)` × ~420px at `scale(0.05)` — parked on the launch origin
with its fly-in **pending**: Chromium has not yet granted the animation a start time, so the 0%
keyframe holds across frames. Playwright's `_checkElementIsStable` wants two consecutive
`requestAnimationFrame` samples with an identical rect (`stableRafCount` is 1 headless), which a
pending animation satisfies. The click is then dispatched at the scaled-down button, 9px from the
origin, and `modalDialog`'s capture-phase `pointerdown` handler swallows it as a launch-zone tap.
The event log shows Playwright saw the right target for every phase, so from its side the click
succeeded.

Why only these five tests: each clicks a confirm button straight after the open. The `Escape`
variant of the parameterised dismissal test never clicks (0 hits in 106 runs beside its Cancel
twin's 14), and the two reduced-motion tests fade instead of flying and click only after several
extra assertions (0 hits).

Classification: harness race. The dead zone swallowing a tap on a 17px dialog in its first 50ms is
the product working as designed (issue \#308). Fix: `landedReportConfirm` in `tests/ai-harness.ts`
waits for `Animation.finished` via `settleFlyIn` before the first pointer action.

## Tiled history

`tiled history folds its old prefix and retains twenty undo steps` ran 25.9s, 26.1s and 26.5s in the
three sweep1 reps at 4 workers against the default 30s budget, and timed out at 30.2s inside
`dragStroke`'s `mouse.move` on the fourteenth stroke in the 8-worker run. Its siblings in the same
file run 34s and 43s and declare `test.slow()`. Budget, not race: `test.slow()` added. Post-fix at 8
workers ×4: 25.7s, 35.4s, 38.9s, 44.5s; full suite at 8 workers: 48.4s.

## Hexagon gap

Not reproduced: 0 of 9 reps, 0 of 24 instrumented copies (6 per rep in sweep2 reps 3–6), 0 of 1 at 8
workers. ADR-0078 §4a records it red once in 35 with the gap `mouse.move` leaving the target
un-highlighted. The picker snapshots hexagon centres and its snap radius on the drag's
`pointerdown`, the spec's drag began right after `retryOpen` on a dialog still flying in (the window
captured above), and the gap probe sits at 39px against a 40px landed radius. The tap sibling
already had `settleFlyIn`; the exploration test now does too. Evidence of no harm only.

## Safe-area matrix

`iphone-notch-44 · landscape-right`: 0 of 10 reps here, failure body never captured (the run's trace
artifact had expired), no candidate mechanism — the layout store measures insets and the orientation
angle at module load, before the marker the spec waits on. Filed as issue \#1554.

## Post-fix validation

* Targeted amplifier, `ai-report` + `flows-palette-brush` + `flows-tile-history` ×4 at 8 workers,
  retries off: 124 executions, 0 failures.
* Full suite at 8 workers, retries off: 581 tests, only the two container-baseline failures.
* Three full-suite reps through `test:e2e:sweep` at 4 workers, retries off: 1,743 executions;
  failures were the container baseline (3/3 each) and the parental-gate test (1/3). 0 on any listed
  test.

A clean streak is validation, not proof: the CI sample is ~3.5 days and its counts are a floor.
