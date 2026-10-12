# ADR-0132: Recover Reset Live-Tile Contexts on Resume

**Status:** Active — amends [ADR-0085](0085-tiled-live-canvas-for-ipad-webkit.md) and
[ADR-0110](0110-single-replay-worker-canvas-context-recovery.md) **Date:** 2026-08

## Context

An Android device could resume Splotch with an apparently blank drawing surface while pointer input
and drawing audio continued. New ink appeared only as small, repeated fragments inside rectangles at
the live-tile boundaries. A second background/resume cycle usually restored normal drawing.

The production renderer from ADR-0085 divides the paper into sixteen normal-ink canvases plus two
crayon-preview canvases per tile. Each normal context renders paper coordinates through a tile-local
translation. Canvas 2D restoration resets both pixels and drawing state, so a restored context whose
translation fell back to identity accepts the right global operation but clips it against the wrong
local rectangle. That produces the photographed fragments while the independent Web Audio callback
continues normally.

A Pixel 7 Pro API 33 emulator did not trigger the reset organically across twenty ordinary resumes
and twelve resumes with Android's `COMPLETE` background memory-pressure signal. Controlled reset of
the sixteen live canvas states inside the native WebView did reproduce the device geometry: fifteen
tile translations became identity and the next stroke was split into clipped fragments.

ADR-0110 deliberately limited context-loss recovery to disposable worker canvases because the live
renderer also owns active input, undo state, and a compacted raster base. We considered extending
that worker wrapper, repainting after every resume, restoring transforms without pixels, and keeping
a second CPU-resident copy of the full paper. The worker wrapper cannot own the live renderer's
history. An unconditional repaint taxes every ordinary tab switch and native resume. Transform-only
repair leaves the drawing blank. A second full-paper copy increases the resident surface budget that
ADR-0085 and ADR-0086 deliberately bounded.

## Decision

The tiled renderer owns progressive recovery for its forty-eight live surfaces:

* `tiledRenderer.ts` listens for `contextlost` and `contextrestored` on every normal and crayon live
  canvas. A loss marks recovery pending. Restoration checks are coalesced to one animation frame and
  wait while any supported context still reports `isContextLost()`.
* Both browser `visibilitychange` re-entry and Capacitor's document-level `resume` event probe the
  normal, crayon, and retained history-base contexts. Android's Capacitor WebView can remain
  `visible` and emit no browser resize while its Activity is backgrounded, so the native signal is
  required. The canonical state is round caps and joins plus each surface's tile-local transform.
  This catches silent state resets even when the browser emits no context event.
* Recovery reacquires all normal, crayon, and history-base contexts, reapplies their baseline paint
  state and buffer bindings, restores tile-local transforms, and calls the existing full tiled
  repaint. That repaint reconstructs settled pixels from the compacted tiled raster base, retained
  vector tail, and any active command, including open crayon work. When stale geometry also requires
  a rebuild, recovery repairs context state and lets resize own the single retained-history replay.
  The live-tile transform is applied again after a direct recovery replay so recovery does not
  depend on an intermediate renderer helper preserving context state.
* A canonical renderer takes the old no-op resume path. No platform or user-agent branch is added.

The recovery guarantee is bounded by the retained history sources already owned by ADR-0085. If a
graphics failure also destroys a compacted history-base canvas's pixels, its folded prefix has no
independent source and cannot be reconstructed. Its context state is repaired so later folds retain
the correct tile-local coordinates, but this decision does not add an unbounded vector log or a
duplicate full-paper raster merely to cover pixel loss.

## Consequences

* \+ A restored or silently reset live context no longer leaves future strokes clipped into
  tile-sized fragments.
* \+ Existing drawing pixels, undo state, and an in-progress command are rebuilt through the
  renderer's established replay path instead of a second recovery implementation.
* \+ Ordinary resumes retain their cheap geometry-refresh path and incur neither a canvas wipe nor
  history replay.
* \+ Event support remains progressive: `isContextLost()` prevents premature replay where available,
  while the drawing-state probe catches reset contexts without relying on events.
* − A genuine loss that also destroys a compacted raster-history base can still lose the folded
  prefix; complete protection would require a separate resident-memory or persistence decision.
* − Recovery replays the retained history and rebuilds undo patches, so the first frame after a rare
  loss can cost more than an ordinary resume.
