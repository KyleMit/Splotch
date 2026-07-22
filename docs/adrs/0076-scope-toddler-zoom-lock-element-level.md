# ADR-0076: Scope the Toddler Zoom-Lock to Element Level (Drop `user-scalable=no`), Add Scoped Pinch-to-Enlarge in the Parent Center

**Status:** Active **Date:** 2026-07

## Context

[ADR-0041](0041-lock-viewport-zoom-for-toddlers.md) locked pinch-zoom for the **whole document** by
keeping `user-scalable=no` (and `maximum-scale=1.0`) in the viewport meta of `web/src/app.html`.
That kept the drawing surface stable for a 2-year-old — a stray pinch mid-scribble can't zoom the
page out from under them — but it carried two costs ADR-0041 accepted as a deliberate tradeoff:

* It is the **only** Lighthouse accessibility deduction (score **92, not 100**) on both form
  factors, flagged as `[user-scalable="no"]`.
* **No** part of the UI — including the adult-facing `/privacy`, `/admin`, and the Parent Center —
  can be pinch-zoomed, so a low-vision parent can't enlarge text anywhere.

ADR-0041 explicitly anticipated this revisit: it listed "scope the zoom lock to the canvas only" as
a rejected-for-now alternative and said that if the accessibility gain were later judged worth it,
"this ADR should be revisited and superseded." Two facts make the change safe now:

* **The page-wide meta is not what actually protects the canvas.** The drawing surface is already
  locked below the meta: `touch-action: none` on the drawing page's `body` (`web/src/app.css`) and
  the engine's touch `preventDefault` (`web/src/lib/drawing/engine.ts` — `cancelTouch` on
  `touchstart`/`touchmove`) veto any multi-finger gesture that lands on the canvas. `touch-action`'s
  multi-finger veto means a browser pinch proceeds only if *every* touch point sits in a region that
  allows it, so one finger on the locked canvas cancels the gesture. Both mechanisms are within the
  Chrome 111 / Safari 16.4 floor (`docs/COMPATIBILITY.md`). After removing the meta attributes they
  are the *only* lock, and the multitouch E2E already proves the canvas never zooms.
* **Lighthouse/axe flag the meta tag itself** (`user-scalable=no` *or* `maximum-scale` < 5), never
  gesture behavior — so removing the attributes is exactly what clears the audit, and the
  element-level locks neither trigger nor clear it.

The alternatives considered for *recovering zoom for parents* on the drawing page:

* **Allow browser zoom inside a Parent Center overlay only.** Rejected: browser zoom is
  visual-viewport-wide, not element-scoped, and **there is no JS API to reset it**. A parent who
  zoomed then closed the overlay would leave the *canvas* zoomed with no programmatic recovery —
  precisely the disorientation ADR-0041 guards against.
* **Pinch-zoom the canvas content as a drawing feature.** Out of scope for the 2+ audience.

## Decision

**Tier 1 — route-scoped app surface, normal documents everywhere else.** Remove `user-scalable=no`
and `maximum-scale=1.0` from the viewport meta (`web/src/app.html`), keeping
`width=device-width, initial-scale=1.0, viewport-fit=cover`. Then **invert the default**: the
drawing route is an *immersive app surface* — no scroll, no text selection, no zoom, no iOS
long-press callout — while every other route is a normal document. These locks
(`touch-action: none`, `overflow: hidden`, `user-select: none`, `-webkit-touch-callout: none`) used
to sit on `body` globally (set back when `/` was the only page); the old meta reinforced the zoom
half. That forced every other route to stay locked — `/admin` couldn't even zoom — and made
`/privacy` and `/admin` each duplicate a `position: fixed` scroll container with `user-select: text`
to claw scrolling and selection back. They are now scoped to the drawing route: `<html>` carries a
`data-app-surface` flag, and `app.css` applies all four locks under `:root[data-app-surface] body`.

* The flag is **seeded before first paint** by the `app.html` boot script
  (`location.pathname === '/'`) so the locks apply with no window where the page scrolls or the
  chrome is zoomable, and **kept correct across client-side navigation** by an `$effect` in
  `web/src/routes/+page.svelte` that sets it on mount and clears it on cleanup.
