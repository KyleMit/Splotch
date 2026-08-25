# Native landscape action sweep: the undo tap that died after a blank rotation

Investigation trail for issue 1237 — `perf:ios:xcuitest:actions --native-app` timed out on "undo
clear after blank rotation" in both landscape modes, six attempts for six timeouts across two
campaigns, while both portrait modes passed. Resolved 2026-08-25 on the physical iPad
(00008103-0006202E3CF1001E) in eight instrumented device runs.

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
