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

// A capture can hold its declared beat for most of its frames and still spend
// sustained stretches presenting at the OTHER rate — an adaptive panel shifting
// mid-capture. The 2026-08-23 vigorous-hand Safari capture holds a 73-frame
// 60 Hz run inside a 120 Hz capture, and every frame of such a run is charged
// ~half its duration as lost time by a scorer pricing against the dominant
// beat. That is a scoring artifact, not app loss, so a capture carrying enough
// of it is refused rather than mis-scored.
//
// The discriminator is RUNS, not total minority share: an isolated other-band
// delta is indistinguishable from a genuinely dropped frame (one 16.7 ms gap at
// a 120 Hz beat IS one missed slot, and charging it is correct), while three or
// more consecutive other-band deltas mean the panel was actually presenting
// there. Calibrated across all 74 tracked captures' in-contact frames: every
// machine-driven scored capture measures at most 0.68% of its frames in
// sustained minority runs (62 of 74 at exactly zero), while captures with
// genuinely mixed presentation — real hands whose pace moved an adaptive panel
// — measure 2.15-4.31%. The threshold sits in that gap. Residual honesty: a
// capture just under it can still carry up to roughly a point of mis-priced
// lost time; the spread work in issue 1344 is what would tighten this further.
export const REGIME_MIXTURE_RUN_MIN_FRAMES = 3;
export const MIXED_REGIME_SUSTAINED_SHARE_MAX = 0.015;

// Share of in-contact frame deltas that sit in sustained runs (length >=
// REGIME_MIXTURE_RUN_MIN_FRAMES) of whichever regime band holds FEWER of the
// capture's frames. Computed at summary time from the raw deltas and carried in
// `summaries.regimeMixture`, because the verdict sites hold only the summary.
export function regimeMixture(contactDeltas = []) {
  const deltas = contactDeltas.filter((v) => Number.isFinite(v) && v > 0);
  if (!deltas.length) return null;
  const bands = Object.keys(REFRESH_REGIMES).map((regime) => {
    const [low, high] = refreshRegimeBand(regime);
    return { regime, low, high, count: deltas.filter((v) => v >= low && v <= high).length };
  });
  bands.sort((a, b) => a.count - b.count);
  const minority = bands[0];
  let sustained = 0;
  let run = 0;
  for (const value of deltas) {
    if (value >= minority.low && value <= minority.high) {
      run += 1;
      continue;
    }
    if (run >= REGIME_MIXTURE_RUN_MIN_FRAMES) sustained += run;
    run = 0;
  }
  if (run >= REGIME_MIXTURE_RUN_MIN_FRAMES) sustained += run;
  return {
    minorityRegime: minority.regime,
    sustainedMinorityShare: Math.round((sustained / deltas.length) * 10000) / 10000,
    runMinFrames: REGIME_MIXTURE_RUN_MIN_FRAMES,
    frames: deltas.length,
  };
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
const MIXED_REGIME = 'mixed-regime';

// `mixture` is the capture's `summaries.regimeMixture`, when it recorded one. A
// capture without the field (banked before it existed) is judged exactly as it
// was — the same legacy principle as the fidelity table's pre-field artifacts.
// Mixture can only DEMOTE an in-regime verdict: an off-regime or unestablished
// capture already has its answer, and both are worth their existing responses
// (retry / bank) rather than a third one.
export function refreshRegimeVerdict(intervalMs, expected = null, mixture = null) {
  const observed = classifyRefreshRegime(intervalMs);
  let verdict =
    expected === null ? UNESTABLISHED_REGIME : observed === expected ? IN_REGIME : OFF_REGIME;
  if (
    verdict === IN_REGIME &&
    Number.isFinite(mixture?.sustainedMinorityShare) &&
    mixture.sustainedMinorityShare > MIXED_REGIME_SUSTAINED_SHARE_MAX
  ) {
    verdict = MIXED_REGIME;
  }
  return {
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : null,
    observed,
    expected,
    verdict,
    mixture: mixture ?? null,
    // Retained as the "is this the regime it should be" question alone, which is
    // what the campaign runner retries on. A mixed capture is worth retrying for
    // the same reason an off-regime one is: an adaptive panel presenting at the
    // other rate that run is exactly what a second attempt fixes. Scoreability
    // is a separate question and has its own field, because an unestablished
    // target answers them differently.
    matched: verdict !== OFF_REGIME && verdict !== MIXED_REGIME,
    scoreable: verdict === IN_REGIME,
  };
}

export function describeRefreshRegime(verdict) {
  const beat = verdict.intervalMs === null ? 'no beat' : `${verdict.intervalMs} ms`;
  const observed = verdict.observed ?? 'unrecognized';
  if (verdict.verdict === UNESTABLISHED_REGIME) {
    return `${beat} (${observed}, no established regime — not scoreable)`;
  }
  if (verdict.verdict === MIXED_REGIME) {
    const share = Math.round((verdict.mixture?.sustainedMinorityShare ?? 0) * 1000) / 10;
    return `${beat} (${observed}, but ${share}% of in-contact frames in sustained ${
      verdict.mixture?.minorityRegime
    } runs — mixed presentation, not scoreable against one beat)`;
  }
  if (verdict.verdict === IN_REGIME) return `${beat} (${observed})`;
  return `${beat} (${observed}, expected ${verdict.expected})`;
}
