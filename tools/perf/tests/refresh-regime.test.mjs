import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { CAMPAIGN_TARGETS } from '../lib/campaign-plan.mjs';
import { OFF_REFRESH_REGIME, UNSCOREABLE, attemptsFor } from '../lib/campaign-ledger.mjs';
import {
  MIXED_REGIME_SUSTAINED_SHARE_MAX,
  REFRESH_REGIMES,
  classifyRefreshRegime,
  refreshRegimeBand,
  describeRefreshRegime,
  refreshRegimeVerdict,
  regimeMixture,
} from '../lib/refresh-regime.mjs';

const EVIDENCE = join(ROOT, 'perf-profiles', 'evidence');

// `campaignTarget` overrides the index's own `target` field for corpora that key
// their entries by capture runtime instead of campaign-target id — the hand
// corpora predate the campaign target vocabulary.
function corpusBeats(campaign, campaignTarget) {
  const index = JSON.parse(readFileSync(join(EVIDENCE, campaign, 'index.json'), 'utf8'));
  return index.kept.map((entry) => {
    const capture = JSON.parse(readFileSync(join(EVIDENCE, campaign, entry.file), 'utf8'));
    return {
      target: campaignTarget ?? entry.target,
      brush: entry.brush,
      intervalMs: capture.summaries?.intervalMs,
    };
  });
}

describe('classifyRefreshRegime', () => {
  it('recognizes the two rates this project captures at', () => {
    expect(classifyRefreshRegime(REFRESH_REGIMES['60hz'].nominalMs)).toBe('60hz');
    expect(classifyRefreshRegime(REFRESH_REGIMES['120hz'].nominalMs)).toBe('120hz');
  });

  // The bands are the measured spread plus a stated margin, not a percentage of
  // nominal. An earlier revision used +/-20%, which accepted 13.3-20.0 ms and
  // 6.7-10.0 ms — roughly 50-75 Hz and 100-150 Hz — from four captures per target.
  it('stays close to what was measured rather than to a fraction of nominal', () => {
    expect(refreshRegimeBand('60hz')).toEqual([14.5, 18.5]);
    expect(classifyRefreshRegime(13.3)).toBeNull();
    expect(classifyRefreshRegime(20)).toBeNull();
    expect(classifyRefreshRegime(6.7)).toBeNull();
    expect(classifyRefreshRegime(10)).toBeNull();
  });

  // The estimator reports whole-ish milliseconds, and the corpus spans 16-17 for a
  // 60 Hz target and 8.30-8.42 for a 120 Hz one. Both ends of both bands have to
  // land, or a healthy capture is rejected as off-regime.
  it('absorbs the estimator spread at both rates', () => {
    for (const beat of [16, 16.67, 17]) expect(classifyRefreshRegime(beat)).toBe('60hz');
    for (const beat of [8.3, 8.33, 8.42]) expect(classifyRefreshRegime(beat)).toBe('120hz');
  });

  // The bands must not meet, or the classification is a coin toss in the middle.
  it('leaves a gap between the bands rather than snapping to the nearest', () => {
    expect(classifyRefreshRegime(12)).toBeNull();
    expect(classifyRefreshRegime(33.3)).toBeNull();
  });

  it('reports no regime for a beat that was never measured', () => {
    expect(classifyRefreshRegime(undefined)).toBeNull();
    expect(classifyRefreshRegime(0)).toBeNull();
    expect(classifyRefreshRegime(-1)).toBeNull();
  });
});

describe('the regime each target is scored against', () => {
  const declared = Object.entries(CAMPAIGN_TARGETS).filter(([, t]) => t.refreshRegime !== null);

  it.each(declared)('%s declares a regime the classifier knows', (_id, target) => {
    expect(Object.keys(REFRESH_REGIMES)).toContain(target.refreshRegime);
  });

  // Every declared regime was read off these captures. If a target starts reporting
  // the other rate, this fails here rather than publishing a 6x-wrong cell.
  // android-device-native's regime comes from the real-finger WebView captures in
  // the hand-native corpus, whose index keys entries by runtime — hence the
  // explicit campaign-target override.
  it.each([
    ['2026-08-23-ipad-main'],
    ['2026-08-23-android-split'],
    ['2026-08-23-desktop-main'],
    ['2026-08-24-hand-native', 'android-device-native'],
  ])('matches every capture in %s', (campaign, campaignTarget) => {
    const beats = corpusBeats(campaign, campaignTarget);
    expect(beats.length).toBeGreaterThan(0);
    for (const beat of beats) {
      const expected = CAMPAIGN_TARGETS[beat.target].refreshRegime;
      const verdict = refreshRegimeVerdict(beat.intervalMs, expected);
      expect({ cell: `${beat.target}/${beat.brush}`, ...verdict }).toMatchObject({
        matched: true,
        observed: expected,
      });
    }
  });
});

