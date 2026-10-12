# Native landscape action sweep: the undo tap that died after a blank rotation

Investigation trail for issue 1237 — `perf:ios:xcuitest:actions --native-app` timed out on "undo
clear after blank rotation" in both landscape modes, six attempts for six timeouts across two
campaigns, while both portrait modes passed. Resolved 2026-08-25 on the physical iPad ([redacted])
in eight instrumented device runs.

## The failing sequence

Draw → clear → rotate while blank → tap undo → expect the stroke back. In a landscape-first sweep
that undo tap happens in portrait (the blank rotation goes landscape→portrait); in a portrait-first
sweep it happens in landscape. Only the portrait-side tap died.

## Evidence chain, run by run

1. **Reproduced on current code** with the merged undo-repaint fix installed — so not already fixed.
2. **Enriched timeout dump** (probe `finish()` harvested in the catch): the tap arrived as a trusted
   `pointerup` on the button, zero canvas mutations, no engine measures, undo still enabled 30s
   later. The healthy portrait sample of the same step shows `engine.resize.tiles` → `engine.resize`
   → `engine.undo` with the deferred tile relayout flushing mid-tap — in the failing direction none
   of that ran: the handler never executed.
3. **1s settle before the tap**: still failed. The in-flight CSS transitions were the button's own
   press feedback (they track the tap, not the rotation) — timing was a red herring.
4. **Probe armed with pointerdown**: the press armed — trusted pointerdown reached the button.
5. **Per-event coordinates + live hit-test** (probe `armedEvents`): pointerdown and pointerup both
   delivered at **(39, 947)** — one pixel above the button's top edge (948) and 32px above the
   intended center (979) — geometrically hitting the panel DIV, while WebKit synthesized the **click
   inside the button** at (42, 950). iPadOS touch-target expansion had snapped the pointer stream
   onto the button; `scribbleTap`'s raw-coordinate re-hit-test at `up` vetoed the snap, and its
   detail≥1 click guard discarded the browser's fallback. Press animation, no undo.
6. **Web-side displacement query**: `scrollX/scrollY` and `visualViewport` offsets all read zero,
   and the WKWebView element rect reports the full window in both orientations — the 32px is
   invisible to every web API. The viewport log pinned it: after an in-session rotation to portrait,
   `innerHeight` is 1334 against the 1366 window (top inset), while landscape shows a 1004-vs-1024
   deficit that sits at the **bottom** (uncorrected landscape taps land true). A blanket top-side
   correction in `nativeCanvasBounds` therefore mis-aimed landscape taps — reverted; the asymmetry
   is documented in that function's comment instead.
7. **Corrected-aim run** (before the revert) moved the tap 1px *below* the button: this time the
   pointer stream missed the button entirely, but WebKit still synthesized the click dead-center on
   it — proving the browser's tap resolution arrives even when the pointer path misses.
8. **First fix attempt double-fired**: consuming the trailing click behind a `setTimeout(0)` broke
   the previously-passing "expand action drawer" step — on-device the synthesized click arrives
   **two tasks after pointerup** (+2ms), after a zero-delay timer has expired, so the drawer
   expanded on pointerup and collapsed on the click. Replaced with a bounded consume window
   (`PRESS_CLICK_CONSUME_WINDOW_MS`).

## The two product changes (`web/src/lib/actions/scribbleGuard.ts`)

* A press that never travelled beyond tap tolerance activates on the browser's targeting alone — the
  raw-coordinate re-hit-test only gates releases that actually moved.
* A detail≥1 click that no just-finished press consumes (one per press, inside the window) activates
  — it is WebKit resolving a near-miss tap to this control.

Both are pinned by unit tests in `scribbleGuard.test.ts`, including the double-fire regression.

## Verification

With the fixed build installed, the landscape-light sweep ran 200/200 samples with zero timeouts —
"undo clear after blank rotation" completes in ~230ms on every repeat (the sweep's remaining nonzero
exit is frame-P95 gates, a valid red measurement of the same class portrait reports).

## Left open

* The WKWebView 32px/20px viewport deficits after in-session rotation (top in portrait, bottom in
  landscape) mean native XCUITest taps are aimed uncorrected and currently survive via iOS
  touch-target snapping plus the scribbleTap fixes. Precise per-orientation tap aim would need the
  inset's side, which no web or element-rect API exposes.
* Whether the post-rotation 32px top inset is user-visible in the native app (the web viewport
  genuinely shrinks — launch state is full-bleed, rotated state is inset) was not investigated.

## Follow-up: issue 2212 (2026-09-23) — the offset was a product bug

The landscape sweeps failed again at "undo restored stroke after blank rotation": the second Undo
tap after the landscape→portrait rotation landed on the canvas (a brush-ring halo, no pointer event
on the button). Diagnostic sessions on the same iPad (iPadOS 26.5) answered the question left open
above.

**Geometry.** Undo's projected web rect against its XCUITest accessibility frame, under
`ios.contentInset: "always"`:

| State                       | `innerHeight` | Web rect y | Accessibility frame y |
| --------------------------- | ------------- | ---------- | --------------------- |
| Portrait at launch          | 1346          | 960        | 960                   |
| First rotation to landscape | 1024          | 936        | 936                   |
| Back to portrait            | 1314          | 928        | 960                   |
| Landscape again             | 992           | 904        | 936                   |

After the first in-session rotation the WKWebView insets its content 32px from the top in both
orientations, while every web and element-rect API still reports the full window.

**Touch targeting.** A capture-phase `pointerdown` listener recorded each native tap's `clientY` and
target along a vertical line through Clear (web rect y 122–182, drawn at screen y 154–214):

| Screen y | `clientY` | Target                                      |
| -------- | --------- | ------------------------------------------- |
| 110      | 78        | canvas                                      |
| 122–170  | 90–138    | Clear, except one `color-picker` hit at 134 |
| 182–230  | 150–198   | canvas                                      |

`clientY` was the drawn position, but WebKit resolved the target at the **un-inset** screen
position. Every control answered touches 32px above where it was drawn, so a child tapping the lower
half of a visible button drew on the canvas instead. The harness taps fell into the same gap. Aiming
the harness at the drawn control (the accessibility frame) made the Undo taps pass and moved the
failure to Clear's drag, which confirmed the mismatch.

**Fix.** `capacitor.config.json` sets `ios.contentInset` to `"never"`. The page already owns the
safe area through `viewport-fit=cover` and `env(safe-area-inset-*)` padding (ADR-0026), so the
WebView inset was also a second top gap after rotation (and a second bottom gap at launch). With the
rebuilt app, `innerHeight` reads 1366 in every state, Clear's accessibility frame equals its web
rect, and every tap in the same sweep lands on the drawn control with `clientY` equal to screen y.
`tools/mobile/ios/tests/ios-content-inset.test.mjs` pins the setting.

The action capture keeps `calibrateWebContentOffset`: after the session is ready and after every
rotation it compares Clear's accessibility frame with its projected rect, and native taps and
strokes aim at the drawn control. On the fixed app it measures zero. If the inset returns, it warns
and aims where a child would tap, so the bug fails the sweep instead of passing it.
