import type { Orientation } from '$lib/platform';

// The shared "the child has settled in" threshold: earned UI (the install
// banner) and deferred background work (service-worker registration, #462)
// both wait for this many committed strokes, deliberately the same signal.
export const SETTLED_IN_STROKES = 3;

// Engine-bridge exception to the setter convention in .claude/rules/svelte.md
// ("components read state and call setters; they never own shared state"):
// canvasState has no setters. Per ADR-0004, this is a passive bridge target
// for the imperative drawing engine's callbacks — the only writer is
// DrawingCanvas.svelte's onMount engine-adoption block (onUndoStateChange,
// onCanvasEmptyChange, onStrokeEnd, onViewChange). Any new writer should
// either route through that same adoption block, or this module should grow
// real setters.
export const canvasState = $state({
  canUndo: false,
  canvasEmpty: true,
  // Count of stroke groups committed this session. Drives "earned" UI that should
  // wait until the child has actually drawn something (e.g. the install banner).
  // Counted at stroke end (not start) so consumers never react mid-stroke.
  // Never reset — clearing the canvas does not undo the fact that they drew.
  strokeCount: 0,
  // Orientation of the engine's paper (ADR-0050): tracks the viewport until a
  // rotation with ink on the canvas locks it. The coloring-book picker keys the
  // tall/wide art variant off this, not the live viewport, so a locked page
  // keeps the art the child colored on. null until the engine mounts.
  paperOrientation: null as Orientation | null,
  // CSS width of that same adopted/locked paper. Responsive overlay prefetches
  // use this instead of the full pointer canvas, which diverges under ADR-0050.
  paperCssWidth: 0,
});
