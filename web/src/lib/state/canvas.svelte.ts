export const canvasState = $state({
  canUndo: false,
  canvasEmpty: true,
  // Count of stroke groups committed this session. Drives "earned" UI that should
  // wait until the child has actually drawn something (e.g. the install banner).
  // Counted at stroke end (not start) so consumers never react mid-stroke.
  // Never reset — clearing the canvas does not undo the fact that they drew.
  strokeCount: 0,
});
