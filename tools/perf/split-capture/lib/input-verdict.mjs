// Does synthesized touch reach the page the way a finger does?
//
// This is the check whose absence let the Android cadence defect survive a whole
// campaign. Every preflight check was host-side, and every capture the campaign
// produced parsed cleanly — the input was simply too sparse to measure anything,
// and `lostFrameTimeShare` priced the gaps between samples as lost frames.
//
// Cadence is the verdict. Pressure and contact geometry are reported but do NOT
// decide it, because their thresholds were calibrated from a hand capture on the
// target iPad — Safari reports pressure 0 and a ~74px contact radius, Chrome
// reports pressure 1 and no radius at all, for a real finger and a synthesized
// touch alike. Failing Android on an iPad-shaped expectation would make this
// check noise, and widening the expectation to make Android pass would destroy
// the only thing it is for. Those three are now stated per runtime.
//
// Cadence itself is a DENSITY floor — moves per observed frame, not a rate
// (ADR-0145): a rate encodes the display's speed, and a 60 Hz-locked device
// driven perfectly can never exceed ~60 moves/s. The ceiling the check once
// carried claimed a faster stream was "faster than a hand", and the hand corpus
// measured 178.0 on this phone and 268.4 on the iPad (ADR-0141). Excess density
// is still worth saying out loud, so it is reported without failing the run.
import {
  FIDELITY_MOVE_GAP_P95_MAX_MS,
  FIDELITY_MOVES_PER_FRAME_MIN,
} from '../../lib/input-fidelity.mjs';

export function classifyInputCadence(input = {}) {
  const moves = input.movesPerSecond;
  const density = input.movesPerFrame;
  const gapP95 = input.moveGapP95Ms;

  if (!Number.isFinite(moves) || moves === 0) {
    return {
      ok: false,
      detail:
        'the page recorded no pointer input at all — the gesture never reached it. ' +
        'Check that the page is frontmost and nothing is covering it.',
    };
  }
  const rate = `${Math.round(moves * 10) / 10} contact moves/s`;
  const perFrame = Number.isFinite(density) ? `${density} moves/frame` : 'moves/frame unmeasured';
  if (!Number.isFinite(density) || density < FIDELITY_MOVES_PER_FRAME_MIN) {
    return {
      ok: false,
      detail:
        `${perFrame} (${rate}), below the ${FIDELITY_MOVES_PER_FRAME_MIN} density floor. ` +
        'Captures through this transport cannot be scored: frames went by with no input in them, and ' +
        'lost-frame time prices the gaps between samples as dropped frames.',
    };
  }
  if (Number.isFinite(gapP95) && gapP95 > FIDELITY_MOVE_GAP_P95_MAX_MS) {
    return {
      ok: false,
      detail: `${perFrame} on average, but a p95 gap of ${gapP95} ms — the stream stalls, so the density is a mean over bursts rather than a steady cadence.`,
    };
  }
  return { ok: true, detail: `${perFrame} (${rate}), at or above the trusted-input density floor` };
}

// Reported alongside the verdict, never as part of it. Values a platform cannot
// produce are stated as such rather than counted against it.
export function describeContactSamples(input = {}) {
  const pressure = input.pressure?.p50;
  const width = input.contactWidth?.p50;
  const height = input.contactHeight?.p50;
  const notes = [];
  if (Number.isFinite(pressure)) notes.push(`pressure p50 ${pressure}`);
  if (Number.isFinite(width) && Number.isFinite(height)) {
    notes.push(
      width === 0 && height === 0 ? 'no contact geometry reported' : `contact ${width}x${height}px`
    );
  }
  return notes.join(' · ');
}
