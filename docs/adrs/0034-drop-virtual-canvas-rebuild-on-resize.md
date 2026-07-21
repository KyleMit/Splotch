# ADR-0034: Drop the Virtual Canvas — Rebuild on Resize from the Baseline + Log

**Status:** Active — the decision (no virtual canvas; resize rebuilds from retained history)
survives ADR-0066's reversal of ADR-0033; the rebuild is now one blit of the paper raster
(`repaintAll`) instead of a baseline + command-log replay. **Date:** 2026-06

## Context

The engine kept a second offscreen square surface, the **virtual canvas** (ADR-0004): a
`max(w,h) × renderScale` mirror of the drawing whose only job was preserving off-screen pixels
across rotation/resize. `resizeCanvas()` repainted the resized visible canvas from it.

To stay current, the virtual canvas was re-synced on **every** `stopDrawing` (and
`releaseAllPointers`): `syncVirtualCanvas()` ran a `clearRect` + `drawImage(wholeCanvas)` at up to
4× pixels (ADR-0015's `min(devicePixelRatio, 2)` backing store) — a full-canvas raster per stroke.
ADR-0015 flagged this fill-rate / battery cost and the ADR-0032 harness confirmed it (`drawImage`
self-time, the `engine.resize` row's "virtual-canvas copy").

ADR-0033 then replaced the snapshot undo stack with a single **baseline** raster (folded history)
plus a **command log** of the last ≤`MAX_UNDO_STACK_SIZE` stroke groups. That log + baseline already
retain the entire picture — including content that has rotated off the current viewport. The virtual
canvas became a redundant mirror of information the undo machinery was already keeping.

## Decision

**Delete the virtual canvas.** Reconstruct content on demand at resize from the ADR-0033 baseline +
command log instead of mirroring it on every stroke.

* The `baselineCanvas` stays the off-screen source of truth: still a square
  (`max(w,h) × renderScale`) that grows with the viewport, so rotation never loses pixels.
* `syncVirtualCanvas()` and its per-stroke call sites are gone. `stopDrawing` / `releaseAllPointers`
  no longer copy the canvas; an erase stroke still re-scans emptiness off the visible canvas as
  before.
* `resizeCanvas()` sizes/grows the baseline directly, rebuilds the backing store, and calls
  `replayAll()` (baseline `drawImage` + replay the log; named `rebuildFromBaseline()` before the
  history logic moved to `undoHistory.ts`) to repaint — replacing the old
  `drawImage(virtualCanvas)`.
* `replayAll(target)` paints onto the given surface (the visible canvas on resize/undo; export
  snapshots reuse it), and additionally replays the uncommitted `activeCommand` last. This covers a
  **mid-stroke resize**: an in-flight stroke's ops are recorded in `activeCommand` but not yet in
  the log, so a pure baseline+log rebuild would drop the live stroke (the old `syncVirtualCanvas`
  covered this implicitly by copying live pixels). Between strokes `activeCommand` is null, so
  `undo()`'s rebuild is unaffected.

Replayed ops use the same square canvas-pixel coordinates the snapshot/virtual path did, so rotation
coordinate handling is unchanged: off-viewport pixels are clipped from the visible canvas but remain
in the baseline + log for the next resize.

## Alternatives rejected

* **Keep the virtual canvas but stop syncing per-stroke** (rebuild it lazily in `resizeCanvas` via
  replay). A smaller diff, but it retains a whole offscreen 4×-DPR surface and an extra replay
  target purely to mirror state the baseline + log already hold — the surface earns nothing once
  resize rebuilds from the log anyway.
* **Commit the active command on resize** instead of replaying it. Would finalize an in-flight
  stroke as an undo unit mid-gesture (and split it from its later segments), changing undo
  granularity. Replaying `activeCommand` keeps the whole stroke one unit.

## Consequences

* **+** The per-stroke full-canvas copy is gone — the dominant remaining per-gesture raster
  ADR-0015/0032 flagged. No `drawImage(wholeCanvas)` on `stopDrawing`.
* **+** One fewer offscreen 4×-DPR surface allocated for the session.
* **−** `resizeCanvas()` now replays the baseline + log instead of one `drawImage`. This is a
  one-off cost on actual resize/rotation — off the drawing frame — matching `undo()`'s replay
  profile, and is instrumented via the `engine.resize` mark. (Like `undo()`, this replay is bounded
  by **ADR-0035**, which keyframes long commands so a giant scribble doesn't re-stroke thousands of
  ops on every rebuild.)

Supersedes the virtual-canvas composite buffer described in **ADR-0004**; updates the
surviving-surfaces note in **ADR-0015** (the live backing store + baseline are now the only 4×-DPR
surfaces) and the `engine.resize` / `drawImage` rows in the ADR-0032 profiling notes. Builds
directly on **ADR-0033**. **ADR-0050** later amends the "rotation coordinate handling is unchanged"
note above: a rotation with ink on the canvas now locks the op coordinate space (the "paper") and
presents it through a view transform instead of clipping off-viewport content; this ADR's
rebuild-from-baseline machinery is unchanged underneath it.