* The zoom lock covers the **whole drawing page**, not just the canvas — the button chrome uses
  `touch-action: manipulation`, which *permits* pinch, so a page-level rule is required to stop a
  two-finger gesture on the button bar from zooming. The canvas element keeps its own
  `touch-action: none` + engine `preventDefault` (`cancelTouch` on `touchstart`/`touchmove`) as a
  second layer.
* **Every non-canvas route** (`/privacy`, `/admin`, and any page added later) is now a normal
  scrollable, selectable, browser-zoomable document by default — no per-page opt-in. `/privacy` and
  `/admin` shed their `user-select: text` / `touch-action: auto` opt-outs (they keep their fixed
  scroll panels purely as layout). Adding a new page gets accessibility for free; a *new*
  canvas-bearing page would opt into the surface flag the way `/` does.

This clears the Lighthouse deduction (92 → 100 — confirmed by a category run: the `meta-viewport`
audit passes).

**Tier 2 — app-controlled zoom inside the drawing page's overlays.** Because browser zoom must stay
off on `/` (no reset API), the Parent Center gets its own zoom that resets cleanly. A new action
`web/src/lib/actions/pinchTextZoom.svelte.ts` drives CSS `zoom` on a `.pc-zoom` wrapper inside the
scrolling pane (`web/src/lib/components/ParentCenter.svelte`). Invariants:

* **One finger never engages** — a single pointer falls through to native scrolling; only a genuine
  two-finger pinch sets `zoom`. This is the key difference from the transform-based `pinchZoom`
  action (used for the fixed-size AI preview): CSS `zoom` reflows and *grows the scroll extent*, so
  enlarged text stays reachable by ordinary scrolling with no custom pan, and native momentum
  scrolling is preserved.
* **It leaves the shared `createPinchZoom` engine untouched** — that engine's clamp assumes the
  target fits its surface at scale 1, which a taller-than-viewport scroll pane violates; reusing it
  here would have broken scrolling.
* **Zoom resets to 1** whenever the overlay closes or the parent navigates to another section (the
  action's `$effect` on `enabled`/`resetKey`), so no enlarged state leaks between opens and none can
  reach the canvas.

Coverage: gesture math is unit-tested (`pinchTextZoom.svelte.test.ts`); an E2E synthesizes a
two-finger spread and asserts the pane enlarges then resets on close (`tests/parent-zoom.spec.ts`);
`tests/page.spec.ts` asserts the viewport meta carries neither attribute and `/privacy` permits
touch zoom; `tests/multitouch.spec.ts` asserts `visualViewport.scale` stays 1 after a five-pointer
spread. CSS `zoom` is registered in `docs/COMPATIBILITY.md` (above the Firefox 114 floor —
standardized in Firefox 126; below that it is a graceful no-op).

## Consequences

* `\+` The Lighthouse accessibility score reaches **100** on both form factors — the last deduction
  is gone.
* `\+` `/privacy` and `/admin` are genuinely browser-zoomable for low-vision users, and the Parent
  Center's reading content can be pinch-enlarged up to 3× inside the otherwise-locked drawing page.
* `\+` The lock is now honestly scoped and test-guarded — a route flag + the canvas's own layers —
  rather than relying on a meta attribute that iOS Safari has ignored for pinch since iOS 10 anyway.
  New non-canvas pages are accessible by default with no per-page opt-in.
* `−` The drawing page's zoom protection now rests on the `data-app-surface` route flag +
  `touch-action: none` + the engine `preventDefault`; a future edit that weakens any of them (drops
  the flag, loosens the scoped `body` rule) would remove the lock. The `page.spec.ts` inversion
  tests and the multitouch E2E are the regression guards — keep them.
* `−` The route flag is set by JS (boot script for first paint + the `/` page's effect for
  client-side nav). With JS disabled, the drawing page would not carry the flag — but the canvas's
  own `touch-action: none` + engine `preventDefault` still lock the canvas itself, and the whole app
  already requires JS to function.
* `−` Native shells (WKWebView / Android WebView) that respected the meta need a regression check;
  Capacitor webview zoom config was not audited as part of this change.
* `−` CSS `zoom` enlarges the box (it does not re-wrap text to the pane width), so a strongly
  enlarged pane can require horizontal as well as vertical scrolling — acceptable for an adult
  utility surface, and the panes were switched to `overflow: auto` to allow it.
* `−` On Firefox 114–125 the Parent Center enlarge is inert (no zoom); scrolling and everything else
  are unaffected.
