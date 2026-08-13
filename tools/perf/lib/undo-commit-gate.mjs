import { UNDO_SCENARIO_KEYS } from './undo-scenario-keys.mjs';

export const COMMIT_GATE_MS = 25;
export const COMMIT_GATE_PERCENTILE = 0.95;

// Controlled healthy runs complete one crayon draw mark in at most this time.
// A larger same-run average measures renderer-wide host slowdown, which the
// shared-runner timing gate must separate from new stroke-end work.
export const CRAYON_DRAW_REFERENCE_MS_PER_CALL = 0.4;

export function evaluateCommitTiming(scenario, { normalizeSharedRunnerCrayon = false } = {}) {
  const rawP95Ms = scenario.draw.commitP95Ms;
  const shouldNormalize =
    normalizeSharedRunnerCrayon && scenario.key === UNDO_SCENARIO_KEYS.crayonScribbles;
  const drawMsPerCall = scenario.draw.ops > 0 ? scenario.draw.totalMs / scenario.draw.ops : null;
  const slowdownFactor =
    shouldNormalize && drawMsPerCall != null
      ? Math.max(1, drawMsPerCall / CRAYON_DRAW_REFERENCE_MS_PER_CALL)
      : 1;
  const gateP95Ms = rawP95Ms / slowdownFactor;

  return {
    key: scenario.key,
    rawP95Ms,
    gateP95Ms,
    drawMsPerCall,
    slowdownFactor,
    normalized: shouldNormalize,
    evaluable: Number.isFinite(gateP95Ms) && (!shouldNormalize || drawMsPerCall != null),
    breached: gateP95Ms > COMMIT_GATE_MS,
  };
}
