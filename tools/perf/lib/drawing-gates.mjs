export const PAINT_P95_GATE_MS = 20;
export const PAINT_P99_GATE_MS = 33;
export const PAINT_MAX_GATE_MS = 50;
export const LOST_FRAME_TIME_SHARE_GATE = 0.01;

// Cells the single gate cannot hold, keyed `<targetId>:<brush>`. This is an
// EXCEPTION table, not a per-cell budget: a cell absent from it is scored at
// LOST_FRAME_TIME_SHARE_GATE, so a passing grade never has to be spelled out and
// a new cell cannot enter the matrix already exempt. Entries carry the reason and
// the measurement they were set from, and only ever ratchet down — raising one
// needs the same evidence as adding it. See ADR-0137.
export const LOST_FRAME_TIME_SHARE_EXCEPTIONS = {
  'ipad-device-web:crayon': {
    share: 0.014,
    reason:
      'Crayon deposits wax through pattern-filled strokes that cannot be merged across pointermoves, ' +
      'so it pays a per-move cost every other brush coalesces away. Held at 1.23% measured over three ' +
      'samples after mirror-by-blit took it from 2.11%; Safari on this device is the only place the ' +
      'residual survives ADR-0136 crediting.',
  },
};

export function lostFrameTimeShareGateFor(targetId, brush) {
  return (
    LOST_FRAME_TIME_SHARE_EXCEPTIONS[`${targetId}:${brush}`]?.share ?? LOST_FRAME_TIME_SHARE_GATE
  );
}

export function scoreDrawingPhase(phase, gateShare = LOST_FRAME_TIME_SHARE_GATE) {
  const paint = phase.paintLatencyMs ?? {};
  const legacyContactMs = Number.isFinite(phase.contactSeconds)
    ? phase.contactSeconds * 1_000
    : undefined;
  const legacyLostFrameTimeShare = legacyContactMs
    ? phase.pacing?.lostMs / legacyContactMs
    : undefined;
  const lostFrameTimeShare =
    phase.starvation?.inContact?.lostFrameTimeShare ??
    phase.pacing?.lostFrameTimeShare ??
    legacyLostFrameTimeShare ??
    Infinity;
  const checks = {
    paintP95: paint.p95 <= PAINT_P95_GATE_MS,
    paintP99: paint.p99 <= PAINT_P99_GATE_MS,
    paintMax: paint.max <= PAINT_MAX_GATE_MS,
    starvation: lostFrameTimeShare <= gateShare,
  };
  return {
    phase: phase.key,
    paint,
    lostFrameTimeShare,
    gateShare,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export function scoreDrawingRun(phases, gateShare = LOST_FRAME_TIME_SHARE_GATE) {
  const phaseScores = phases.map((phase) => scoreDrawingPhase(phase, gateShare));
  return {
    phases: phaseScores,
    passed: phaseScores.length > 0 && phaseScores.every((phase) => phase.passed),
  };
}

export function drawingGateRows(score) {
  return score.phases.map((phase) => ({
    phase: phase.phase,
    'paint p95': phase.paint.p95,
    'paint p99': phase.paint.p99,
    'paint max': phase.paint.max,
    'lost frame %': Number.isFinite(phase.lostFrameTimeShare)
      ? Math.round(phase.lostFrameTimeShare * 10_000) / 100
      : undefined,
    verdict: phase.passed ? 'PASS' : 'FAIL',
  }));
}