describe('refreshRegimeVerdict', () => {
  // The 2026-08-23 excursion: same cell, same command, same build, minutes apart,
  // passing input fidelity at 119 contact moves/s — and 8.19% lost frame time
  // against 1.27-1.70% for every other sample, purely from the beat it was priced
  // against.
  it('rejects the 8 ms sample on a target established at 17 ms', () => {
    const verdict = refreshRegimeVerdict(8, '60hz');

    expect(verdict).toMatchObject({ observed: '120hz', expected: '60hz', matched: false });
    expect(describeRefreshRegime(verdict)).toBe('8 ms (120hz, expected 60hz)');
  });

  it('accepts a capture in the regime its target is scored against', () => {
    expect(refreshRegimeVerdict(17, '60hz').matched).toBe(true);
    expect(describeRefreshRegime(refreshRegimeVerdict(17, '60hz'))).toBe('17 ms (60hz)');
  });

  // 120 Hz is not "wrong" — it is the established regime for the Android phone and
  // for Chrome and Firefox on this Mac. What is wrong is scoring one target's
  // captures against another's rate.
  it('accepts 120 Hz where that is what the target is established at', () => {
    expect(refreshRegimeVerdict(8.3, '120hz').matched).toBe(true);
    expect(refreshRegimeVerdict(17, '120hz').matched).toBe(false);
  });

  // Three outcomes, not two. A target with no established regime is NOT scoreable —
  // nothing has characterized its beat, so there is nothing to compare against — but
  // it is also not worth retrying, because a second capture cannot establish a
  // regime the table does not hold. The campaign banks it; the matrix refuses to
  // score it.
  it('separates an unestablished regime from an off-regime capture', () => {
    const unestablished = refreshRegimeVerdict(33.3, null);

    expect(unestablished).toMatchObject({
      observed: null,
      expected: null,
      verdict: 'unestablished',
      matched: true,
      scoreable: false,
    });
    expect(describeRefreshRegime(unestablished)).toBe(
      '33.3 ms (unrecognized, no established regime — not scoreable)'
    );

    const offRegime = refreshRegimeVerdict(8, '60hz');
    expect(offRegime).toMatchObject({ verdict: 'off-regime', matched: false, scoreable: false });

    const inRegime = refreshRegimeVerdict(17, '60hz');
    expect(inRegime).toMatchObject({ verdict: 'in-regime', matched: true, scoreable: true });
  });

  // An unrecognized beat against an established regime is a mismatch: the capture
  // is in neither band, so it cannot be the one the gates were calibrated for.
  it('rejects a beat in neither band when a regime is established', () => {
    expect(refreshRegimeVerdict(12, '60hz').matched).toBe(false);
  });
});

describe('the campaign ledger', () => {
  // An off-regime row spends an attempt for the same reason a failed-fidelity one
  // does: a resumed run that did not count it would retry the cell forever, and a
  // ledger full of them is not the empty ledger that is safe to clear.
  it('counts an off-regime attempt as spent, and names it apart from a fidelity failure', () => {
    const rows = [
      { cell: 'crayon', status: OFF_REFRESH_REGIME },
      { cell: 'crayon', status: UNSCOREABLE },
      { cell: 'crayon', status: 'valid-json' },
    ];

    expect(OFF_REFRESH_REGIME).not.toBe(UNSCOREABLE);
    expect(attemptsFor(rows, 'crayon')).toBe(2);
  });
});

