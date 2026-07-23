# ADR-0069: Undo Snapshots Shrink to Dirty-Rect Patches of the Fold Region

**Status:** Active — amends ADR-0066; the on-device perf gates it inherits from ADR-0066 remain
pending. Amended by ADR-0074 (clustered multi-rect patches, clear paper swap, rect-limited undo
repaint). **Date:** 2026-07

## Context

ADR-0066 made the committed drawing a raster (the "paper") with a bounded stack of pre-stroke
snapshots, tiered as `MAX_HOT_RASTERS = 2` hot rasters + lossless blobs. It shipped with two open
costs, both proportional to the full canvas rather than to the stroke being committed:

* **Every commit copied the entire paper** — one full-canvas `drawImage` at pointerup
  (`engine.snapshot`), the reinstated cost ADR-0066 itself flagged as the open device gate, with
  "pooling the copy canvas" and `createImageBitmap` listed as follow-ups if it dropped frames.
* **Each hot snapshot pinned a full paper raster** (~30 MB at 2× DPR on a 13″ iPad), and each cold
  demotion encoded the whole canvas even when one small mark had changed.

Almost every commit mutates only a small part of the paper: a dot, a short line, one scribble band.
A full-canvas capture stores mostly pixels that did not change.

ADR-0066 (echoing ADR-0033) rejected "dirty-rect snapshots" with the argument that toddler scribbles
have near-full-canvas bounding boxes exactly when it matters. That rejection was aimed at dirty
rects as the memory *bound* — a guarantee they indeed cannot provide, since one canvas-spanning
scribble degenerates to a full snapshot. It does not apply to dirty rects as an *optimization
layered under the existing tier*: a patch is never larger than the full copy it replaces, so the
worst case is exactly ADR-0066's design (whose depth cap and blob tier remain the actual bound)
while the typical commit shrinks by one to two orders of magnitude.

Alternatives considered:

* **Pixel diff of the changed region** (capture the whole post-stroke canvas, store only pixels that
  differ). Requires `getImageData` readback of both the before and after canvases plus a CPU compare
  on the pointerup path — replacing one GPU-side blit with two full-canvas readbacks and a per-pixel
  loop, i.e. strictly slower than the copy it tries to optimize, and it forfeits the GPU-resident
  restore blit. Rejected.
* **Compressed full snapshots only** (drop the hot tier, encode everything). Deep undo already
  decodes blobs; making *every* undo decode would turn the common instant undo into an async decode
  — the exact UX the `MAX_HOT_RASTERS` window exists to protect. Rejected.
* **Return to command replay** for small strokes. Re-opens the replay-determinism contract ADR-0066
  just retired. Rejected.

## Decision

**A snapshot captures only the paper region its commit's fold is about to mutate.**
`web/src/lib/drawing/undoHistory.ts`:

* **The fold set is decided once, up front** (`foldableCount` over `[...pendingCommands, cmd]` — the
  prefix not blocked by the unready magic sheet), and `foldPendingIntoPaper(count)` folds exactly
  that prefix. Capture and fold must agree on which commands render, or the patch would not cover
  the mutation.
