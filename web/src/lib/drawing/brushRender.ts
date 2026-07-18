// Per-op renderers for the textured brushes (crayon, watercolor), dispatched
// from renderOp() in strokeOps.ts. Kept in their own module so the drawing hot
// path's brush styling is isolated and independently unit-/perf-testable.
//
// THE INVARIANT (ADR-0033): renderOp() is the single renderer every surface
// shares — live drawing, undo/resize replay, and export all paint each op
// through it. So a brush renderer here MUST be a pure function of the op's
// stored fields plus the target's current pixels: same op → same pixels, every
// time. That is what keeps undo bit-identical. Concretely:
//   - No hidden per-stroke state that live drawing has but replay doesn't.
//   - Any randomness (crayon grain, watercolor blotches) must be DERIVED
//     deterministically from the op's geometry (e.g. hash of x/y), never from
//     Math.random(), or a rebuild will differ from what the child drew.
//
// Each brush exposes one or more numbered VARIANTS. Only one is active at a
// time (`activeVariant`); the dev harness can switch it via setBrushVariant()
// so a single production build can A/B every candidate under the profiler
// (mirrors setSimplifyParams / perf:sweep). Production ships the chosen default.

import { paintOpShape, type InkOp } from './strokeOps';

export type TexturedBrush = 'crayon' | 'watercolor';

// The candidate implementation to use for each textured brush. Production
// defaults to the winner picked after profiling; the /dev harness overrides it.
const activeVariant: Record<TexturedBrush, number> = {
  crayon: 1,
  watercolor: 1,
};

// Dev/profiling seam (mirrors engine.setSimplifyParams): pin which candidate a
// brush renders with so one build can sweep every variant. Production never
// calls this.
export function setBrushVariant(brush: TexturedBrush, variant: number) {
  activeVariant[brush] = variant;
}

export function getBrushVariant(brush: TexturedBrush): number {
  return activeVariant[brush];
}

type OpRenderer = (target: CanvasRenderingContext2D, op: InkOp) => void;

// Placeholder until the crayon exploration lands: render as a solid pen stroke
// so the brush is fully wired end-to-end (selectable, recorded, replayed) while
// its texture is being designed.
function crayonV1(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  paintOpShape(target, op, op.color);
}

// Placeholder until the watercolor exploration lands (see crayonV1).
function watercolorV1(target: CanvasRenderingContext2D, op: InkOp) {
  target.globalCompositeOperation = 'source-over';
  paintOpShape(target, op, op.color);
}

const CRAYON_VARIANTS: Record<number, OpRenderer> = {
  1: crayonV1,
};

const WATERCOLOR_VARIANTS: Record<number, OpRenderer> = {
  1: watercolorV1,
};

const VARIANTS: Record<TexturedBrush, Record<number, OpRenderer>> = {
  crayon: CRAYON_VARIANTS,
  watercolor: WATERCOLOR_VARIANTS,
};

// Render one crayon/watercolor op through the currently-active variant, falling
// back to variant 1 if an unknown variant was pinned. renderOp() has already
// ruled out clear/erase/magic/pen, so this only ever sees a textured brush.
export function renderBrushOp(target: CanvasRenderingContext2D, op: InkOp, brush: TexturedBrush) {
  const table = VARIANTS[brush];
  const renderer = table[activeVariant[brush]] ?? table[1];
  renderer(target, op);
  target.globalCompositeOperation = 'source-over';
}
