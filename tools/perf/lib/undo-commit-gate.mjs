import { UNDO_SCENARIO_KEYS } from './undo-scenario-keys.mjs';

export const COMMIT_GATE_MS = 25;
export const COMMIT_GATE_PERCENTILE = 0.95;

// NORMALIZATION IS OFF. The divisor is not applied to any scenario, and no constant
// here can turn a real breach into a pass.
//
// The history is worth keeping, because the shape recurs. The control was
// `(draw.totalMs / draw.ops)` against a 0.4 ms per-CALL reference set in
// 64db4a899f74, when `engine.draw` fired once per operation. 13ecc3a01b52 moved that
// measure into `drainQueues()` so one covers a whole drain — a deliberate fix, the
// pointer-up tail raster was going unmeasured — and it silently rescaled the divisor
// by three orders of magnitude. A real run reports 22 measures where the old unit
// gave tens of thousands, so the gate divided by 924 and crayon needed a raw P95
// above 23,111 ms to breach 25.
//
// Re-expressing the control as total time fixes the unit but not the calibration,
// and review was right to stop there: `60_800` came from a single passing rerun
// quoted in issue 1247, and nothing measured supported a 4x cap. Two independent
// local runs of the same suite reported 8,135 / 9,685 ms and a third machine 13,843
// ms, so host dependence dwarfs the evidence the constants rested on. A divisor
// derived from one number can divide a real commit breach down to a pass, and
// `Math.max(1, ...)` means it can only ever move a score in that direction.
//
// So the control is MEASURED AND REPORTED, and not applied. The gate scores the raw
// P95, and the false positives that motivated normalization are handled by
// confirming a breach instead — which is evidenced, cheap, and cannot mask anything.
// Turning normalization back on needs a multi-run `macos-latest` distribution with
// recorded provenance; `hostSlowdownAgainst` is left exported for whoever collects
// it.
export const CRAYON_DRAW_REFERENCE_TOTAL_MS = 60_800;
export const NORMALIZATION_ENABLED = false;

// A breach has to be seen twice before it fails the job. The gate's percentile over
// ~21 commit samples resolves to the SECOND-HIGHEST sample (`ceil(0.95 * 21) - 1`),
// so two adjacent slow commits set it outright — which is what a scheduling stall on
// a shared runner produces. Measured at one commit on main: 133.0 ms on the failing
// run and 2.0 ms on a re-run of the same job. A stall does not reproduce; expensive
// stroke-end work does.
export const BREACH_CONFIRMATIONS = 2;

// Reported so a run records how fast its host was, and so the distribution the
// constants need can be collected from ordinary runs rather than from a special one.
// Nothing divides by it.
function hostSlowdownAgainst(scenario, referenceMs = CRAYON_DRAW_REFERENCE_TOTAL_MS) {
  const totalMs = scenario?.draw?.totalMs;
  if (!Number.isFinite(totalMs) || totalMs <= 0) return null;
  return totalMs / referenceMs;
}

export function evaluateCommitTiming(scenario, { normalizeSharedRunnerCrayon = false } = {}) {
  const rawP95Ms = scenario.draw.commitP95Ms;
  const crayon = scenario.key === UNDO_SCENARIO_KEYS.crayonScribbles;
  const gateP95Ms = rawP95Ms;

  return {
    key: scenario.key,
    rawP95Ms,
    gateP95Ms,
    // Recorded for provenance on the scenario the reference describes.
    hostSlowdown: crayon ? hostSlowdownAgainst(scenario) : null,
    drawTotalMs: scenario.draw.totalMs ?? null,
    slowdownFactor: 1,
    // Both false and both retained: a consumer that asks whether a score was
    // discounted gets a straight answer, and the fields do not disappear from the
    // artifact when normalization is turned back on.
    normalized: NORMALIZATION_ENABLED && normalizeSharedRunnerCrayon && crayon,
    stalled: false,
    evaluable: Number.isFinite(gateP95Ms),
    breached: Number.isFinite(gateP95Ms) && gateP95Ms > COMMIT_GATE_MS,
  };
}

// A scenario is only acquitted when a second measurement was actually taken AND
// came back clean. An earlier revision filtered to evaluable timings first, so an
// unevaluable confirmation left one timing in the list, fell under the confirmation
// count, and the scenario was logged as "breached once and not again" — a
// first-pass breach acquitted by a measurement that produced nothing.
//
// Three outcomes: `confirmed` fails the job, `acquitted` does not, and
// `unconfirmed` is neither — it keeps the breach and says the confirmation could
// not be scored, so the caller reports it rather than silently passing.
export function confirmedBreach(timings) {
  if (timings.length < BREACH_CONFIRMATIONS) return 'unconfirmed';
  if (timings.some((timing) => !timing.evaluable)) return 'unconfirmed';
  return timings.every((timing) => timing.breached) ? 'confirmed' : 'acquitted';
}
