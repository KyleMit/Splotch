import { scheduleInteractionIdle } from '../../../../web/src/lib/idle';
import { drawingPaint } from '../product/drawingPaint';

// The drawer's tools, the flyouts and every sheet draw deferred icons. The chunk is a background
// prewarm, so it waits for the shipping app's background gate (web/src/lib/idle.ts) past the
// drawing screen's first paint: started at plain idle, Lighthouse's simulated Slow 4G counted it
// against the paper texture that paints Largest Contentful Paint (ADR-0179).
export const DEFERRED_ICON_WARMUP: Promise<void> = drawingPaint
  .painted()
  .then(() => new Promise((resolve) => scheduleInteractionIdle(() => resolve())));
