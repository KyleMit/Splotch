# ADR-0068: Crayon Passes Commit as Live-Captured Rasters — the Fold Blits, It No Longer Re-Renders

**Status:** Active — amends ADR-0065 (fold architecture) and ADR-0066 (what "live equals fold" means
for crayon). **Date:** 2026-07

## Context

ADR-0066 freed brushes from bit-identical *replay* but left one determinism contract standing: the
commit fold re-rendered a stroke's recorded ops onto the paper, so the fold had to reproduce the
live pixels. Every deposit therefore had to be deterministic (no `Math.random`, no time) and
idempotent under re-render — which forecloses richer deposit models (soft fractional alpha, jittered
stamps, nondeterministic grain) and makes the fold's cost scale with the stroke's op count times the
brush's per-op render cost (heaviest for crayon: dozens of pattern fills per pass).

Alternatives considered for retiring that contract:

* **Stamp the pass into the paper at pass close** (mid-stroke paper writes). Rejected: it moves the
  undo snapshot boundary to pre-stroke and breaks clear-straddle, undo-mid-stroke, and
  deferred-restore semantics that all assume the paper only changes at commit.
* **A parallel textured-layer system** (per-stroke composited layers). Rejected in ADR-0065 already:
  it re-derives undo/eraser/export machinery the op stream gives for free.
* **Keep re-rendering and require determinism forever.** The status quo; rejected because it taxes
  every future brush for a guarantee only the fold needs — and the fold can get it more cheaply by
  reusing the pixels it already has.

## Decision

**Closed crayon passes travel as prerendered rasters (`crayonPassRaster` ops), and the fold blits
them.** Alongside the overlay preview, every live crayon op also paints into a PAPER-SPACE
accumulation buffer (`strokeOps.ts`, "Live paper-space pass accumulation"). At pass close the engine
crops that buffer's dirty rect into a standalone canvas and swaps the pass's recorded ops for one
raster op (`closeLiveCrayonPass` + `replaceOpenCrayonPassOps`); rendering it is the same two-blit
darken-min stamp a flush performs, but from pixels painted exactly once, live. The fold, repaints,
snapshot pending-replay, and export all stay a single `renderOp` walk — ordering preserved by
construction — but for crayon they **blit instead of re-render**. There is no re-render left that
must reproduce the live pixels, so future deposits are free to be nondeterministic; only the open
pass's short repaint window (mid-stroke resize, undo beneath a live stroke) still re-renders raw
ops, and `repaintAll` resets the live accumulation first (`resetLiveCrayonForReplay`) so even a
non-idempotent deposit could never double-composite there.

**Commit reconciles the visible canvas from the paper** (`blitPaperRect` per raster rect in
`commitStrokeGroup`): the two-blit stamp rounds ±1 differently for the overlay's device-rect blit
than for the cropped raster (canvas-backing-dependent premultiplied rounding) even on byte-identical
content — verified with an in-page A/B — so the reconcile makes screen == committed from commit
onward, keeping the remount/undo byte-exactness guards green. It is skipped when the fold is parked
(pending magic sheet / deferred restore), where the eventual fold's next repaint reconciles instead.

Gotchas pinned by tests or noted for the future:

* The E2E byte-exactness guards (remount, undo-restores-texture) now certify the raster + reconcile
  machinery rather than re-render determinism.
* A canvas clear also drops the open pass's buffered ink (`resetLiveCrayonPass` in `clearCanvas`) —
  a stroke straddling drag-to-clear must not resurrect wiped wax through its pass raster.
* `colorMix: 0` keeps the legacy direct-paint pipeline as the dev A/B baseline — no raster, raw ops,
  deterministic fold.
* Under a rotation-locked paper view (ADR-0050) the reconcile resamples paper→screen — believed
  equivalent to the previous next-repaint behavior, not byte-tested (the E2E byte guards run at
  identity view).

## Performance

Zero-visual-change was pinned honestly at landing: the pre-change and post-change builds were
raw-pixel-diffed across all nine capture scenes in one container — max channel Δ = 3/255 (pure stamp
rounding). In the throttled harness (`perf:undo`, iPad-Pro viewport, 4× CPU, SwiftShader —
structure, not absolute gates) the crayon scenarios hold: commit max ~975–987 ms dominated by the
ADR-0066 paper copy (~816 ms — the software renderer exaggerates full-canvas blits), `engine.draw`
avg 0.37–1.18 ms/op, undo avg 84–125 ms, history ≈ 110–120 MB analytic. The fold's own cost is now
proportional to the pass rasters it blits, not to op count × per-pass pattern fills.

One hot-path rule this work established, worth keeping: **never `drawImage` FROM a large
freshly-painted canvas on the pointer hot path** — under software rendering it forces a full
source-surface snapshot per call (measured at ~200× a pattern-fill op when a preview was briefly
implemented as per-op blits from the 2732² paper buffer). Composite small op-sized layers *onto* big
surfaces; never read big surfaces per op.

## Consequences

* \+ The determinism handcuff is retired for good: any future deposit (soft alpha, jitter,
  directional stamps) is legal, because nothing re-renders a closed pass. Only the open pass's
  repaint window re-renders, and it is allowed to differ.
* \+ Byte-exact undo/remount no longer depends on deposit behavior at all — the raster op and the
  commit reconcile carry it, for every current and future brush.
* \+ The fold stops paying per-op pattern fills for closed passes; a crayon-heavy commit folds by
  blitting.
* \+ Zero visual change, pinned at the byte level (Δ ≤ 3/255, stamp rounding).
* − Closed passes hold their pixels as canvases until commit — a long multi-pass gesture keeps one
  cropped raster per pass alive (bounded by pass bboxes; freed at commit).
* − The open pass's paper-space buffer is a third per-op paint during live drawing (identity
  transform, cheap — but real).
* − Margin ink outside a rotation-locked paper square is captured only within the paper (unchanged
  from ADR-0066's permanent-crop semantics, but the raster path re-encodes that decision).
* − A deferred commit (restore in flight / magic pending) skips the reconcile; the eventual fold's
  next repaint is assumed to heal the ±1 divergence — not byte-tested.

Amends **ADR-0065**: the commit fold no longer re-renders closed passes (the "commit fold must
reproduce the live pixels" clause narrows to the open pass's repaint window); the deposit itself —
pattern-filled path ops, binary tooth, per-pass phase-shifted seeds — is unchanged and remains the
shipped look. Amends **ADR-0066**: same narrowing on the fold side; snapshots, tiers, and the
pending-magic machinery are untouched.
