import type { Orientation } from '$lib/platform';

// The shared "the child has settled in" threshold: earned UI (the install
// banner) and deferred background work (service-worker registration, #462, and
// a first visit's coloring-pack downloads) all wait for this many committed
// strokes, deliberately the same signal.
export const SETTLED_IN_STROKES = 3;

interface PaperPlacement {
  paperOrientation: Orientation;
  paperCssWidth: number;
}

// The reactive mirror of the imperative drawing engine (ADR-0004). The engine
// reports through DrawingCanvas.svelte's adoption callbacks, which are the only
// production writers; every other consumer reads.
export interface CanvasState {
  readonly canUndo: boolean;
  readonly undoCount: number;
  readonly canvasEmpty: boolean;
  // Count of stroke groups committed this session. Drives "earned" UI that should
  // wait until the child has actually drawn something (e.g. the install banner).
  // Counted at stroke end (not start) so consumers never react mid-stroke.
  // Never reset — clearing the canvas does not undo the fact that they drew.
  readonly strokeCount: number;
  // Orientation of the engine's paper (ADR-0050): tracks the viewport until a
  // rotation with ink on the canvas locks it. The coloring-book picker keys the
  // tall/wide art variant off this, not the live viewport, so a locked page
  // keeps the art the child colored on. null until the engine mounts.
  readonly paperOrientation: Orientation | null;
  // CSS width of that same adopted/locked paper. Responsive overlay prefetches
  // use this instead of the full pointer canvas, which diverges under ADR-0050.
  readonly paperCssWidth: number;
  recordUndo(): void;
  setCanUndo(canUndo: boolean): void;
  setCanvasEmpty(empty: boolean): void;
  recordStrokeEnd(): void;
  setPaperView(view: PaperPlacement): void;
}

export function createCanvas(): CanvasState {
  const s = $state<{
    canUndo: boolean;
    undoCount: number;
    canvasEmpty: boolean;
    strokeCount: number;
    paperOrientation: Orientation | null;
    paperCssWidth: number;
  }>({
    canUndo: false,
    undoCount: 0,
    canvasEmpty: true,
    strokeCount: 0,
    paperOrientation: null,
    paperCssWidth: 0,
  });

  return {
    get canUndo() {
      return s.canUndo;
    },
    get undoCount() {
      return s.undoCount;
    },
    get canvasEmpty() {
      return s.canvasEmpty;
    },
    get strokeCount() {
      return s.strokeCount;
    },
    get paperOrientation() {
      return s.paperOrientation;
    },
    get paperCssWidth() {
      return s.paperCssWidth;
    },
    recordUndo() {
      s.undoCount += 1;
    },
    setCanUndo(canUndo) {
      s.canUndo = canUndo;
    },
    setCanvasEmpty(empty) {
      s.canvasEmpty = empty;
    },
    recordStrokeEnd() {
      s.strokeCount += 1;
    },
    setPaperView(view) {
      s.paperOrientation = view.paperOrientation;
      s.paperCssWidth = view.paperCssWidth;
    },
  };
}

export const canvasState = createCanvas();
