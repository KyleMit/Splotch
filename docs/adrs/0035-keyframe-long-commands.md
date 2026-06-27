# ADR-0035: Keyframe Long Commands So Undo Doesn't Replay Thousands of Ops

**Status:** Active (amended by ADR-0036 — keyframing is now a safety net behind
stroke simplification, and its trigger measures *simplified* segment count, not
raw op count)
**Date:** 2026-06

## Context

ADR-0033 replaced the full-canvas undo-snapshot stack with a single baseline
raster + a log of replayable stroke ops, and ADR-0034 dropped the virtual canvas
and rebuilt the visible canvas (on undo and on resize) from that baseline + log.
Both changes cut memory and per-gesture copies, but they got the cost of `undo()`
wrong. ADR-0033 estimated undo as "up to `MAX_UNDO_STACK_SIZE` (10) stroke
renders." That under-counted by orders of magnitude.

A command is **one undo unit = all fingers down together until the last lifts**,
and `draw()` records **one `path` op per `pointermove` frame** (`recordOp`, with
no cap on `activeCommand.ops`). So a single uninterrupted scribble — exactly what
a toddler produces — accumulates **one op per frame for the whole gesture**:
hundreds to thousands of ops in *one* command. Folding doesn't help (it triggers
only past 10 *commands* and folds whole commands), so that one giant op list sits
in the log indefinitely.

`undo()` → `rebuildFromBaseline()` then replayed **every op of every retained
command** as a separate `ctx.stroke()` against the `min(devicePixelRatio, 2)` =
4×-pixel backing store (ADR-0015). On a 120 Hz ProMotion iPad a ~20 s continuous
scribble is ~1,000–2,400 individual re-strokes on the main thread at button
press. The pre-ADR-0033 code collapsed all of that into one `drawImage` blit, so
undo went from O(1) to O(total ops) — observed on-device as a nearly
unresponsive undo button. The same replay also slowed `resizeCanvas()` and
`foldOldestIntoBaseline`, but those are off the interactive path; undo is the one
the user feels.

ADR-0033 had already named the fix and deferred it: "periodic raster keyframes —
best of both — were considered and deferred until profiling shows undo latency is
a real problem." It now is.

## Decision

**Collapse any command whose op list passes a threshold into a cumulative raster
keyframe**, built once at commit (off the draw frame), and drop its ops.

- `OP_KEYFRAME_THRESHOLD` (48) — a command above this many ops is keyframed.
  Short strokes and dots stay cheap replayable ops, so the common case keeps
  ADR-0033's low memory; only long scribbles spend a raster. **(ADR-0036 re-bases
  this trigger: the constant is now `KEYFRAME_SEGMENT_THRESHOLD` (384) measured
  against a command's *simplified* segment count, so keyframing fires only for a
  pathological all-corners gesture that simplification can't thin.)**
- A command's `keyframe` is a **cumulative** square raster (same `max(w,h) ×
  renderScale` geometry as the baseline) holding the entire drawing *through that
  command*. Built via `paintStateThrough()` at commit, then `ops` is set to `[]`.
- `paintStateThrough(target, upToIndex)` is the one shared rebuild primitive:
  start from the most recent keyframe at or below `upToIndex` (blit it — it
  already contains the baseline + every command up to it), else from the
  baseline, then replay only the ops after that point. `undo()`/`resizeCanvas()`
  rebuild through this, and `maybeKeyframe()` builds new keyframes through it, so
  the cumulative invariant holds even across grows and earlier folds.
- `foldOldestIntoBaseline()` blits a folded command's keyframe straight onto the
  baseline (it *is* the cumulative state through that command) instead of
  replaying ops; a non-keyframed command still replays in order, preserving
  eraser `destination-out` correctness.

Keyframes are square cumulative snapshots of *real composited pixels* (built by
replay onto a square, not by isolating one command's pixels), so erase ops
replay correctly and off-viewport (rotated) content is preserved exactly as the
baseline path required (ADR-0034).

## Alternatives rejected

- **Revert to the full-canvas snapshot stack** (pre-ADR-0033). Makes undo O(1)
  but reinstates the ~44 MB phone / ~160 MB tablet memory cost ADR-0033 set out
  to remove, and snapshots *every* command including single dots. Keyframing
  spends a raster only on long commands, so it is strictly ≤ that memory and
  usually far less.
- **Cap ops per command by coalescing/decimating points.** Changes the rendered
  pixels (ADR-0033 records ops at exact `stroke()` granularity for bit-identical
  replay), and a decimated long stroke still replays many ops.
- **Keyframe incrementally during the gesture.** Would put the raster build on
  the draw frame. Building once at commit (`pointerup`) keeps it off the hot
  path — at the cost of a one-time replay at finger-lift for a long stroke, which
  is acceptable (no interaction is expected at that instant, and it is far
  cheaper than replaying on every undo).

## Consequences

- **+** `undo()` on a long scribble is back to ~one `drawImage` blit. Replay on
  rebuild is bounded to the ops *after* the most recent keyframe (≤ a few short
  commands), not the whole session.
- **+** Memory stays at ADR-0033 levels for the common case (no keyframes); only
  long commands allocate a square raster, bounded by the ≤10 retained commands —
  strictly better than the old snapshot-every-command stack.
- **−** A long command pays a one-time keyframe build (a replay onto a square) at
  commit, off the draw frame, instrumented via the new `engine.keyframe` mark.
- **−** One more conditional 4×-DPR surface per long command for as long as it is
  retained (dropped when it folds into the baseline).

Amends the `undo()` cost model and the deferred-keyframe note in **ADR-0033**;
builds on the baseline + rebuild-on-resize machinery of **ADR-0033**/**ADR-0034**
(`resizeCanvas` now rebuilds through the same keyframe-aware `paintStateThrough`);
adds the `engine.keyframe` mark to the **ADR-0032** profiling set.
