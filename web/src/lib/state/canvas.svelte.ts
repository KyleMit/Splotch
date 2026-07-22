// The shared "the child has settled in" threshold: earned UI (the install
// banner) and deferred background work (service-worker registration, #462)
// both wait for this many committed strokes, deliberately the same signal.
export const SETTLED_IN_STROKES = 3;

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
  paperOrientation: null as 'portrait' | 'landscape' | null,
});
