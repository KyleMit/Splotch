# ADR-0041: Lock Viewport Pinch-Zoom (`user-scalable=no`) for a Toddler Drawing App

**Status:** Active **Date:** 2026-07

## Context

The viewport meta tag in `web/src/app.html` disables pinch-zoom across the whole page:

```
content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"
```

`user-scalable=no` (reinforced by `maximum-scale=1.0`) is the **only** accessibility deduction in
the Lighthouse audit — it scores **92, not 100**, on both the phone (portrait) and tablet
(landscape) form factors, flagged as `[user-scalable="no"]` blocking browser zoom. Nothing else on
the page is docked.

This is deliberate, and the app's audience is the reason:

* **The whole viewport is a drawing surface.** Splotch is for children aged 2+, and the primary
  interaction is dragging fingers across the canvas. A pinch or spread gesture that reached the
  browser would zoom the *page* instead of drawing on it, fighting the canvas the child is actively
  using. Multi-finger contact during scribbling is common, not exceptional, for a toddler.
* **An accidental zoom is disorienting, not a feature.** If a stray two-finger gesture zoomed the
  page, the drawing surface would end up panned/scaled away from where the child expects it, with no
  way for a 2-year-old to reset it. For this audience a locked, predictable viewport is safer than a
  zoomable one.
* **It matches the app's full-screen, native-like intent.** The page already opts into
  `apple-mobile-web-app-capable` / `mobile-web-app-capable` and ships as a PWA and a Capacitor
  native app; a non-zooming, app-like viewport is consistent with that framing.

## Decision

Keep `user-scalable=no` (and `maximum-scale=1.0`) in the page-wide viewport meta, locking pinch-zoom
for the entire document, and **accept the resulting Lighthouse accessibility score of 92**. A code
comment in `web/src/app.html` records the rationale next to the tag and points back to this ADR.

### Rejected alternative: scope the zoom lock to the canvas only

The obvious way to recover the accessibility point is to remove `user-scalable=no` from the viewport
and instead suppress zoom gestures only on the canvas element (e.g. `touch-action` on the canvas,
per-element gesture handling), leaving the rest of the UI — the Parent Center, setup instructions,
and other parent-facing chrome — pinch-zoomable for low-vision users.

This is a reasonable future direction but is **out of scope as an autonomous change** because it is
a product/UX decision, not a mechanical fix:

* It changes real behavior for parents and children, and would need design review and testing across
  the drawing surface, the action controls, and the Parent Center.
* The parent-facing text is intentionally minimal and already large; the added complexity of a mixed
  zoomable/non-zoomable page has to earn its keep.

If the accessibility gain is later judged worth it, this ADR should be revisited and superseded with
the canvas-scoped approach and its UX decision recorded.

## Consequences

* **+** The drawing surface stays stable and predictable for toddlers — no accidental page zoom
  fighting the canvas mid-stroke, consistent with the full-screen PWA/native framing.
* **+** The one remaining accessibility deduction is now a documented, deliberate tradeoff (this
  ADR + the comment in `app.html`), not an unexplained lint finding, so a future contributor won't
  "fix" it without understanding the cost.
* **−** The Lighthouse accessibility score is capped at **92** on both form factors, and low-vision
  users cannot pinch-zoom any part of the UI (including the parent-facing chrome) to enlarge text.
* **−** The zoom lock is page-wide rather than scoped to the canvas; recovering the point later
  requires the canvas-scoped approach above, which is a deliberate UX decision, not a drop-in
  change.
