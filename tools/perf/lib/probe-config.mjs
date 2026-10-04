const PROBE_BRUSHES = ['pen', 'crayon', 'magic', 'eraser'];

// Assigns every global the probe reads, including the ones not requested: the
// page is freshly navigated so nothing should be left over, but this is the same
// guarantee `perf:ios:webkit:gates`'s overrides script makes, for the same reason — a
// leftover config silently changes what a run measured and the output looks
// completely normal.
export function probeConfigScript({
  phases,
  contactMs,
  freeDrawSeconds,
  drive,
  driveHz,
  pointerType,
  brush,
  hud = true,
} = {}) {
  if (brush !== undefined && !PROBE_BRUSHES.includes(brush)) {
    throw new Error(`--brush must be one of ${PROBE_BRUSHES.join(', ')}`);
  }
  const assign = (name, value) =>
    `window.${name} = ${value === undefined ? 'undefined' : JSON.stringify(value)};`;
  return [
    assign('__probePhases', phases),
    assign('__probeContactMs', contactMs),
    assign('__probeFreeDraw', freeDrawSeconds),
    assign('__probeDrive', drive),
    assign('__probeDriveHz', driveHz),
    assign('__probePointerType', pointerType),
    assign('__probeBrush', brush),
    assign('__probeHud', hud === true ? undefined : hud),
    assign('__probeReport', undefined),
    assign('__probeProgress', undefined),
  ].join('\n');
}
