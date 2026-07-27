# Extract the two-blit subtractive glaze stamp shared by `flushCrayonBuffer` and `renderOp`

**Priority/category:** P2[duplication] · **Cluster:** C01 · **Triaged:** 2026-07-27 at 32394ab
**Original file(s):** `web/src/lib/drawing/strokeOps.ts:395-413` and `473-489` — pinned at SHA
f934d43 **Draft patch:** none

## Verdict

**FIX — clear winner.** Extract a tiny callback-based helper that owns only the composite-op/alpha
bracketing; leave each call site's transform and rect handling exactly where it is.

## Original finding (condensed)

The "darken at alpha 1, then source-over at alpha `1-mix`" two-blit stamp — the formula that *is*
the crayon subtractive-mix look — is written twice in `strokeOps.ts`: once in `flushCrayonBuffer`
(device-rect blit of the pass buffer) and once in `renderOp`'s `crayonPassRaster` branch
(paper-space draw of a closed pass's raster). A tuning change must be mirrored, and a missed
`globalAlpha` reset would leak state into subsequent draws.

## Why it was deferred

No deferral detail recorded in AUDIT-DEFERRED.md — the burndown likely lacked a verifier for this
finding, so there is no implementation attempt or reviewer objection on file.

## Current state of the code

Still present at HEAD, at shifted lines: `flushCrayonBuffer` stamps at `strokeOps.ts:410-415`
(inside a `save`/`setTransform(identity)`/`restore` bracket, 9-arg `drawImage` restricted to the
pass bounds), and `renderOp`'s `crayonPassRaster` branch stamps at `strokeOps.ts:578-584` (3-arg
`drawImage` in user space at `op.x/op.y`, explicit `globalAlpha = 1` reset). The mix source also
differs by design: the flush reads the *current* `getCrayonMix()`, the raster uses the mix *captured
at pass close* (`op.mix`).

Two claims in the finding need correcting:

* The duplication is **not** "a source of the ±1 rounding reconcile" in `undoHistory.ts`
  (`activeCrayonRasterRects`, lines 201-209 at HEAD). That reconcile exists because a device-rect
  blit and a cropped-raster blit round premultiplied alpha differently per canvas backing — a
  geometry/space difference. Extracting the composite/alpha bracketing changes neither blit's
  geometry, so it neither fixes nor worsens the ±1 issue. The extraction must not try to.
* A helper does not create a single source of truth for the formula: the live overlay preview
  encodes the same math a third time in CSS (`mix-blend-mode: darken` bottom layer + `1-mix` opacity
  top layer, `engine.ts:124-136`), which no TS helper can absorb. The comments already
  cross-reference all three sites.

What the helper *does* buy: one named home for the two canvas-API encodings, and a structurally
guaranteed `globalAlpha`/`globalCompositeOperation` reset at both sites.

## Options considered

1. **Callback-based helper** (winner): `stampSubtractiveGlaze(target, mix, blit)` sets the two
   composite/alpha states around a caller-supplied `drawImage` and resets alpha after. Zero geometry
   assumptions; both sites keep their own transform/rect handling; behavior-identical.
2. **Two thin variants sharing a core** (finding's alternative): a rect-blit variant and a
   positioned-draw variant. More surface for the same six lines; the variants would hard-code
   geometry the call sites express more clearly inline. Runner-up only.

## Recommendation

Add to `strokeOps.ts`, beside the pass-buffer notes:

```ts
function stampSubtractiveGlaze(
  target: CanvasRenderingContext2D,
  mix: number,
  blit: () => void,
) {
  target.globalCompositeOperation = 'darken';
  target.globalAlpha = 1;
  blit();
  target.globalCompositeOperation = 'source-over';
  target.globalAlpha = 1 - mix;
  blit();
  target.globalAlpha = 1;
}
```

Call sites become `stampSubtractiveGlaze(target, getCrayonMix(), () => target.drawImage(...))`
inside the flush's existing save/restore bracket, and
`stampSubtractiveGlaze(target, op.mix, () => target.drawImage(op.canvas, op.x, op.y))` in the raster
branch. Keep the mix arguments distinct — current mix vs captured mix is a deliberate difference,
documented at the raster branch. The trailing `globalAlpha = 1` is redundant before the flush path's
`restore()` but harmless, and it is what makes the raster path safe by construction.

Verification: `npm run test -- strokeOps` and `crayonBrush`, the crayon paths in
`web/tests/engine.spec.ts` / `flows.spec.ts`, and visual parity on `/dev/engine`. A mock-context
unit test asserting the exact composite/alpha sequence is a cheap add-on and worth including.

## Suggested next step

Re-stage in `docs/AUDIT.md` as-is with the scope above; implement together with the C01 siblings
(one strokeOps/engine touch, one PR).
