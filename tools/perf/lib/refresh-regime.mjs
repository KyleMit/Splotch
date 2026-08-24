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
// Each band is the measured spread plus an explicit margin, not a percentage of the
// nominal interval. An earlier revision used +/-20% of nominal, which accepted
// 13.3-20.0 ms and 6.7-10.0 ms — roughly 50-75 Hz and 100-150 Hz — on the strength
// of four captures per target spanning 16-17 ms and 8.30-8.42 ms. Nothing measured
// justified those extremes, and a band that wide is a band that classifies a rate
// nobody has seen.
//
// `observed` is the range the tracked corpus reports for targets established at that
// regime; `marginMs` is the stated allowance on either side of it. A beat outside
// the widened range is classified as no regime rather than snapped to the nearer
// one, so widening a band is a deliberate edit with evidence attached.
export const REFRESH_REGIMES = {
  '60hz': { nominalMs: 1000 / 60, observedMs: [16, 17], marginMs: 1.5 },
  '120hz': { nominalMs: 1000 / 120, observedMs: [8.3, 8.42], marginMs: 0.75 },
};

export function refreshRegimeBand(regime) {
  const { observedMs, marginMs } = REFRESH_REGIMES[regime];
  return [observedMs[0] - marginMs, observedMs[1] + marginMs];
}

// null rather than a nearest-match fallback: a beat that belongs to neither band is
// a capture nobody has a budget for, and quietly filing it under the closer one is
// the failure this module exists to stop.
export function classifyRefreshRegime(intervalMs) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return null;
  for (const regime of Object.keys(REFRESH_REGIMES)) {
    const [low, high] = refreshRegimeBand(regime);
    if (intervalMs >= low && intervalMs <= high) return regime;
  }
  return null;
}

// A capture command is handed a device id, not a matrix row, so it cannot know
// which regime it is expected to be in — the same reason ADR-0137's exception table
// is applied by the matrix rather than at capture time. The verdict is therefore
// formed wherever the target is known: the campaign runner, the rescorer, and the
// matrix generator.
//
// Three outcomes, not two. An earlier revision returned `matched: true` when no
// regime had been established for the target, which scored a capture whose beat
// nobody has characterized — the same fail-open that `campaign-plan.mjs` calls "not
// a licence to score anything" two files away.
//
// `unestablished` is separated from `off-regime` because they call for different
// work, and conflating them costs device time either way: an off-regime capture is
// worth retrying, since a ProMotion panel presenting at the other rate that run is
// exactly the kind of thing a second attempt fixes. An unestablished target cannot
// be fixed by retrying at all — the gap is a missing measurement — so the campaign
// banks the artifact and the matrix refuses to score the cell.
const IN_REGIME = 'in-regime';
const OFF_REGIME = 'off-regime';
const UNESTABLISHED_REGIME = 'unestablished';

export function refreshRegimeVerdict(intervalMs, expected = null) {
  const observed = classifyRefreshRegime(intervalMs);
  const verdict =
    expected === null ? UNESTABLISHED_REGIME : observed === expected ? IN_REGIME : OFF_REGIME;
  return {
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : null,
    observed,
    expected,
    verdict,
    // Retained as the "is this the regime it should be" question alone, which is
    // what the campaign runner retries on. Scoreability is a separate question and
    // has its own field, because an unestablished target answers them differently.
    matched: verdict !== OFF_REGIME,
    scoreable: verdict === IN_REGIME,
  };
}

export function describeRefreshRegime(verdict) {
  const beat = verdict.intervalMs === null ? 'no beat' : `${verdict.intervalMs} ms`;
  const observed = verdict.observed ?? 'unrecognized';
  if (verdict.verdict === UNESTABLISHED_REGIME) {
    return `${beat} (${observed}, no established regime — not scoreable)`;
  }
  if (verdict.verdict === IN_REGIME) return `${beat} (${observed})`;
  return `${beat} (${observed}, expected ${verdict.expected})`;
}
