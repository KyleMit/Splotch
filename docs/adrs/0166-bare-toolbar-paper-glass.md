# ADR-0166: Bare Toolbar Uses Paper Glass over the Drawing

**Status:** Active **Date:** 2026-09

## Context

The Bare toolbar handoff removes action cards and the opaque palette band while retaining existing
controls, responsive trimming, and gestures. Icons need to remain readable when strokes pass beneath
them. Leaving ink unmodified makes controls hard to distinguish; clipping drawing out of the toolbar
would change the drawing interaction; separately blurring each control would compound tint where
regions overlap.

## Decision

Offer Buttons (default) and Bare under Appearance. Persist the choice in `settings.svelte.ts` and
seed `data-toolbar` in `app.html` before paint. The template hash and boot tests guard that
boundary.

Bare makes the canvas full width behind the pointer-intercepting palette. The drawing route changes
the style through `updateDrawingLayout`: an occupied paper keeps its dimensions and view scale, and
the view translation compensates for the canvas origin moving. Ink, coloring art, and magic fill
remain aligned at the same screen positions in either direction. An empty paper adopts the new
viewport; clearing releases the lock through the existing ADR-0050 path. Keeping the canvas box
identical in both styles was rejected because it would change the default Buttons drawing area.

`glassPanes.ts` derives the action strip and open flyout rectangles from the existing button layout,
visible controls, viewport, and safe areas. A single SVG union mask feathers each pane; menu
geometry changes with the state rather than sampling animated DOM bounds. There are no drawing-loop
DOM measurements. The compact L, gear, and supported fullscreen control share one pane. The other
layouts have a separate gear pane. `BareToolbarPaper.svelte` owns the rail, fullscreen glass, and
two fiber-textured margin passes. Positive feature queries enable translucent glass with either
backdrop-filter spelling; reduced transparency and unsupported backdrop filtering use opaque paper
in the same shapes. Dynamic masks pass through CSS variables so the build emits browser-floor
prefixes. Pointer halos sit above glass, and CSS hides panes whose recorded orientation differs from
the viewport during rotation settling.

The existing tokens own control stacking and colors; the glass strengths and margin inks are added
to the generated design vocabulary. Existing hit sizes, trim ladders, clear gestures, and flyout
animations remain in force. Browser tests compare generated masks with rendered flyout bounds across
layouts, themes, and button scales.

## Consequences

* \+ Parents can choose a quieter toolbar without changing the default experience.
* \+ One mask per pane avoids repeated tint over intersecting strip and flyout regions.
* \+ Existing canvas resize and paper preservation rules also govern appearance changes.
* − Backdrop filtering adds compositor work while ink moves underneath the controls. Physical-device
  performance has not been characterized for this opt-in appearance.
* − CSS positioning and mask geometry must agree; browser coverage is required when either changes.
