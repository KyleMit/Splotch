import { paperSize, type PaperReference } from './paperSpace';

export type PaperFrame = { width: number; height: number; pageX: number; pageY: number };
export type MeasurePaper = (complete: (frame: PaperFrame | null) => void) => void;

export function paperFrame(
  width: unknown,
  height: unknown,
  pageX: unknown,
  pageY: unknown
): PaperFrame | null {
  if (
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    height <= 0 ||
    typeof pageX !== 'number' ||
    !Number.isFinite(pageX) ||
    typeof pageY !== 'number' ||
    !Number.isFinite(pageY)
  )
    return null;
  return { width, height, pageX, pageY };
}

export function paperLocation(touch: { pageX: number; pageY: number }, frame: PaperFrame | null) {
  if (
    !frame ||
    typeof touch.pageX !== 'number' ||
    !Number.isFinite(touch.pageX) ||
    typeof touch.pageY !== 'number' ||
    !Number.isFinite(touch.pageY)
  )
    return null;
  return { x: touch.pageX - frame.pageX, y: touch.pageY - frame.pageY };
}

export function createPaperGeometry() {
  let frame: PaperFrame | null = null;
  let generation = 0;
  return {
    current: () => frame,
    refresh(measure: MeasurePaper) {
      const requested = ++generation;
      let completed = false;
      measure((next) => {
        if (requested !== generation || completed) return;
        completed = true;
        if (next) frame = next;
      });
    },
    clear() {
      generation += 1;
      frame = null;
    },
  };
}

export function createPaperScroll(refresh: () => void) {
  let x = 0;
  let y = 0;
  return (offset: { x: number; y: number }) => {
    if (offset.x === x && offset.y === y) return;
    x = offset.x;
    y = offset.y;
    refresh();
  };
}

// A blank picture fills the space it is given, so its first contact adopts that shape. A
// picture with a shape is contain-fitted and centered: after rotation it keeps its shape and
// presents upright inside the new space (ADR-0050). The fit follows the adopted CSS shape, not
// its whole-unit semantic size, so an unrotated picture keeps exactly the frame it adopted.
export function fittedPaper(space: { width: number; height: number }, paper: PaperReference) {
  if (paper.kind === 'unadopted')
    return { left: 0, top: 0, width: Math.max(0, space.width), height: Math.max(0, space.height) };
  const size =
    paper.kind === 'adopted'
      ? { width: paper.cssWidth, height: paper.cssHeight }
      : paperSize(paper);
  const scale = Math.max(0, Math.min(space.width / size.width, space.height / size.height));
  const width = size.width * scale;
  const height = size.height * scale;
  return {
    left: (space.width - width) / 2,
    top: (space.height - height) / 2,
    width,
    height,
  };
}

// Sub-pixel slack from the contain fit's arithmetic, not a presentation change.
const LIFT_TOLERANCE_PX = 0.5;

// Shipping lifts the sheet off a flat margin only while it presents smaller than its space, as a
// rotation-locked picture does; a sheet that fills its space is the page itself.
export function paperLifted(
  space: { width: number; height: number },
  frame: { width: number; height: number }
) {
  return (
    space.width - frame.width > LIFT_TOLERANCE_PX || space.height - frame.height > LIFT_TOLERANCE_PX
  );
}
