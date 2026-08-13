export const PAINT_P95_GATE_MS = 20;
export const PAINT_P99_GATE_MS = 33;
export const PAINT_MAX_GATE_MS = 50;
export const LOST_FRAME_TIME_SHARE_GATE = 0.01;

export function scoreDrawingPhase(phase) {
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
    starvation: lostFrameTimeShare <= LOST_FRAME_TIME_SHARE_GATE,
  };
  return {
    phase: phase.key,
    paint,
    lostFrameTimeShare,
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

export function scoreDrawingRun(phases) {
  const phaseScores = phases.map(scoreDrawingPhase);
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
