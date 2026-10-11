import type { Stroke } from './model';
import type { Brush } from './brushes';

export type InkCheckpoint = Readonly<{ id: number; strokes: readonly Stroke[]; base64: string }>;
export type InkPlan = Readonly<{
  checkpoint: InkCheckpoint | null;
  strokes: readonly Stroke[];
  prefix: readonly Stroke[];
  needsCheckpoint: boolean;
}>;
export type InkPreparation = Readonly<{
  checkpoint: InkCheckpoint;
  predecessor: InkCheckpoint | null;
  brush: Brush;
}>;

export function sameStrokes(left: readonly Stroke[], right: readonly Stroke[]): boolean {
  return left.length === right.length && left.every((stroke, index) => stroke === right[index]);
}

function prefixMatches(strokes: readonly Stroke[], prefix: readonly Stroke[]): boolean {
  return (
    prefix.length <= strokes.length && prefix.every((stroke, index) => stroke === strokes[index])
  );
}

export function inkBoundary(strokes: readonly Stroke[], index: number): boolean {
  const brush = strokes[index]?.brush;
  return (
    index > 0 && (brush === 'crayon' || brush === 'eraser') && strokes[index - 1].brush !== brush
  );
}

export function checkpointMatches(strokes: readonly Stroke[], checkpoint: InkCheckpoint): boolean {
  return (
    inkBoundary(strokes, checkpoint.strokes.length) && prefixMatches(strokes, checkpoint.strokes)
  );
}

export function needsPreparation(strokes: readonly Stroke[], brush: Brush): boolean {
  return (
    strokes.length > 0 &&
    (brush === 'crayon' || brush === 'eraser') &&
    strokes.at(-1)?.brush !== brush
  );
}

export function preparationMatches(
  strokes: readonly Stroke[],
  preparation: InkPreparation,
  predecessor: InkCheckpoint | null
): boolean {
  return (
    preparation.predecessor === predecessor &&
    prefixMatches(strokes, preparation.checkpoint.strokes)
  );
}

export function preparationWitnessed(
  strokes: readonly Stroke[],
  preparation: InkPreparation,
  predecessor: InkCheckpoint | null
): boolean {
  const index = preparation.checkpoint.strokes.length;
  return (
    preparationMatches(strokes, preparation, predecessor) &&
    inkBoundary(strokes, index) &&
    strokes[index].brush === preparation.brush
  );
}

export function planInk(strokes: readonly Stroke[], cached: InkCheckpoint | null): InkPlan {
  const checkpoint = cached && checkpointMatches(strokes, cached) ? cached : null;
  const start = checkpoint?.strokes.length ?? 0;
  for (let index = start + 1; index < strokes.length; index += 1) {
    if (inkBoundary(strokes, index))
      return {
        checkpoint,
        strokes: strokes.slice(start, index),
        prefix: strokes.slice(0, index),
        needsCheckpoint: true,
      };
  }
  return { checkpoint, strokes: strokes.slice(start), prefix: strokes, needsCheckpoint: false };
}
