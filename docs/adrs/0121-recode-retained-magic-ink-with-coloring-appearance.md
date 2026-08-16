# ADR-0121: Recode Retained Magic Ink with the Coloring Appearance

**Status:** Active — amends [ADR-0043](0043-magic-brush-color-sheet-reveal.md),
[ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md),
[ADR-0086](0086-tiled-dirty-region-snapshots-for-frame-bounded-undo.md),
[ADR-0087](0087-frame-bound-theme-switch-on-ipad-webkit.md), and
[ADR-0091](0091-alpha-overlays-and-worker-magic-sheets.md) **Date:** 2026-08

## Context

Magic operations captured an immutable color-sheet snapshot when first painted. That made a settled
stroke cheap to replay and let a theme switch skip drawing-history mutation, which was part of
ADR-0087's physical-iPad performance fix. It also meant the stroke kept colors from the old page
after the child selected a different coloring page, and kept light colors after the parent selected
the dark theme.

Changing only the undoable vector tail would leave older magic ink unchanged because ADR-0085 folds
commands outside the undo window into raster history. Keeping the whole session as vector commands
would make the normal renderer's memory and replay cost unbounded. Reintroducing a separate magic
mask was also rejected: ADR-0043 chose shared draw-order operations so later pen/crayon ink and the
eraser affect magic pixels without parallel compositing machinery.

Page selection also crosses the drawing-state boundary. Recoloring the pixels without making the
page change an undo unit would let Undo restore neither the previous page nor the colors those
strokes had under it.

## Decision

The active coloring appearance owns the colors of every visible magic stroke:

* `MagicSheetSnapshot` carries its source URL. When `magicBrush.ts` publishes a decoded light,
  night, or rainbow sheet, `engine.ts` reduces page siblings to their shared composition key and
  asks `tiledRenderer.ts` to rebind every retained magic op to that snapshot.
* Settled history remains raster-first. When the first magic command crosses the undo boundary, the
  renderer copies the raster base immediately before that command and retains a vector replay tail
  from that magic command forward. A recode rebuilds the base from that checkpoint plus the tail. A
  folded clear discards both because no earlier pixel can contribute afterward.
* A page change with retained magic ink pushes one empty drawing command before the new sheet is
  ready. It captures the visible tile pixels, the previous sheet reference for each recoded op, and
  a callback that restores the prior page/orientation. Undo restores those three pieces as one
  action. Repainting for the page change preserves every older undo patch through that command;
  commands drawn afterward rebuild patches against the new colors.
* A theme change recodes the same operations but does not add an undo command. Theme remains a
  setting rather than a drawing action, so the renderer rebuilds ordinary undo patches against the
  new themed colors.
* Recorded magic ops keep their captured snapshot while the incoming page/theme overlay decodes, so
  settled ink never flashes the blank-page rainbow mid-transition. The live sheet is reserved for
  the incoming page as soon as the child selects it, so a stroke drawn during the decode window
  reveals nothing until the replacement sheet lands and recodes it, rather than sampling the page
  the child just replaced. A bounded fallback starts the fill independently if the overlay decode
  never settles.

The replay baseline and page-recode command exist only after magic ink exists. Page changes on a
pen/crayon-only drawing keep the prior behavior and do not consume undo depth.

## Consequences

* \+ Page and theme changes recolor all retained magic ink, including strokes already folded out of
  the undo window.
* \+ One Undo immediately after a page change restores both the previous coloring page and its exact
  magic-stroke pixels.
* \+ Pen/crayon/eraser ordering remains the shared operation order from ADR-0043; no second visible
  mask or provenance layer is introduced.
* − Once magic ink folds, history retains one additional paper-sized raster plus the vector commands
  from the earliest still-contributing folded magic command through the latest folded command. A
  folded clear releases that cost.
* − Recoloring replays the retained magic tail and the undoable command window. The former ADR-0087
  rule deliberately avoided that work, so the theme and coloring-page action gates require renewed
  physical-iPad measurement before treating their previous timing figures as current.
* − A magic stroke created while replacement page art decodes is retained but invisible until its
  fill sheet is ready. The bounded fallback keeps a hung overlay request from disabling the brush
  for the rest of the session, at the cost of eventually starting the fill transfer independently.
* − Undo restoration owns a narrow callback from drawing history back to coloring-page state. New
  non-drawing appearance changes must not reuse that hook unless the product explicitly defines them
  as drawing undo units.
