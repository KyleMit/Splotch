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

## Results

Filled in as each candidate is measured.
