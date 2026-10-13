import { scheduleIdle } from '../../../../web/src/lib/idle';
import { drawingPaint } from './drawingPaint';

// The drawing screen's first paint reaches the display a frame or more after its commit, so a
// fetch started straight after the commit still lands before Largest Contentful Paint. The
// shipping app's idle gate (web/src/lib/idle.ts) waits past it.
export function afterDrawingPaint(): Promise<void> {
  return drawingPaint.painted().then(
    () =>
      new Promise((resolve) => {
        scheduleIdle(resolve);
      })
  );
}
