import { drawingPaint } from './drawingPaint';

export function afterDrawingPaint(): Promise<void> {
  return drawingPaint
    .painted()
    .then(() => new Promise<void>((resolve) => requestIdleCallback(() => resolve())));
}
