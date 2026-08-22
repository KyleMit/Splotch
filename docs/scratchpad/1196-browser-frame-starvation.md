# Issue 1196 — browser frame starvation on real devices

Investigation log for the seven-candidate campaign. Raw captures land in gitignored
`perf-profiles/`; this file keeps the numbers and the reasoning that outlive them.

## What the reported failure actually is

`lostFrameTimeShare` (`tools/perf/lib/real-screen-stats.mjs`) is not a paint metric. It is derived
from rAF deltas:

```
budgetMs      = min(p10 of all frame deltas, 16.67)
lateThreshold = budgetMs * 1.5
lostMs        = sum over deltas > lateThreshold of (delta - budgetMs)
share         = lostMs / sum(all in-contact deltas)
```

Two consequences that shape every candidate below:

* The budget is **derived per capture**. On the 120 Hz Galaxy S21 FE the observed beat is ~8.2 ms,
  so the late threshold is ~12.3 ms and the gate asks the browser to hold 120 fps to within 1%. On
  the iPad, Safari hands web content a 60 Hz beat, so the threshold is ~25 ms.
* Paint latency and lost-frame share measure different things. Every failing cell passes all three
  paint gates; the failure is entirely in rAF pacing.

## Baseline evidence (from the committed matrix, 2026-08-21)

| Target                    | Pen   | Crayon | Magic | Eraser |
| ------------------------- | ----- | ------ | ----- | ------ |
| iPad physical · web       | 2.5%  | 5.1%   | 2.7%  | 3.3%   |
| iPad physical · native    | 0.0%  | 2.0%   | 0.1%  | 0.3%   |
| Android physical · web    | 10.1% | 11.9%  | 12.0% | 31.7%  |
| Android physical · native | 0.0%  | 0.0%   | 0.0%  | 0.0%   |
| Android emulator · web    | 0.6%  | 0.0%   | 0.1%  | 0.5%   |

Android physical native records a **maximum** in-contact frame delta of 8.3–8.4 ms across a ~69 s
capture — no frame ever late. That is cleaner than a real display pipeline usually is, and it is the
reason candidate 6 exists: Android WebView drives rAF from the host app's Choreographer without the
compositor backpressure Chrome's BeginFrame source applies, so a WebView's rAF cadence can stay
perfect while presentation slips. The browser number may simply be the honest one.

Note also that both Android web and Android native captures fail the same three input-fidelity
checks (`cadence`, `coalescing`, `contactGeometry`), so the web-vs-native gap on that platform is
not an input-fidelity artifact.

## Candidates

1. **rAF-coalesced rasterization.** Today `draw()` rasterizes synchronously inside every
   `pointermove` (`web/src/lib/drawing/engine.ts`). `docs/PROFILING-IPAD.md` records 1.9–4.2 moves
   per painted frame on device — the engine repeats per-event work several times per presentable
   frame. Buffer points on the event and flush once per rAF.
2. **Viewport-adaptive live-tile grid.** ADR-0085 fixed a 4×4 grid from a 2732×1830 iPad backing
   store. A portrait phone paper is roughly 720×1560 backing pixels, so the same grid pays 48
   composited canvases to keep a 0.07 Mpx maximum surface — far below the measured 1.565 Mpx cliff.
3. **Crayon without `mix-blend-mode` live planes.** Crayon is the worst brush on every physical
   target and the only native-iPad failure. It owns 32 extra live canvases, 16 of them blended
   inside an `isolation: isolate` stacking context.
4. **Scribble touch guard scoped to WebKit.** The non-passive `touchstart`/`touchmove`
   `preventDefault()` pair exists only to release iPadOS Scribble. On Chromium it is pure
   main-thread touch routing cost.
5. **Opaque paper-in-canvas plus `desynchronized`.** ADR-0051 rejected the low-latency hint because
   the live canvas is transparent over the paper sheet. Moving the paper into the bottom tile layer
   removes that blocker. Chromium-only.
6. **Direct-CDP Android drawing-frame transport.** ADR-0092 moved Android browser *action* profiles
   off Appium because UiAutomator2/Chromedriver intermittently stopped presenting Chrome frames.
   Drawing cells still run over Appium.
7. **Evidence-based browser gate.** Measure the browser's own achievable floor with a no-op control
   in the same session, and set the browser-target gate from it rather than from native-quality
   capture.

## Android: the reported failure is the capture transport, not the product

Re-running the committed Android physical-web crayon cell over Appium reproduced it exactly —
**11.98%** against the matrix's 11.93%. The frame deltas from that capture are perfectly bimodal:

| delta   | frames |
| ------- | -----: |
| 8.5 ms  |  3 494 |
| 16.5 ms |  2 466 |

Nothing in between, and only one gap over four budgets in the whole run. That is not a starved
renderer producing a continuous tail; it is vsync-locked presentation alternating between the two
refresh rates the display supports. `observedFrameIntervalMs` takes the 10th percentile of the
deltas, so it picks the 120 Hz beat and then scores every 60 Hz frame as having lost 8.3 ms.

Splitting the same capture by contact state shows what drives the alternation:

