# ADR-0052: Palette Trims by Container Query; Picker Stays Viewport-Scoped

**Status:** Active
**Date:** 2026-07

## Context

The `/components` catalog wanted the two responsive color widgets — the Color Palette
(edge bar) and the hex Color Picker (full-screen modal, ADR-0048) — demoable at
arbitrary sizes, live. Both had their trim ladders written as viewport media queries,
which can't respond to a resizable demo box.

Alternatives considered:

- **Convert both to container queries.** The palette converts cleanly, but the picker
  can't own a size container: the dialog shrink-wraps its content (`width: fit-content`),
  and how many hexagons render *derives from* the query — putting `container-type: size`
  on it (or anything the picker sizes) is circular. Its only honest container is the
  viewport, and standing up a viewport-sized container on `body`/`html` drags in layout
  containment side effects (fixed-position re-anchoring, top-layer edge cases in WebKit)
  for zero behavioral gain.
- **Keep media queries and demo with screenshots.** Loses the live, draggable exploration
  and adds another generated-asset pipeline.
- **Demo both in iframes.** Works (an iframe gives a component its own viewport, so
  media queries respond to the frame), but for the palette it isolates the demo from the
  page's shared color state and passes up a real modeling improvement.

Browser floor check: size container queries are Chrome 105 / Safari 16 / Firefox 110 —
all within the floor in `docs/COMPATIBILITY.md` (Chrome 111 / Safari 16.4 / Firefox 114),
so no compatibility cost.

## Decision

Split by what each widget's room actually is:

- **ColorPalette queries its container.** `.app-container` (`web/src/app.css`) declares
  `container: splotch-app / size`, and every trim/layout rule in
  `web/src/lib/components/ColorPalette.svelte` is a
  `@container splotch-app (…)` query. In the app this is a behavior-preserving swap
  (the container is viewport-sized; `web/tests/palette-trim.spec.ts` pins every rung),
  and slightly *truer*: the palette's room is the app container — the viewport minus
  safe-area padding — so notched devices trim by real room. The `/components` catalog
  stands up a resizable stage declaring the same `splotch-app` container name.
  Invariants: the palette only renders under an ancestor with
  `container: splotch-app / size` (queries silently never match otherwise), and
  `.app-container` must not gain `position: fixed` descendants (size containment makes
  it their containing block).
- **ColorPicker keeps viewport media queries.** Its room is the whole screen by design
  — the dialog caps at `90vw`/`90vh` — so the ladders in
  `web/src/lib/components/ColorPickerContent.svelte` stay `@media`. The catalog demos
  it inside a resizable `<iframe>` (`/components/frame/picker`), which gives it a
  private viewport the visitor can drag through the ladders.

## Consequences

- + The catalog's palette stage and picker frame are live and draggable through every
  breakpoint, using the components' real CSS — no duplicated demo layouts.
- + Palette trims now key off its actual room (safe-area-adjusted), not a viewport proxy.
- + No compatibility change: container queries are within the floor
  (`docs/COMPATIBILITY.md` register entry), and below the floor the palette degrades to
  its untrimmed base layout rather than breaking.
- - Two mechanisms for one concept: future contributors must know palette = container,
  picker = viewport, and why (this ADR).
- - The palette's rendering depends on an ancestor container declaration — a new host
  that forgets `container: splotch-app / size` gets the untrimmed base layout with no
  error.
- - The iframe demo is an isolated module instance: picks inside it don't update the
  catalog page's shared color state (acceptable for a dev page, surprising if forgotten).
