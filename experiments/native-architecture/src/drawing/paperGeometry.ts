import { PAPER_HEIGHT, PAPER_WIDTH } from './paperSpace';

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

export function createPaperGeometry(interrupt: () => void) {
  let frame: PaperFrame | null = null;
  let generation = 0;
  return {
    current: () => frame,
    refresh(measure: MeasurePaper) {
      interrupt();
      frame = null;
      const requested = ++generation;
      let completed = false;
      measure((next) => {
        if (requested !== generation || completed) return;
        completed = true;
        frame = next;
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

// The fixed paper contain-fitted and centered in the space it is given, never above its own size.
export function fittedPaper(space: { width: number; height: number }) {
  const width = Math.max(
    0,
    Math.min(space.width, (space.height * PAPER_WIDTH) / PAPER_HEIGHT, PAPER_WIDTH)
  );
  const height = (width * PAPER_HEIGHT) / PAPER_WIDTH;
  return {
    left: (space.width - width) / 2,
    top: (space.height - height) / 2,
    width,
    height,
  };
}
