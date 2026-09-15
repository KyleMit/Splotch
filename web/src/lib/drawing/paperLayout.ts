import { isIdentityView, type PaperView, type Size } from './paperView';
import type { CanvasRect } from './canvasMeasure';
import type { RecordedPaperState } from './undoHistory';

export interface PaperLayoutSnapshot {
  view: PaperView;
  rect: CanvasRect;
  windowSize: Size;
  angle: number;
}

export function recordPaper(
  paper: Omit<RecordedPaperState, 'angle' | 'presentation'>,
  angle: number,
  view: PaperView,
  rect: CanvasRect,
  screenAngle: number
): RecordedPaperState {
  return { ...paper, angle, presentation: capturePaperLayout(view, rect, screenAngle) };
}

export function capturePaperLayout(
  view: PaperView,
  rect: CanvasRect,
  angle: number
): PaperLayoutSnapshot | undefined {
  if (isIdentityView(view)) return undefined;
  return {
    view: { ...view },
    rect: { ...rect },
    angle,
    windowSize: { width: window.innerWidth, height: window.innerHeight },
  };
}

export function restorePaperLayout(
  snapshot: PaperLayoutSnapshot | undefined,
  rect: CanvasRect,
  renderScale: number,
  angle: number
): PaperView | undefined {
  if (
    !snapshot ||
    snapshot.angle !== angle ||
    snapshot.windowSize.width !== window.innerWidth ||
    snapshot.windowSize.height !== window.innerHeight
  )
    return undefined;
  return {
    ...snapshot.view,
    tx: snapshot.view.tx + (snapshot.rect.left - rect.left) * renderScale,
    ty: snapshot.view.ty + (snapshot.rect.top - rect.top) * renderScale,
  };
}