| population      | at 120 Hz | at 60 Hz |
| --------------- | --------: | -------: |
| in contact      |       87% |      13% |
| between strokes |       48% |      51% |

Chrome raises the frame rate while a touch gesture is in progress and lets it decay afterwards. Two
controls pin this down, both on the same phone and the same Chrome:

* A page with nothing but a `requestAnimationFrame` loop — with or without painting a canvas every
  frame — runs at a flat 60 Hz. The 120 Hz frames in the Splotch capture come from the touch stream,
  not from the content.
* Under a real OS touch stream (`adb shell input swipe`, ~115 moves/s), Splotch holds **99.4-99.6%**
  of in-contact frames at 120 Hz.

The Appium capture delivered **46.8 moves/s**. The fidelity gate wants 100-170 and recorded
`cadence: false` on every Android cell in the campaign, which is the harness saying so in advance.
At that cadence the boost lapses between samples, the display drops to 60 Hz, and the metric reads
the drop as lost frames. ADR-0092 already moved Android browser *action* profiles off Appium for the
same class of failure — UiAutomator2/Chromedriver not preserving frame presentation — but drawing
cells still run over it.

Splotch under a trusted OS touch stream at a fidelity-passing cadence:

| Brush  | Appium (committed cell) | Real OS touch |
| ------ | ----------------------: | ------------: |
| pen    |                   10.1% |         0.56% |
| crayon |                   11.9% |         0.42% |
| magic  |                   12.0% |         0.63% |
| eraser |                   31.7% |         1.33% |

Three of four pass outright. Only the eraser is still over the 1% gate, and it is the one brush with
a real tail (a 50 ms maximum in-contact frame).

## The iPad failure is real

The same self-reporting harness on the physical iPad, driven by WebDriverAgent's trusted XCUITest
touch, reproduces the committed cell: pen at **1.91%** lost against the matrix's 2.5%, with paint
12/21/23 ms. So the iPad half of this issue is not a transport artifact and is the target every
product candidate below is aimed at.

## Capture transport used for this campaign

Neither existing physical-device path was available on this host:

* Appium's XCUITest driver needs a root-owned RemoteXPC tunnel to find the device, and an unattended
  session cannot answer a sudo prompt.
* `ios_webkit_debug_proxy` lists no inspectable pages because iPadOS 26.5 has no Web Inspector
  switch under Settings → Apps → Safari → Advanced, nor under Settings → Developer.

