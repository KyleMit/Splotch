import { UNDO_SCENARIO_KEYS } from './undo-scenario-keys.mjs';

export const COMMIT_GATE_MS = 25;
export const COMMIT_GATE_PERCENTILE = 0.95;

// Total `engine.draw` time for the crayon scenario's fixed replay, on a healthy
// shared runner. The scenario replays a recorded input, so the drawing work is a
// constant and the time it takes is a proxy for how fast the host is.
//
// This used to be a per-CALL reference — 0.4 ms, set in 64db4a899f74 against marks
// that fired once per operation. 13ecc3a01b52 then moved `engine.draw` into
// `drainQueues()`, so one measure covers a whole drain of the raster queue rather
// than one operation. That was a deliberate fix (the pointer-up tail raster was
// going unmeasured), and it silently rescaled the divisor by three orders of
// magnitude: a real run reports 22 measures where the old unit gave tens of
// thousands, so `totalMs / ops` became ~370 ms against a 0.4 ms reference and the
// gate divided by 924.
//
// The unit is now total time, which is why that cannot recur. Marking granularity
// changes `ops`; nothing about it can change `totalMs`. `ops` is deliberately
// absent from the formula below.
export const CRAYON_DRAW_REFERENCE_TOTAL_MS = 60_800;

// Normalization can only ever LOWER a score (see the clamp below), so an unbounded
// divisor is a gate that stops being one. Past this much slowdown the run is not a
// slower host to compensate for, it is a host that stalled, and its numbers are not
// comparable to anything — so it is refused rather than discounted.
export const HOST_SLOWDOWN_CAP = 4;

// A breach has to be seen twice before it fails the job. The gate's percentile over
// ~21 commit samples resolves to the SECOND-HIGHEST sample (`ceil(0.95 * 21) - 1`),
// so two adjacent slow commits set it outright — which is what a scheduling stall on
// a shared runner produces. Measured at one commit on main: 133.0 ms on the failing
// run and 2.0 ms on a re-run of the same job. A stall does not reproduce; expensive
// stroke-end work does.
export const BREACH_CONFIRMATIONS = 2;

function hostSlowdown(scenario) {
  const totalMs = scenario?.draw?.totalMs;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null;
  return totalMs / CRAYON_DRAW_REFERENCE_TOTAL_MS;
}

export function evaluateCommitTiming(scenario, { normalizeSharedRunnerCrayon = false } = {}) {
  const rawP95Ms = scenario.draw.commitP95Ms;
  const shouldNormalize =
    normalizeSharedRunnerCrayon && scenario.key === UNDO_SCENARIO_KEYS.crayonScribbles;
  const slowdown = hostSlowdown(scenario);
  // Clamped at 1 so a fast host never gets its score inflated, and capped so a
  // stalled one is refused instead of discounted into a guaranteed pass.
  const stalled = shouldNormalize && slowdown !== null && slowdown > HOST_SLOWDOWN_CAP;
  const slowdownFactor =
    shouldNormalize && slowdown !== null && !stalled ? Math.max(1, slowdown) : 1;
  const gateP95Ms = rawP95Ms / slowdownFactor;

  return {
    key: scenario.key,
    rawP95Ms,
    gateP95Ms,
    hostSlowdown: slowdown,
    slowdownFactor,
    normalized: shouldNormalize && !stalled,
    stalled,
    // A stalled host produces a number that cannot be scored either way, which is
    // distinct from a number that is missing. Both stop the gate reaching a verdict.
    evaluable: Number.isFinite(gateP95Ms) && !stalled && (!shouldNormalize || slowdown !== null),
    breached: !stalled && gateP95Ms > COMMIT_GATE_MS,
  };
}

// A scenario is only failed once every measurement of it breached. One breach out of
// two is a stall; two out of two is the work.
export function confirmedBreach(timings) {
  const evaluable = timings.filter((timing) => timing.evaluable);
  if (evaluable.length < BREACH_CONFIRMATIONS) return false;
  return evaluable.every((timing) => timing.breached);
}
