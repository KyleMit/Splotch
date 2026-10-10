import type { Stroke } from './model';

export type InkCheckpoint = Readonly<{ id: number; strokes: readonly Stroke[]; base64: string }>;
export type InkPlan = Readonly<{
  checkpoint: InkCheckpoint | null;
  strokes: readonly Stroke[];
  prefix: readonly Stroke[];
  needsCheckpoint: boolean;
}>;

export function checkpointMatches(strokes: readonly Stroke[], checkpoint: InkCheckpoint): boolean {
  return (
    checkpoint.strokes.length <= strokes.length &&
    checkpoint.strokes.every((stroke, index) => stroke === strokes[index])
  );
}

export function planInk(
  strokes: readonly Stroke[],
  cached: InkCheckpoint | null,
  prepareEraser: boolean
): InkPlan {
  const checkpoint = cached && checkpointMatches(strokes, cached) ? cached : null;
  const start = checkpoint?.strokes.length ?? 0;
  let erased = false;
  let paintedAfterErase = false;
  for (let index = start; index < strokes.length; index += 1) {
    if (strokes[index].brush === 'eraser') {
      if ((!erased && index > start) || paintedAfterErase)
        return {
          checkpoint,
          strokes: strokes.slice(start, index),
          prefix: strokes.slice(0, index),
          needsCheckpoint: true,
        };
      erased = true;
    } else if (erased) paintedAfterErase = true;
  }
  return {
    checkpoint,
    strokes: strokes.slice(start),
    prefix: strokes,
    needsCheckpoint: prepareEraser && (paintedAfterErase || (!erased && strokes.length > start)),
  };
}