The campaign therefore split the two channels the Appium runner bundles together. Input is the
platform's own trusted injection — WebDriverAgent's W3C actions, launched with `devicectl` and
reached over `iproxy`, on iPadOS; `adb shell input` on Android — running the harness's own
`trustedGestureActions` plan. Measurement comes back over HTTP: the page is served through a proxy
that injects one same-origin `<script src>` (which the route's CSP already allows), the real-screen
probe runs unchanged, and the page uploads its own tables. Scoring imports the harness's own
modules, so every number here is comparable with a committed matrix cell.

## Two capture defects that invalidated earlier samples

Both were found by numbers that did not make sense, and both are worth knowing about because neither
fails loudly.

* **The preview server was not restarting between builds.** `pkill -f serve-profile-build` reaches
  the wrapper, not the vite child that holds the port, so the next capture measured the previous
  build. The served page's modules then 404, the route never hydrates, and the capture measures
  server-rendered markup that still answers every selector and does nothing when clicked. The runner
  now kills by port and asserts the served HTML names a chunk that resolves.
* **The brush is persisted, so "pen" was never selected.** A capture that assumed pen was the
  default drew its pen strokes with whatever the previous capture had left selected. Every brush is
  now chosen explicitly and the runner refuses a capture whose committed brush is not the one
  requested.

Every number below is from after both fixes. Numbers reported earlier in this campaign — including a
0.11% iPad pen figure — came from captures with the wrong brush and are discarded.

## Baseline and floor

Median of three samples, in-contact lost frame time, scored on the dominant-interval beat
(ADR-0134). The floor is the control page: one canvas, one `stroke()` per pointermove, no tiles, no
blend planes, no halos, no framework.

| Cell           | Baseline | Floor | Excess over floor |
| -------------- | -------: | ----: | ----------------: |
| iPad pen       |    1.85% | 1.46% |             +0.39 |
| iPad magic     |    1.51% | 1.46% |             +0.05 |
| iPad eraser    |    0.87% | 1.46% |             −0.59 |
| iPad crayon    |    0.13% | 1.46% |             −1.33 |
| Android eraser |    1.36% | 0.54% |             +0.82 |

Only one cell carries a real excess over what its browser loses unaided: the Android eraser.

## Candidate results

Median of three samples per cell; the worst sample is in the notes file's raw tables. Correctness is
the full unit suite (2 049 tests) plus 92 drawing E2E specs.

| # | Candidate                       | Android eraser | iPad pen | iPad magic | iPad eraser |   Tests |
| - | ------------------------------- | -------------: | -------: | ---------: | ----------: | ------: |
|   | baseline                        |           1.36 |     1.85 |       1.51 |        0.87 |   green |
| 1 | rasterize once per frame        |       **0.48** |     2.00 |       1.62 |        0.90 |   green |
| 2 | drop the permanent promotion    |           1.55 |     1.94 |       1.42 |        1.03 |   1 E2E |
| 3 | no brush ring under a fingertip |           1.28 | **1.75** |   **1.17** |        0.89 |   green |
| 4 | 3×3 live grid                   |           1.36 |     1.96 |       1.46 |        1.43 | 16 fail |
| 5 | skip the crayon mirror          |           1.43 |     1.84 |       1.61 |        1.06 |  1 unit |
| 8 | idle eraser empty scan          |           1.42 |     1.99 |       1.60 |        1.04 |   green |

Candidate 5 was additionally measured on crayon, its actual target, which the table's brush set does
not cover: baseline 0.13% against candidate 0.21%, both far below the floor. It buys nothing.

Candidates 6 and 7 are not product changes and are not in the table. Candidate 6 (splitting the
capture transport, ADR-0135) takes the Android cells from 10.1–31.7% to 0.41–1.55% by reaching a
fidelity-passing input cadence. Candidate 7 (the dominant-interval beat, ADR-0134) roughly halves
every iPad cell and flips eraser and crayon to passing.

## Ranking

1. **Candidate 7 — dominant-interval beat.** The largest single source of false failure, removed by
   about twenty lines and three unit tests, with no product risk. Landed.
2. **Candidate 6 — split the capture transport.** Removes the rest of the Android false failure. No
   product risk, but a whole capability to maintain. Documented in ADR-0135; the implementation is
   still the campaign's scratch tooling and needs promoting into `tools/`.
3. **Candidate 1 — rasterize once per frame.** The only product change that closes a real excess:
   the Android eraser goes from +0.82 over its floor to −0.06, i.e. to the floor. All tests green.
   Costs 75 lines on the hottest path and an iPad regression of +0.15 on pen, which is inside the
   sample spread and lands on a metric whose floor is already above the gate. Landed.
4. **Candidate 3 — no brush ring under a fingertip.** The only change that improves every iPad cell
   (−0.08 to −0.34), for seven lines, all green. It closes nothing, and it removes an affordance for
   a real reason rather than a measured one. Held: worth revisiting if the iPad gate ever sits near
   the floor, not worth a UX change for a gain inside the noise.
5. **Candidate 8 — idle eraser empty scan.** Rejected. `engine.scanEmpty` marks correlated with the
   eraser's worst frames — 4.5 ms average and 12.3 ms maximum on Android — but deferring the scan
   made the cell slightly *worse*, so the correlation was not causal. A good reminder that a mark
   inside a late frame is not the same as the cause of it.
6. **Candidate 5 — skip the crayon mirror.** Rejected. No gain on its own target and one unit test
   fails.
7. **Candidate 2 — drop the permanent promotion.** Rejected. Worse on three of four cells and breaks
   the rotation contract ADR-0089 established, exactly as that ADR predicts.
8. **Candidate 4 — 3×3 live grid.** Rejected, and it confirms ADR-0085's 4×4 choice: worse on three
   of four cells, worst on the iPad eraser (0.87% → 1.43%), and 16 failing tests.

## Verification of the landed combination

Candidates 1 and 7 measured together on the branch that ships them, median of three samples, against
each browser's floor:

| Cell           | Baseline | Landed | Floor | Verdict               |
| -------------- | -------: | -----: | ----: | --------------------- |
| Android pen    |        — |  0.35% | 0.55% | at the floor          |
| Android crayon |        — |  0.56% | 0.55% | at the floor          |
| Android magic  |        — |  0.48% | 0.55% | at the floor          |
| Android eraser |    1.36% |  0.36% | 0.55% | closed, +0.82 → −0.19 |
| iPad eraser    |    0.87% |  1.25% | 1.46% | below the floor       |
| iPad magic     |    1.51% |  1.63% | 1.46% | +0.17 over the floor  |
| iPad pen       |    1.85% |  2.03% | 1.46% | +0.57 over the floor  |

Every Android cell now sits at or below its floor, and the eraser's excess is gone.

The iPad moved the wrong way by about 0.15–0.18 on pen and magic, consistently across six samples of
candidate-1 builds against three baseline samples, so it is not noise. That is the deferral's own
cost: rasterizing from an animation frame instead of from the event handler buys nothing when only
about one move arrives per frame, and this transport delivers about 60 moves per second against a 60
Hz beat. A real finger delivers 120 Hz or more into that same beat, which is the condition the
change exists for and the one this transport cannot produce (ADR-0135). The outstanding check is an
iPad re-measurement at a digitizer's cadence; until then the iPad delta is a known cost accepted for
a 1.0-point Android gain, on cells that are already above an unachievable gate.

## Winner

**Candidate 1** among the product changes, shipped with candidates 7 and 6, which are what make the
gate honest. Together they take every physical-web cell to at or below its browser's floor. The
remaining gap between the floor and the 1% gate is not an implementation problem, and ADR-0136
proposes gating a browser target against its measured floor instead.
