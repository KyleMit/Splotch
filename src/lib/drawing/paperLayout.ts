import {
  isIdentityView,
  SYSTEM_BAR_OCCLUSION_MAX_CSS_PX,
  type PaperView,
  type Size,
} from './paperView';
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
  const ordinaryView =
    isIdentityView(view) && paper.cssW === rect.width && paper.cssH === rect.height;
  return {
    ...paper,
    angle,
    presentation: ordinaryView ? undefined : capturePaperLayout(view, rect, screenAngle),
  };
}

export function capturePaperLayout(
  view: PaperView,
  rect: CanvasRect,
  angle: number
): PaperLayoutSnapshot {
  return {
    view: { ...view },
    rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
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
    Math.abs(snapshot.windowSize.width - window.innerWidth) > SYSTEM_BAR_OCCLUSION_MAX_CSS_PX ||
    Math.abs(snapshot.windowSize.height - window.innerHeight) > SYSTEM_BAR_OCCLUSION_MAX_CSS_PX ||
    snapshot.windowSize.width > snapshot.windowSize.height !==
      window.innerWidth > window.innerHeight
  )
    return undefined;
  return {
    ...snapshot.view,
    tx: snapshot.view.tx + (snapshot.rect.left - rect.left) * renderScale,
    ty: snapshot.view.ty + (snapshot.rect.top - rect.top) * renderScale,
  };
}

export function createPaperLayoutMemory() {
  let snapshot: PaperLayoutSnapshot | undefined;
  return (
    preservedView: PaperView | undefined,
    rect: CanvasRect,
    renderScale: number,
    angle: number,
    empty: boolean
  ) => {
    if (empty) {
      snapshot = undefined;
      return undefined;
    }
    if (preservedView) {
      snapshot = capturePaperLayout(preservedView, rect, angle);
      return preservedView;
    }
    const view = restorePaperLayout(snapshot, rect, renderScale, angle);
    if (!view) snapshot = undefined;
    return view;
  };
}
