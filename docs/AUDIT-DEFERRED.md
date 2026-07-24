# Audit — deferred findings

> Findings the scripted audit burndown (the `burn-down-audits` skill) moved aside instead of
> fixing — the verifier was unavailable, the implementation failed, or the change never passed
> adversarial review. Each needs human triage: re-stage it in `docs/AUDIT.md`, file it as an
> issue, or drop it.

### [P2][duplication] Extract the two-blit subtractive glaze stamp shared by `flushCrayonBuffer` and `renderOp`

**File(s):** `web/src/lib/drawing/strokeOps.ts:395-413` and `473-489` — pinned at SHA f934d43

#### Problem

The exact "darken at alpha 1, then source-over at alpha `1-mix`" stamp is written twice:

```ts
// flushCrayonBuffer (399-410)
target.globalCompositeOperation = 'darken';
target.globalAlpha = 1;
target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);
target.globalCompositeOperation = 'source-over';
target.globalAlpha = 1 - getCrayonMix();
target.drawImage(buf.ctx.canvas, b.x0, b.y0, w, h, b.x0, b.y0, w, h);

// renderOp crayonPassRaster (482-488)
target.globalCompositeOperation = 'darken';
target.globalAlpha = 1;
target.drawImage(op.canvas, op.x, op.y);
target.globalCompositeOperation = 'source-over';
target.globalAlpha = 1 - op.mix;
target.drawImage(op.canvas, op.x, op.y);
```

This subtractive-mix formula is the crux of the crayon look (per the long pass-buffer note). Having
it in two places means a fix or tuning must be mirrored, and the two already differ subtly
(device-rect blit vs paper-space draw) — a source of the ±1 rounding reconcile documented in
`undoHistory.ts`.

#### Proposed solution

```ts
function stampGlaze(
  target: CanvasRenderingContext2D,
  source: CanvasImageSource,
  mix: number,
  draw: () => void,
);
```

or simpler, two thin variants sharing a core that sets the two composite/alpha states around a
caller-supplied `drawImage`. Both call sites reduce to one line each and `globalAlpha` is guaranteed
reset.

#### Verification

`npm run test -- crayonBrush` plus the crayon commit/undo E2E; visual parity on `/dev/engine`. A
unit test can assert the composite-op/alpha sequence via a mock 2D context.

---
