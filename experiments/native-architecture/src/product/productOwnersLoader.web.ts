import { createLazyExport } from '../lazyExport';
import { afterDrawingPaint } from './afterDrawingPaint.web';

// AI generation and recovery with its storage and vault, and feedback, are about 140 KB the
// drawing screen does not need to paint, so the web export loads them in their own chunk
// (productChunk.web.ts) once the screen has painted (ADR-0179).
export const productOwners = createLazyExport(() =>
  afterDrawingPaint()
    .then(() => import('./productChunk.web'))
    .then((module) => module.createProductOwners)
);