* **The patch rect** (`foldRegionForCommands`) is the union of every folding op's padded geometric
  bounds, clamped to the paper and floored/ceiled to whole pixels so capture and restore are exact
  1:1 blits: a path is bounded by its start + quadratic control/end points (control points bound the
  curve's hull) padded by `lineWidth / 2 + 2`; a dot by `radius + 2`; a `crayonPassRaster`
  (ADR-0068's live-captured closed pass) by exactly its raster's rect at its paper position, plus
  the AA pad; a `clear` short-circuits to the full paper; a `crayonFlush` contributes nothing (its
  stamp is bounded by the pass's crayon ops, whose padding matches `unionCrayonBounds` in
  `strokeOps.ts` — the same `+2` AA convention).
* **A null rect is a zero-cost snapshot**: a wholly magic-blocked commit, or ink entirely outside
  the paper square (margin ink, clipped at fold per ADR-0050), never touches the paper — the entry
  stores no pixels and its undo just reinstates the captured pending set.
* **Undo restores by patch blit** (`restorePatch`): `clearRect(rect)` + `drawImage(patch)`.
  Correctness is inductive over the LIFO stack: every paper mutation is either a fold (covered by
  its own snapshot's rect) or a restore (an inverse), so when an entry is popped, all pixels outside
  its rect already equal the pre-stroke state, and the blit reverts the rest byte-exactly. Two
  existing invariants carry the proof: paper mutations serialize through the engine's
  `queuePaperStep` chain (no interleaved restores), and paper *growth* (`ensurePaperCovers`)
  preserves origin and content, so a pre-growth rect stays valid.
* **The memory tier is unchanged** — `MAX_HOT_RASTERS = 2` hot rasters, cold entries demoted to
  lossless WebP/PNG blobs, re-inflation on rise — it just operates on patch-sized canvases and
  correspondingly smaller, faster encodes.
* **The debug seam** (`getHistoryDebug` / `getUndoDebug`) gains `rasterBytes`, the hot patches'
  actual `w × h × 4` cost; the perf harnesses (`scripts/perf/undo-scenarios.mjs`,
  `scripts/perf/ipad-console-driver.js`) report it instead of assuming `liveRasters` full-size
  rasters.

**New invariant — rect must contain the ink:** `renderOp` may not paint outside an op's padded
geometric bounds. Any future brush whose marks can exceed `lineWidth / 2 + 2` of its recorded
geometry (shadow/glow, blur filters, jitter beyond the pad, a crayon pass with `widthScale > 1`)
must widen `foldRegionForCommands`' padding in the same change, or undo silently stops being
byte-exact just outside the patch. The crayon's pass-buffer bounds (`unionCrayonBounds`) use the
identical pad, which keeps the two in lockstep today — and ADR-0068's raster ops make the crayon's
common case exact by construction: a closed pass's stamp is its raster's rect, no estimate needed. A
new op *kind* must be added to `foldRegionForCommands` explicitly (the TypeScript narrowing there
makes an unhandled kind a compile error, which is the intended tripwire).

## Consequences

* \+ The pointerup capture cost (`engine.snapshot`, ADR-0066's open device gate) drops from a
  full-canvas `drawImage` to a stroke-sized one for every commit except `clear`; the pooling /
  `createImageBitmap` follow-ups ADR-0066 queued up are likely moot.
* \+ Hot-tier memory drops from `MAX_HOT_RASTERS` full rasters (~60 MB on the biggest iPad) to two
  stroke-sized patches — typically well under a megabyte each; a session's worst case is bounded by
  the same tier as before and is never worse than ADR-0066.
* \+ Cold-tier encodes get smaller and faster (patch-sized `toBlob`), which matters most on WebKit,
  where the PNG fallback made full-canvas encode cost the open question.
* \+ Magic-blocked commits and off-paper margin strokes now cost zero snapshot pixels (previously a
  full paper copy each).
* − A `clear` and a genuinely canvas-spanning scribble still capture the full paper — dirty rects
  optimize the typical case, they do not improve the bound (this is why ADR-0066's depth cap and
  blob tier stay).
* − Byte-exact undo now depends on the containment invariant above; it is enforced by convention +
  the crayon byte-exactness E2E spec, not by the type system. The rect math also
  double-conservatively includes control points that a flat curve never reaches — patches can be
  somewhat larger than the ink's true bounds.
* − Restore correctness is order-dependent (LIFO + serialized paper chain) where a full-canvas blit
  was order-forgiving: an out-of-order restore that was previously "last write wins, still a valid
  state" would now corrupt the paper. The engine's `queuePaperStep` chain already guarantees the
  ordering; this ADR makes it load-bearing.
* − The induction also assumes every fold pushed its entry. The one path that violates it — patch
  context creation fails at capture (`pushCommand` still folds, pushes nothing) — degrades
  differently than before: that fold's ink outside lower entries' rects now survives deeper undos,
  where a lower full-paper restore used to wipe it. Accepted: the failure is vanishingly rare
  (canvas context creation under memory pressure), and keeping a child's stroke while losing its
  undo step beats deleting ink.

Amends **ADR-0066**: commit capture and snapshot storage become patch-sized; the "dirty-rect
snapshots" rejection is narrowed to "dirty rects as the memory bound"; the `engine.snapshot` mark
now measures the patch capture. Touches **ADR-0050**: margin ink's clipped-at-fold behavior is what
licenses the null-rect zero-cost snapshot.
