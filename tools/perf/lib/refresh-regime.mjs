// Which refresh regime a capture was measured in, and whether that is the one its
// target is scored against.
//
// `lostFrameTimeShare` prices frames against the beat the capture observed
// (ADR-0134), and the drawing gates are calibrated for 60 Hz presentation (ADR-0085
// says so in terms). A ProMotion iPad can present at either rate, so the same cell
// on the same device minutes apart can produce two numbers that differ by 6x and
// are both correctly derived:
//
//   beat 17 ms — p95 16, max 42-77, lost 1.27-1.70%   (twelve of thirteen samples)
//   beat  8 ms — p95 12, max 42,    lost 8.19%        (the thirteenth)
//
// The odd sample passed input fidelity on all five checks at 119 contact moves/s,
// parsed, and wrote a well-formed artifact. Nothing rejected it, flagged it, or
// recorded that it had been measured in the other regime — and a matrix cell is a
// single capture, so one such sample publishes a number that looks exactly like a
// severe regression and means nothing.
//
// ADR-0134's estimator is not at fault: it detected the 120 Hz beat correctly,
// which is what it was built to do. The gap is downstream, and this closes it by
// classifying the beat and refusing to score across regimes.

// Nominal frame intervals. A regime is named for the presentation rate rather than
// for the interval, because the interval is what varies and the rate is what the
// gates were calibrated against.
export const REFRESH_REGIMES = {
  '60hz': 1000 / 60,
  '120hz': 1000 / 120,
};

// Wide enough to absorb the estimator's own spread — the tracked corpus reports
// 16-17 ms for 60 Hz targets and 8.30-8.42 ms for 120 Hz ones — and narrow enough
// that the two bands cannot meet: 60 Hz spans 13.3-20.0 ms and 120 Hz 6.7-10.0 ms.
export const REFRESH_REGIME_TOLERANCE_FRACTION = 0.2;

// null rather than a nearest-match fallback: a beat that belongs to neither band is
// a capture nobody has a budget for, and quietly filing it under the closer one is
// the failure this module exists to stop.
export function classifyRefreshRegime(intervalMs) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  for (const [regime, nominalMs] of Object.entries(REFRESH_REGIMES)) {
    const tolerance = nominalMs * REFRESH_REGIME_TOLERANCE_FRACTION;
    if (Math.abs(intervalMs - nominalMs) <= tolerance) return regime;
  }
  return null;
}

// A capture command is handed a device id, not a matrix row, so it cannot know
// which regime it is expected to be in — the same reason ADR-0137's exception table
// is applied by the matrix rather than at capture time. The verdict is therefore
// formed wherever the target is known: the campaign runner, the rescorer, and the
// matrix generator.
//
// `expected` of null means no regime has been established for this target from
// measured captures. That is not a pass by default and not a failure either: there
// is nothing to compare against, so the observation is recorded and the capture is
// scored. Establishing the regime is a measurement, exactly like calibrating an
// input-fidelity threshold.
export function refreshRegimeVerdict(intervalMs, expected = null) {
  const observed = classifyRefreshRegime(intervalMs);
  return {
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : null,
    observed,
    expected,
    matched: expected === null ? true : observed === expected,
  };
}

export function describeRefreshRegime(verdict) {
  const beat = verdict.intervalMs === null ? 'no beat' : `${verdict.intervalMs} ms`;
  const observed = verdict.observed ?? 'unrecognized';
  if (verdict.expected === null) return `${beat} (${observed}, no established regime)`;
  if (verdict.matched) return `${beat} (${observed})`;
  return `${beat} (${observed}, expected ${verdict.expected})`;
}
