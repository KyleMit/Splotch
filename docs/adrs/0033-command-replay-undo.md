# ADR-0033: Command-Replay Undo (Single Baseline + Stroke Log)

**Status:** Active
**Date:** 2026-06

## Context

Undo was a stack of up to `MAX_UNDO_STACK_SIZE = 10` full-canvas `HTMLCanvasElement` snapshots (ADR-0004), each captured at `beginRender()` before a stroke group drew. ADR-0015 raised the backing store to `min(devicePixelRatio, 2)` (4× pixels), which multiplied the snapshot stack into the app's dominant memory cost: ~44 MB on a typical phone, up to ~160 MB on a 10″ tablet. ADR-0032's harness confirmed the per-gesture `drawImage(entireCanvas)` copy as a real cost on top of that.

The two pain points: (a) ten 4×-DPR rasters held in memory, and (b) a full-canvas copy on every gesture start. Both scale with viewport × DPR and are independent of how much was actually drawn — a single dot snapshots the same megabytes as a full-canvas scribble.

## Decision

Replace the snapshot stack with a **command log replayed over a single baseline raster**.

- Each stroke group (all fingers down together — one undo unit) is recorded as a `StrokeGroupCommand`: an ordered list of **rendered** ops (`dot`, `path`, or `clear`) plus the `wasEmpty` flag from before the group drew. Ops are captured at the exact granularity they were drawn — one `path` op per `strokeSmoothSegments` call, carrying the computed quadratic control/endpoint pairs — so replay reproduces bit-identical pixels (same `beginPath`/`stroke` boundaries, same compositing order). Recording the _rendered_ geometry, not raw pointer input, sidesteps the pointer-resume / coalescing / edge-swipe-deferral subtleties in the live path.
- One offscreen **baseline** raster (a `max(w,h)` square) holds the state before the oldest retained command. `undo()` = redraw the baseline, then replay the surviving log on top. (As first landed this replayed onto both the visible and virtual canvases; **ADR-0034** then removed the virtual canvas, so replay targets the visible canvas alone and resize rebuilds the same way.)
- The log is capped at `MAX_UNDO_STACK_SIZE` (kept at 10). On commit past the cap, the **oldest command folds into the baseline** — replayed once onto the baseline raster, then dropped. In-order folding keeps eraser `destination-out` ops hitting exactly the pixels they originally did.
- `clearCanvas()` is itself a `clear` command, so clearing is undoable and folds like any other.

The single shared `renderOp(targetCtx, op)` paints an op live (target = visible ctx), during fold (target = baseline), or during undo/resize replay (target = visible ctx; see ADR-0034). The baseline context inherits the round line cap/join the live stroking relies on.

## Alternatives rejected

- **Dirty-rectangle snapshots** (snapshot only each gesture's bounding box). Cheap, predictable undo and zero replay-determinism risk, but a toddler's strokes are big sweeping scribbles whose bounding box is often near-full-canvas — so the memory win evaporates exactly where it's needed. Also needs an overlay layer to capture "before" pixels without a banned mid-stroke `getImageData`.
- **Keep the full command log with no baseline** (replay from blank, unbounded undo). Memory is trivially small, but undo latency grows with total session strokes. Folding into a baseline bounds replay to ≤ K strokes at the cost of one cheap stroke-render per commit past the cap. (Periodic raster keyframes — best of both — were considered and deferred until profiling shows undo latency is a real problem.)
- **Move folding/replay off the main thread** (`OffscreenCanvas` in a worker). Folding is ~one stroke render at `pointerup`, off the draw frame; a worker round-trip on undo would cost more than it saves. Deferred unless `engine.commit`/`engine.foldBaseline`/`engine.undo` marks prove hot.

## Consequences

- **+** Undo memory drops from ten 4×-DPR snapshots to one baseline raster + a small command log (per-op kilobytes, not per-snapshot megabytes). Directly removes the dominant cost ADR-0015 flagged.
- **+** The per-gesture full-canvas snapshot copy is gone — `beginRender()` now opens a command (free) instead of copying the canvas.
- **+** Redo is a near-trivial follow-up (retain popped commands); deliberately left out of scope here.
- **−** `undo()` now replays the retained command log instead of one `drawImage`. This is a one-off cost at button-press (not per-frame), instrumented via the `engine.undo` mark. **(This cost was badly under-estimated as "up to `MAX_UNDO_STACK_SIZE` stroke renders": a command holds one op per pointermove frame, so a single long scribble accumulates thousands of ops and made undo nearly unresponsive on iPad. ADR-0035 fixes this by keyframing long commands.)**
- **−** A per-commit fold (one stroke render) runs once the log passes the cap — at `pointerup`, off the drawing frame; instrumented via `engine.foldBaseline`.
- **−** Does **not** reduce the ADR-0015 DPR fill-rate cost (~4970 ms/session raster/paint on Android): that is live stroking against the 4× backing store, independent of undo. `K = 10` is unchanged for now and can be raised cheaply once the change is validated on-device.

Supersedes the undo-snapshot mechanism in ADR-0004; updates the memory consequence in ADR-0015 and the instrumented-marks list in ADR-0032.
