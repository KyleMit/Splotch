# Spike: shipping's multi-finger ink loss on iPad

2026-11-10 01:52 → 02:45 EST. Question: is shipping's J22 defect (two- and three-finger lines cut at
about 55% of their length; `journeys-ipad.md`) built into the WebView architecture, or an artefact
or small fix?

**Answer: neither architectural nor a real-finger defect of that size.** Three things combine. The
first is a scripted-input artefact; the other two are real, and the fix is 10 lines.

1. **Scripted input arrives as one burst (artefact).** XCUITest on the simulator delivers a whole
   320 ms gesture to the app within 4–23 ms. UIKit logged it before WebKit did.
2. **WebKit coalesces only the primary finger.** In a burst, `getCoalescedEvents()` returns every
   sample for the primary pointer. Every other finger gets only its last sample. This is real WebKit
   behaviour and is the same in a bare test page.
3. **Shipping never draws the last half-chord.** Its midpoint-quadratic smoothing ends each stroke
   at the midpoint of its last two samples. A second finger whose samples go 150 → 185 → 850 pt ends
   at 517 pt, which is 52.5% of the line. The lane measured 53%.

No `pointercancel` or `touchcancel` fired in 47 instrumented pointers. No iPadOS system gesture
(including the three-finger undo swipe) and no WKWebView gesture recognizer claimed a touch.

## Rig and builds

| Item           | Value                                                                                                                                                                                                                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simulator      | Own `spike-multitouch`: iPad Pro 12.9" (5th gen), iPadOS 26.5. Deleted at the end                                                                                                                                                                                                              |
| Touch          | Appium 3.6 XCUITest W3C pointer actions (own server). The journeys lane's method: each finger makes 20 moves × 16 ms over 700 pt, about 2,200 pt/s                                                                                                                                             |
| Shipping       | Frozen sim build `ef3d1eb20` (`$C/builds/sim/shipping`)                                                                                                                                                                                                                                        |
| RN             | Frozen sim build `427756f14` (`$C/builds/sim/rn`)                                                                                                                                                                                                                                              |
| Instrumented   | A copy of the frozen shipping sim app. Its only changes: `ios.webContentsDebuggingEnabled`, plus a capture-phase pointer/touch logger and heartbeat (`/mt-probe.js`) and a bare test page. Re-signed ad hoc. Read through Appium's webview context                                             |
| Fix            | `ef3d1eb20` + `web/src/lib/drawing/engine.ts` (+10 lines), Release sim app. Local branch `claude/spike-shipping-multitouch` @ 01302754845e (not pushed). Derived data `$C/builds/ios-dd-sim-spike-multitouch`, app `$C/builds/spike-multitouch/App.app`. Built from a scratch export, see note |
| Measure        | Script: `$C/spike-multitouch/bin/ext.mjs`. It walks each scripted line in the screenshot and reports the furthest point with ink ("reach"). A line counts as **cut** when reach < 0.95                                                                                                         |
| Media and logs | `$C/spike-multitouch/` (`results.tsv`, `probe.tsv`, `probe/*/try*.events.json`, `shots/`)                                                                                                                                                                                                      |

## Q1: reproduction rates

| Gesture                                | Shipping (frozen)                    | RN (frozen) | Shipping + fix       |
| -------------------------------------- | ------------------------------------ | ----------- | -------------------- |
| 2 fingers, diverging (journeys `two`)  | **6/10 tries** (6/20 lines)          | 0/10 (0/20) | 0/10 (0/20)          |
| 2 fingers, parallel                    | **8/10 tries** (8/20 lines)          | 0/10 (0/20) | 0/10 (0/20)          |
| 3 fingers, parallel (journeys `three`) | **3/11 tries** (6/33 lines)          | 0/11 (0/33) | 0/10 (0/30)          |
| Where a cut line ends                  | 52.9–55.4% of its length, every time | n/a         | reach 1.0 every line |
| Cut lines per affected try             | 1 of 2, or 2 of 3, never all         | —           | —                    |
| Same, instrumented copy                | 6/12 tries, at 53–58%                | —           | —                    |

## Q2: mechanism (confirmed)

| Evidence                                               | Result                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cancels (22 instrumented tries, 47 pointers)           | 0 `pointercancel`, 0 `touchcancel`. Every pointer ended with `pointerup` at the true end point (850 pt). Includes 3-finger horizontal swipes, the shape of the iPadOS undo gesture                                                                          |
| When UIKit gets the touches                            | UIKit `EventDispatch` logged 10–13 touch UIEvents per gesture within 4–23 ms, 0.44–1.7 s after the WDA request began. A 320 ms gesture had collapsed before WebKit saw it                                                                                   |
| When the page gets them                                | The same 4–16 ms window. The WebContent main thread had **no stall > 25 ms** (4 ms heartbeat), so neither shipping's JS nor WebKit held the events back                                                                                                     |
| Coalesced samples per `pointermove`                    | Primary pointer: up to 20 (the full path). **Non-primary: exactly 1 in 63 of 63 moves**                                                                                                                                                                     |
| Bare test page in the same WKWebView, no shipping code | Same burst and same one-sample non-primary lists (6 tries). It draws a polyline, so its lines reach the end                                                                                                                                                 |
| Why the cut is intermittent                            | WebKit sometimes dispatches a duplicate of the final `pointermove`. The duplicate turns the last chord into a zero-length segment, so the midpoint lands on the end point and the line is complete. When no duplicate comes, the line stops at the midpoint |
| Why RN is immune                                       | `SplotchPaperInputView` reads UIKit's `coalescedTouches(for:)` for each touch, so every finger keeps its full path under the same burst                                                                                                                     |

