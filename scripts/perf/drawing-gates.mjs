export const PAINT_P95_GATE_MS = 20;
export const PAINT_P99_GATE_MS = 33;
export const PAINT_MAX_GATE_MS = 50;
export const STARVATION_PER_DRAWING_SECOND_GATE_MS = 10;

export function scoreDrawingPhase(phase) {
  const paint = phase.paintLatencyMs ?? {};
  const starvationMsPerDrawingSecond =
    phase.starvation?.all?.starvationMsPerDrawingSecond ?? Infinity;
  const checks = {
    paintP95: paint.p95 <= PAINT_P95_GATE_MS,
    paintP99: paint.p99 <= PAINT_P99_GATE_MS,
    paintMax: paint.max <= PAINT_MAX_GATE_MS,
    starvation: starvationMsPerDrawingSecond <= STARVATION_PER_DRAWING_SECOND_GATE_MS,
  };
  return {
    phase: phase.key,
    paint,
    starvationMsPerDrawingSecond,
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
    'starvation ms/draw s': phase.starvationMsPerDrawingSecond,
    verdict: phase.passed ? 'PASS' : 'FAIL',
  }));
}
