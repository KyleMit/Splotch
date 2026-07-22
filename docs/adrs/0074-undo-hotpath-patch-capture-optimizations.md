# ADR-0074: Undo Hot-Path Optimizations — Clustered Patches, Clear Paper Swap, Rect-Limited Undo Repaint

**Status:** Active — amends ADR-0069. **Date:** 2026-07

## Context

The 2026-07-22 draw-performance profile (`scrapbook/perf/2026-07-22-draw-profile/findings.md`,
high-DPI tablet emulation + 120 Hz undo scenarios, 4×-throttled software rendering) found that the
only >1-frame hitches left in the interaction path were exactly the corners ADR-0069 accepted:

* **Drag-to-clear**: the clear's fold region is always the full paper, so its snapshot was a 2732²
  `drawImage` copy — a 575–589 ms pointerup hitch throttled (~10 ms-scale on real hardware, but
  fixed and unavoidable per clear).
* **Spread multi-finger commits**: the patch rect is one union bbox over everything the command
  folds, so five fingers spread across the canvas degrade to a ~full-paper copy (1068 ms of a 1108
  ms commit, throttled).
* **Every undo tap repainted the full canvas**: `engine.undo` restores a *patch*, then called
  `repaintAll` — clear + whole-paper blit + full-canvas compositor damage (~5.6 M pixels at dsf 2 on
  a 13″ tablet) where a stroke-sized rect would do. On device the compositor damage is the dominant
  cost (ADR-0015), and at 120 Hz there are half as many ms per frame.

For the multi-finger case, two shapes were considered:

* **Defer the copy+fold off the pointerup task** (broadest payoff — the lift never hitches
  regardless of rect size). Rejected for now: commands with no snapshot entry yet would need new
  undo semantics (undoing an unfolded command, forcing parked folds on undo taps), interleaving with
  the existing deferred-behind-restore and magic-pending machinery — a much larger blast radius
  across the paper-chain invariants.
* **Disjoint per-cluster patch capture** (chosen): a `Snapshot` holds a list of rect+patch pairs
  instead of one. Stays entirely inside ADR-0069's containment induction — every op's padded bounds
  sit inside its cluster's rect, and the union bbox remains the worst case, never exceeded.

## Decision

Three changes in `web/src/lib/drawing/undoHistory.ts` (+ a small `engine.ts` hook):

* **Clustered multi-rect patches.** `foldRegionsForCommands` (plural; replaces
  `foldRegionForCommands`) buckets ops per stroke — a path op keys on its command index + pointer id
  (`pid`); dots and crayon pass rasters seed their own cluster — then merges intersecting clusters
  to a fixpoint, so the returned rects are disjoint and a spread five-finger drag captures five
  band-sized patches instead of one near-full-paper union. Past `PATCH_CLUSTER_CAP = 8` clusters the
  capture degenerates to the single union rect (per-patch bookkeeping stops paying for itself; no
  real gesture produces more). A `Snapshot` stores `patches: SnapshotPatch[]`; the encode/re-inflate
  tier (ADR-0066) operates per patch; `popSnapshot` decodes every demoted patch before restoring the
  whole entry (within-entry order is immaterial — the rects are disjoint), and a capture failure on
  *any* patch drops the whole entry (all patches or none — a partial capture couldn't cover the
  fold).
* **Clear captures by paper swap, not copy.** A `clear` in the fold set claims the full paper *and*
  its fold never reads the pre-fold pixels (everything before the clear is wiped; everything after
  renders onto blank), so `pushCommand` adopts the paper canvas itself as the snapshot raster and
  installs a fresh blank paper (`adoptPaperAsSnapshot`) — an O(1) swap. Two traps found by the
  profile rerun and guarded by `paperPristine`: the fold's `clearRect` on the just-created canvas
  would materialize its ~30 MB backing store *inside the pointerup* (measured ~500 ms throttled), so
  a clear folding onto a known-blank paper skips the wipe (crayon side effects preserved via
  `strokeOps.resetCrayonStateForClear`); and the surface is instead materialized by a guarded 1×1
  `clearRect` at idle, so the first post-clear stroke doesn't pay the allocation either.
* **Rect-limited undo repaint.** `popSnapshot` resolves the restored rects, and `engine.undo` blits
  just those patches (`blitPaperRect` each) instead of `repaintAll` — shrinking the per-tap work
  and, more importantly on device, the compositor damage from full-canvas to stroke-sized. The fast
  path is gated on **both sides** of the (possibly async) restore by `hasUnfoldedCommands()` — no
  pending (magic-unready), deferred (behind a restore), or active (open stroke) commands, whose
  pixels live only in the op replay — and by an identity paper view (`repaintAll` is what drops
  committed margin ink under a locked view, ADR-0050). Anything else falls back to the full
  `repaintAll`.

## Consequences

* \+ The three remaining >1-frame interaction hitches from the 2026-07-22 profile all become
  patch-sized or O(1): clear capture is a pointer swap, spread multi-finger captures scale with band
  area, undo taps damage only the restored rects.
* \+ Multi-rect capture also shrinks undo *memory* for spread gestures (five bands ≪ union bbox),
  compounding ADR-0069's patch-size win.
* − The clear swap trades the copy for a fresh ~30 MB allocation per clear. The old paper is
  retained by the snapshot stack (same retention as the copy it replaces), but allocation cost is
  now load-bearing: the `paperPristine` skip + idle warm exist solely to keep it off the interaction
  path, and a stroke landing before the idle callback still pays it (accepted — idle runs within a
  frame or two of pointerup).
* − `paperPristine` is one more piece of implicit state the fold/restore paths must maintain
  (creation/swap set it; any fold render, patch restore, or paper growth clears it). A missed clear
  site would skip a real wipe — the unit suite's clear round-trips are the guard.
* − Per-patch tier bookkeeping multiplies the async encode/decode bookkeeping (validated-blob swap,
  live-window re-checks) by the patch count. The invariant "a stacked patch always holds its canvas
  or its blob" is unchanged but now per patch, with the same tripwire.
* − Undo of a deep multi-patch entry decodes all its blobs before restoring (a `Promise.all`), so a
  five-band deep undo waits for the slowest decode — still far less data than the union bbox it
  replaces.
* − The rect-limited undo path skips `repaintAll`'s implicit full-canvas resync; it is only sound
  under the gates above, and the gating predicate (`hasUnfoldedCommands`) must be kept in lockstep
  with any new "pixels outside the paper" mechanism a future change introduces.

Amends **ADR-0069**: snapshots hold a *list* of disjoint patch rects (the single union rect is now
the degenerate/capped case); the "full-canvas only for a `clear`" capture cost becomes an O(1) swap;
and undo's repaint is rect-limited when every command is folded. The containment induction and
memory tier are unchanged. Touches **ADR-0050** (locked-view fallback) and **ADR-0015** (the
compositor-damage motivation for rect-limited repaints).