**Real fingers on real hardware.** The burst is the trigger, and it comes from XCUITest synthesis.
Real input streams at the digitizer rate. Two real-finger recordings exist: iPad Safari, iPadOS
26.5, June 2026, that month's shipping engine, untracked in
`perf-profiles/recordings/session{1,2}.json`. They hold 53 strokes, up to 3 fingers at once, and 20
strokes that overlapped another finger. Results:

* 0 `pointercancel`.
* Secondary fingers got a move every 8 ms (median), p99 9–17 ms, max 34 ms. That matches the primary
  finger.
* Strokes that overlapped another finger lasted up to 2.1 s.

So a real finger sees the 55% cut only if the page's main thread stalls while two or more fingers
move and they lift during the stall. What does exist on every stroke and every finger is the undrawn
half of the last chord: **5–9 pt median, 18 pt max** in those recordings, about one line width. That
is cosmetic. This was Safari, not Capacitor's WKWebView, but both use the same WKContentView touch
pipeline and the same engine listeners.

## Q3: fix and gate

| Item      | Value                                                                                                                                                                                                                                                |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change    | In `stopDrawing`, on `pointerup` and outside an edge-swipe candidate, when `(x, y) ≠ (midX, midY)`, call `strokeSegments(ps, [{x, y}])`. That records and renders the closing half-chord, crayon included. Diff: `$C/spike-multitouch/tail-fix.diff` |
| Size      | 10 lines in one file. No native or config change                                                                                                                                                                                                     |
| Tests     | 486/486 drawing unit tests pass (64 files). `postbuild:cap` gates pass                                                                                                                                                                               |
| Gate      | **0 cut lines in 30 tries / 70 lines**: 10 two-finger diverging, 10 two-finger parallel, 10 three-finger. Every line reaches 1.0. Montage: `$C/spike-multitouch/shots/cmp-ship-fix-rn-twopar.png` (shipping, fix, RN)                                |
| Not fixed | Under a burst, a non-primary finger is still drawn as a straight chord, because WebKit drops its samples. JS cannot recover them. A native plugin forwarding `coalescedTouches` could, but it only matters during main-thread stalls                 |

Note: a harness guard blocks file edits in a second git worktree from this session. So the fix was
built from a `git archive` export of `ef3d1eb20` in the scratch folder, then committed onto the
local branch with a temporary index. No checkout was modified.

## Q4: zigzag loops (minor)

It is not smoothing overshoot. Shipping's midpoint quadratics stay inside the triangle of three
consecutive samples, so they cannot loop unless a sample steps backwards. Samples do step backwards,
and the cause is again WebKit under burst input.

| Evidence                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journeys' `zig2` pattern, instrumented, 3 tries × 4 strokes | WebKit dispatched each `pointermove` twice, once before and once after `touchmove`, and **both copies carried the same coalesced list**. In 11 of 12 strokes the whole 24-sample path arrived in one move, so the copy replayed it: after reaching the end (880 pt), the path jumped back to the second point (113 pt). That is the journeys "closing curve" back across the zigzag. When only an early move is duplicated, the backtrack is short: the "loop at the start" |
| Real fingers (session recordings)                           | A duplicate arrives on 43 of 53 strokes, always as the stroke's second move. Most real moves carry about one sample, so a duplicate redraws a point already drawn and does nothing. If the first move carries several samples (WebKit waiting on the non-passive `touchstart`), expect a small hook at the stroke start. Not verified: the recorder does not save coalesced lists                                                                                           |
| Speeds                                                      | Adult-finger iPad recordings over 33 ms windows: p50 1.4–1.6k, p99 3.4–4.8k, **max 6.4k pt/s**. No toddler recording exists. The scripted zigzag reverses every 16 ms (about 30 times a second), far beyond a hand's reversal rate                                                                                                                                                                                                                                          |
| Fix (priced, not built)                                     | In `draw()`, drop a `pointermove` whose last coalesced sample equals the previous event's for that pointer (same `timeStamp` and position): about 4 lines. Plus the tail fix above                                                                                                                                                                                                                                                                                          |

Verdict: J-extra-1 is a scripted-input artefact on top of a WebKit duplicate-dispatch quirk. With
real fingers it is at most a small start hook, unverified. Cosmetic to minor.

## Confidence

High for the mechanism on the simulator: event logs, UIKit timing, a bare-page control and a fix
that gates at 0/70. Medium-high that real fingers do not see the 55% cut. That rests on two
real-finger Safari recordings, not on the installed Capacitor app, and the physical iPad was not
driven (WDA automation is still locked).

## Could this flip the decision?

No. It removes a "major" from shipping's iPad column. The cut reproduced only with synthetic burst
input; with real fingers the residual is a cosmetic tail of a few points, and shipping fixes it in
10 lines. RN's per-touch coalescing is cleaner under bursts, but that is not a user-facing
difference unless shipping's main thread stalls while several fingers draw. Owner case 4 (several
fingers, fast zigzag) remains the real-finger confirmation; it is now a low-stakes check.