// A capture can hold its declared beat for most frames and still spend sustained
// stretches at the other rate — an adaptive panel shifting mid-capture. Scored
// against one dominant beat, every frame of such a stretch is charged ~half its
// duration as lost time while the display presents perfectly steadily.
describe('regimeMixture', () => {
  const at120 = (n) => Array(n).fill(8.3);
  const at60 = (n) => Array(n).fill(16.7);

  it('measures sustained minority runs and ignores isolated other-band frames', () => {
    // Isolated 16.7s at a 120 Hz beat are indistinguishable from genuinely
    // dropped frames, and charging those is CORRECT — they must not count.
    const isolated = [...at120(50), 16.7, ...at120(50), 16.7, ...at120(50)];
    expect(regimeMixture(isolated).sustainedMinorityShare).toBe(0);

    // Three or more consecutive mean the panel actually presented there.
    const sustained = [...at120(100), ...at60(10), ...at120(90)];
    expect(regimeMixture(sustained).sustainedMinorityShare).toBe(0.05);
    expect(regimeMixture(sustained).minorityRegime).toBe('60hz');
  });

  it('returns null with nothing to measure', () => {
    expect(regimeMixture([])).toBeNull();
    expect(regimeMixture(undefined)).toBeNull();
  });
});

describe('the mixed-regime verdict', () => {
  const mixed = { sustainedMinorityShare: 0.043, minorityRegime: '60hz' };
  const clean = { sustainedMinorityShare: 0.007, minorityRegime: '60hz' };

  // The 2026-08-23 vigorous-hand Safari capture: dominant 8 ms, 4.31% of
  // in-contact frames in sustained 60 Hz runs (the longest is 73 frames). Its
  // 5.6% "lost" reading is mostly those runs charged against the 120 Hz beat.
  it('demotes an in-regime verdict carrying sustained minority presentation', () => {
    const verdict = refreshRegimeVerdict(8, '120hz', mixed);

    expect(verdict).toMatchObject({
      verdict: 'mixed-regime',
      matched: false,
      scoreable: false,
    });
    expect(describeRefreshRegime(verdict)).toContain('mixed presentation');
    expect(describeRefreshRegime(verdict)).toContain('4.3%');
  });

  it('passes a clean capture and one at the calibrated boundary', () => {
    expect(refreshRegimeVerdict(8, '120hz', clean).verdict).toBe('in-regime');
    expect(refreshRegimeVerdict(8, '120hz', { sustainedMinorityShare: 0.015 }).verdict).toBe(
      'in-regime'
    );
  });

  // Mixture only DEMOTES an in-regime answer: off-regime and unestablished
  // already carry their own responses (retry / bank), and a capture without the
  // field is judged exactly as it was banked.
  it('changes nothing off-regime, unestablished, or pre-field', () => {
    expect(refreshRegimeVerdict(8, '60hz', mixed).verdict).toBe('off-regime');
    expect(refreshRegimeVerdict(8, null, mixed).verdict).toBe('unestablished');
    expect(refreshRegimeVerdict(8, '120hz').verdict).toBe('in-regime');
    expect(refreshRegimeVerdict(8, '120hz', null).verdict).toBe('in-regime');
  });
});

// The threshold is calibrated from the tracked corpora, so the calibration is
// pinned to them: every machine-driven scored capture must sit at or under the
// boundary, and the known mixed-presentation captures above it. If either side
// drifts, the threshold's evidence has changed and it must be re-derived, not
// widened.
describe('the mixture threshold holds against the tracked corpora', () => {
  const mixtureOf = (campaign, file) => {
    const capture = JSON.parse(readFileSync(join(EVIDENCE, campaign, file), 'utf8'));
    const deltas = (capture.report?.frames ?? []).filter((f) => f[2] === 1).map((f) => f[1]);
    return regimeMixture(deltas);
  };

  it('sits above every machine-driven scored capture', () => {
    for (const [campaign, file] of [
      ['2026-08-23-android-split', 'android-device-web-crayon.json'],
      ['2026-08-24-android-web-magic-over-gate', 'android-device-web-magic.json'],
      ['2026-08-23-ipad-main', 'ipad-device-web-pen.json'],
      ['2026-08-25-campaign-1322-android', 'android-device-web-pen.json'],
    ]) {
      const mixture = mixtureOf(campaign, file);
      expect(mixture.sustainedMinorityShare, `${campaign}/${file}`).toBeLessThanOrEqual(
        MIXED_REGIME_SUSTAINED_SHARE_MAX
      );
    }
  });

  it('sits below the known mixed-presentation captures', () => {
    for (const [campaign, file] of [
      ['2026-08-23-hand', 'ios-safari-b.json'],
      ['2026-08-23-hand', 'android-chrome-d-clean.json'],
    ]) {
      const mixture = mixtureOf(campaign, file);
      expect(mixture.sustainedMinorityShare, `${campaign}/${file}`).toBeGreaterThan(
        MIXED_REGIME_SUSTAINED_SHARE_MAX
      );
    }
  });
});
