import { drawingPaper, paperSize, paperView, semanticWidth } from './paperSpace';
import type { UndoGhost } from './undoFeedback';
export { UNDO_GHOST_MS } from './undoFeedback';
import { smoothStroke, type Stroke } from './model';

// Shipping geometry imports web-only types; native-polaroid-flight.test.mjs pins this boundary copy.
export const UNDO_GHOST_AA_PAD_PX = 2;
export const UNDO_GHOST_SCALE = 0.72;
export const UNDO_GHOST_DRIFT_FRACTION = 0.28;
export const UNDO_GHOST_EASE = [0.22, 1, 0.36, 1] as const;
export type GhostBounds = Readonly<{ left: number; top: number; width: number; height: number }>;

function motionPoints(stroke: Stroke) {
  if (stroke.points.length <= 1) return stroke.points;
  const { start, segments } = smoothStroke(stroke.points);
  return [
    start,
    ...segments.flatMap(({ cx, cy, x, y }) => [
      { x: cx, y: cy },
      { x, y },
    ]),
  ];
}

export function undoGhostBounds(
  feedback: UndoGhost,
  size: { width: number; height: number },
  density: number
): GhostBounds | null {
  const strokes = undoGhostStrokes(feedback);
  if (!strokes.length || size.width <= 0 || size.height <= 0) return null;
  const paper = drawingPaper(feedback.before);
  const view = paperView(size.width, size.height, paperSize(paper));
  let left = size.width,
    top = size.height,
    right = 0,
    bottom = 0;
  for (const stroke of strokes) {
    const pad =
      (semanticWidth(stroke.width, paper) * view.scale) / 2 + UNDO_GHOST_AA_PAD_PX / density;
    for (const point of motionPoints(stroke)) {
      const x = view.left + point.x * view.scale,
        y = view.top + point.y * view.scale;
      left = Math.min(left, x - pad);
      top = Math.min(top, y - pad);
      right = Math.max(right, x + pad);
      bottom = Math.max(bottom, y + pad);
    }
  }
  left = Math.max(0, Math.floor(left));
  top = Math.max(0, Math.floor(top));
  right = Math.min(size.width, Math.ceil(right));
  bottom = Math.min(size.height, Math.ceil(bottom));
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : null;
}

export function undoGhostStrokes(feedback: UndoGhost) {
  const { before, after } = feedback;
  if (
    feedback.reduced ||
    before.pageId !== after.pageId ||
    after.strokes.length >= before.strokes.length ||
    !after.strokes.every((stroke, index) => before.strokes[index] === stroke)
  )
    return [];
  const removed = before.strokes.slice(after.strokes.length);
  return removed.some((stroke) => stroke.brush === 'eraser') ? [] : removed;
}
