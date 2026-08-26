import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { CAMPAIGN_TARGETS } from '../lib/campaign-plan.mjs';
import { summarizeRun } from '../lib/real-screen-stats.mjs';
import {
  CAPTURE_RUNTIMES,
  DEFAULT_CAPTURE_RUNTIME,
  captureRuntime,
  describeFidelityFailures,
  inputFidelity,
  numberInvalidatingFailure,
} from '../lib/input-fidelity.mjs';

const EVIDENCE = join(ROOT, 'perf-profiles', 'evidence');

// The verdict is a claim about real runtimes, so it is exercised against real
// captures. A hand-written fixture cannot go stale against a runtime that changed
// what it reports; the tracked corpus can, which is the whole point of tracking it
// (ADR-0138). Every threshold in the table was read off these files.
function corpusInputs(campaign) {
  const index = JSON.parse(readFileSync(join(EVIDENCE, campaign, 'index.json'), 'utf8'));
  return index.kept.map((entry) => {
    const capture = JSON.parse(readFileSync(join(EVIDENCE, campaign, entry.file), 'utf8'));
    return {
      target: entry.target,
      brush: entry.brush,
      input: capture.summaries?.phases?.[0]?.input ?? {},
    };
  });
}

function verdictsFor(campaign) {
  return corpusInputs(campaign).map((sample) => ({
    ...sample,
    fidelity: inputFidelity(sample.input, CAMPAIGN_TARGETS[sample.target].captureRuntime),
  }));
}

describe('captureRuntime', () => {
  it('names a runtime for each platform and shell the capture drivers can open', () => {
    expect(captureRuntime('iOS', false)).toBe('ios-safari');
    expect(captureRuntime('iOS', true)).toBe('ios-capacitor-webview');
    expect(captureRuntime('Android', false)).toBe('android-chrome');
    expect(captureRuntime('Android', true)).toBe('android-capacitor-webview');
  });

  // Appium negotiates `platformName` back in whatever case the driver chose, and a
  // case mismatch would silently file every iPad capture under the Android table.
  it('reads platformName case-insensitively', () => {
    expect(captureRuntime('ios', false)).toBe('ios-safari');
    expect(captureRuntime('IOS', true)).toBe('ios-capacitor-webview');
  });
});

describe('every campaign target names a runtime the table knows', () => {
  it.each(Object.entries(CAMPAIGN_TARGETS))('%s', (_id, target) => {
    expect(CAPTURE_RUNTIMES).toContain(target.captureRuntime);
  });
});

describe('the 2026-08-23 iPad corpus', () => {
  const verdicts = verdictsFor('2026-08-23-ipad-main');

  // The bundled-delivery legs of the issue-1303 table, pinned to the corpus that
  // measured them: at matched cadence on the same device the same night, Safari
  // (remote HTTP) reports an empty coalesced-events list while the bundled
  // WKWebView reports a populated one (~1 per move — the event itself, plus
  // occasional doubles). This corpus fact is the evidence the check's retirement
  // rests on; if it stops holding, the retirement's premises have changed.
  it('separates Safari from the Capacitor WKWebView on coalescing alone', () => {
    const safari = verdicts.filter((v) => v.target === 'ipad-device-web');
    const webview = verdicts.filter((v) => v.target === 'ipad-device-native');

    expect(safari).toHaveLength(4);
    expect(webview).toHaveLength(4);
    for (const sample of safari) expect(sample.input.coalescedPerMove).toBe(0);
    for (const sample of webview) expect(sample.input.coalescedPerMove).toBeGreaterThan(0);
    for (const sample of [...safari, ...webview]) {
      expect(sample.input.movesPerSecond).toBeGreaterThan(100);
      expect(sample.input.movesPerSecond).toBeLessThan(170);
    }
  });

  it('passes Safari with nothing left uncalibrated', () => {
    for (const sample of verdicts.filter((v) => v.target === 'ipad-device-web')) {
      expect({ cell: `${sample.target}/${sample.brush}`, ...sample.fidelity }).toMatchObject({
        passed: true,
        uncalibrated: [],
      });
    }
  });

  // These four captures were held unscoreable by coalescing alone — first by a
  // Safari-shaped `=== 0`, then by an UNCALIBRATED entry awaiting a known-bad
  // capture. The delivery experiments (issue 1303) showed the value tracks page
  // delivery rather than input, so the check is retired everywhere and the same
  // banked captures now pass on the checks that do discriminate.
  it('passes the WKWebView with coalescing excluded as a named witness', () => {
    for (const sample of verdicts.filter((v) => v.target === 'ipad-device-native')) {
      expect({ cell: `${sample.target}/${sample.brush}`, ...sample.fidelity }).toMatchObject({
        passed: true,
        uncalibrated: [],
        checks: { trustedTouch: true, cadence: true, pressure: true, contactGeometry: true },
      });
      expect(sample.fidelity.notApplicable).toContain('coalescing');
    }
  });

  // The negative control that stopped `> 0` being adopted, kept as history: an
  // under-driven Android Capacitor WebView at 47.81 contact moves/s also reported
  // more than zero coalesced samples, so an inverted expectation would have
  // passed exactly the capture it exists to reject. Under the retirement the
  // check is asked of no runtime — and the under-driven capture is still refused,
  // by cadence, which is the check that actually discriminates.
  it('records why more-than-zero coalescing is not a discriminator', () => {
    const underDrivenWebView = {
      kinds: 'touch',
      trust: { share: 1 },
      movesPerSecond: 47.81,
      moveGapP95Ms: 40,
      coalescedPerMove: 1.05,
    };
    const verdict = inputFidelity(underDrivenWebView, 'ios-capacitor-webview');

    expect(Object.keys(verdict.checks)).not.toContain('coalescing');
    expect(verdict.passed).toBe(false);
    expect(describeFidelityFailures(verdict)).toContain('cadence');
  });
});

// Recomputed from the RAW event rows rather than read from each capture's stored
// summary. The summary is what the runner wrote; the rows are what the device
// reported, and the whole argument for removing three checks is about what the
// device reports.
function handCorpus() {
  const campaign = '2026-08-23-hand';
  const index = JSON.parse(readFileSync(join(EVIDENCE, campaign, 'index.json'), 'utf8'));
  return index.kept.map((entry) => {
    const capture = JSON.parse(readFileSync(join(EVIDENCE, campaign, entry.file), 'utf8'));
    return {
      file: entry.file,
      // The hand tool records the runtime top-level; the driven runner records it
      // only inside the verdict. Reading one of them silently drops the control.
      runtime: capture.runtime ?? capture.fidelity?.runtime,
      byHand: capture.transport === 'human-finger',
      input: summarizeRun(capture.report).phases?.[0]?.input ?? {},
    };
  });
}

// The justification for `android-chrome`'s three NOT_APPLICABLE entries is an
// equivalence between what a real finger reports and what synthesized touch
// reports. Asserting the entries alone would let someone delete the control, or
// the whole corpus, without a test noticing — leaving three checks removed on
// evidence that no longer exists.
describe('the evidence that removed three Android checks', () => {
  const corpus = handCorpus().filter((sample) => sample.runtime === 'android-chrome');
  const hands = corpus.filter((sample) => sample.byHand);
  const controls = corpus.filter((sample) => !sample.byHand);
  const silent = (sample) => ({
    pressure: sample.input.pressure?.p50,
    width: sample.input.contactWidth?.p50,
    height: sample.input.contactHeight?.p50,
    coalesced: sample.input.coalescedPerMove,
  });

  it('still holds both sides of the comparison', () => {
    expect(hands.length).toBeGreaterThanOrEqual(3);
    expect(controls.length).toBeGreaterThanOrEqual(1);
  });

  // The claim is not "these values are 1/0/0/0". It is that a hand and a robot are
  // INDISTINGUISHABLE here, which is what makes the checks carry no information.
  it('reports the three silent checks identically for a hand and for a robot', () => {
    const distinct = new Set(corpus.map((sample) => JSON.stringify(silent(sample))));

    expect([...distinct]).toHaveLength(1);
    expect(silent(hands[0])).toEqual({ pressure: 1, width: 0, height: 0, coalesced: 0 });
  });

  // And the checks that were KEPT must still separate them from a bad capture:
  // every one of these was driven properly, by hand or by adb.
  it('keeps a check that the same corpus can still pass', () => {
    for (const sample of corpus) {
      expect(sample.input.kinds, sample.file).toBe('touch');
      expect(sample.input.trust?.share, sample.file).toBe(1);
      expect(sample.input.movesPerSecond, sample.file).toBeGreaterThan(100);
    }
  });
});

describe('the runtime the 2026-08-23 hand corpus calibrated', () => {
  const android = verdictsFor('2026-08-23-android-split');

  // Android Chrome reports pressure 1, no contact geometry and 0 coalesced
  // samples for a real finger and for `adb shell input` alike, measured on the
  // same phone the same night. Three checks that answer identically however the
  // touch was made cannot tell the two apart, so they are not asked here — which
  // is what makes these four captures scoreable at last.
  it('passes a well-driven Android Chrome capture once its silent checks are named', () => {
    expect(android).toHaveLength(4);
    for (const sample of android) {
      expect(sample.input.movesPerSecond).toBeGreaterThan(100);
      expect(sample.fidelity.passed).toBe(true);
      expect(sample.fidelity.checks).toEqual({ trustedTouch: true, cadence: true });
      expect(sample.fidelity.notApplicable).toEqual(['coalescing', 'pressure', 'contactGeometry']);
      expect(describeFidelityFailures(sample.fidelity)).toBe('');
    }
  });

  // The whole point of narrowing the verdict is that what remains still rejects
  // the capture the campaign opened by finding.
  it('still refuses the under-driven transport this campaign rejected', () => {
    const underDriven = inputFidelity(
      { kinds: 'touch', trust: { share: 1 }, movesPerSecond: 46.8, moveGapP95Ms: 40 },
      'android-chrome'
    );

    expect(underDriven.passed).toBe(false);
    expect(describeFidelityFailures(underDriven)).toBe('cadence');
  });

  // A not-applicable check is absent rather than present-and-true. Recording it
  // as a pass would let a reader believe the runtime answered a question it was
  // never asked.
  it('omits a not-applicable check instead of passing it', () => {
    const verdict = inputFidelity(
      { kinds: 'touch', trust: { share: 1 }, movesPerSecond: 154.63, moveGapP95Ms: 16.5 },
      'android-chrome'
    );

    expect(Object.keys(verdict.checks)).toEqual(['trustedTouch', 'cadence']);
    expect(verdict.uncalibrated).toEqual([]);
  });

  // Retiring the ceiling removed the gate's only finiteness guard. A capture whose
  // window collapsed reports a non-finite rate, and the floor alone says yes to it
  // — so the check that decides scoreability was more permissive than the
  // diagnostic that merely describes.
  it('refuses a rate that is not a finite measurement', () => {
    for (const movesPerSecond of [Infinity, NaN, undefined, null]) {
      const verdict = inputFidelity(
        { kinds: 'touch', trust: { share: 1 }, movesPerSecond, moveGapP95Ms: 1 },
        'android-chrome'
      );

      expect(verdict.checks.cadence, String(movesPerSecond)).toBe(false);
      expect(verdict.passed, String(movesPerSecond)).toBe(false);
    }
  });

  it('refuses a gap that is not a finite measurement', () => {
    const verdict = inputFidelity(
      { kinds: 'touch', trust: { share: 1 }, movesPerSecond: 154, moveGapP95Ms: Infinity },
      'android-chrome'
    );

    expect(verdict.checks.cadence).toBe(false);
  });

  // Both hand captures that exceed the retired 170 ceiling are real fingers on
  // real hardware — 178.0 on the phone, 268.4 on the iPad. A gate that rejects
  // its own reference input is measuring the digitizer, not the fidelity.
  it('accepts the rates a real hand actually produced on both devices', () => {
    const phone = inputFidelity(
      { kinds: 'touch', trust: { share: 1 }, movesPerSecond: 177.97, moveGapP95Ms: 16.7 },
      'android-chrome'
    );
    const ipad = inputFidelity(
      {
        kinds: 'touch',
        trust: { share: 1 },
        movesPerSecond: 268.39,
        moveGapP95Ms: 16,
        coalescedPerMove: 0,
        pressure: { p50: 0 },
        contactWidth: { p50: 83.42 },
        contactHeight: { p50: 83.42 },
      },
      'ios-safari'
    );

    expect(phone.checks.cadence).toBe(true);
    expect(ipad.passed).toBe(true);
  });
});

describe('a capture with no recorded runtime', () => {
  const calibratedSafari = {
    kinds: 'touch',
    movesPerSecond: 121,
    moveGapP95Ms: 9,
    coalescedPerMove: 0,
    trust: { share: 1 },
    pressure: { p50: 0 },
    contactWidth: { p50: 73.76 },
    contactHeight: { p50: 73.76 },
  };

  // Every threshold here was originally set from Safari on the iPad, so an
  // artifact written before the runtime was recorded has to keep scoring the way
  // it did — otherwise splitting the table silently rewrites history.
  it('is judged as iPad Safari', () => {
    expect(DEFAULT_CAPTURE_RUNTIME).toBe('ios-safari');
    expect(inputFidelity(calibratedSafari).passed).toBe(true);
    expect(inputFidelity(calibratedSafari, 'ios-safari')).toEqual(inputFidelity(calibratedSafari));
  });

  it('still rejects untrusted input', () => {
    expect(inputFidelity({ ...calibratedSafari, trust: { share: 0 } }).passed).toBe(false);
  });
});

describe('an unknown runtime', () => {
  // Falling back to a default here is what the whole change exists to stop: it
  // would score a capture against a table nobody chose for it.
  it('throws rather than picking a table', () => {
    expect(() => inputFidelity({}, 'ipad-simulator')).toThrow(/Unknown capture runtime/);
  });
});

// Whether a failed verdict invalidates the NUMBERS or only the per-runtime
// calibration. Owned here rather than restated in evidence selection (stack
// 1353's second review round), with two branches keyed on whether the verdict
// can speak for itself.
describe('numberInvalidatingFailure', () => {
  it('says nothing about a pass or an absent verdict', () => {
    expect(numberInvalidatingFailure({ passed: true, checks: { cadence: true } })).toBe(false);
    expect(numberInvalidatingFailure(null)).toBe(false);
    expect(numberInvalidatingFailure(undefined)).toBe(false);
  });

  // A modern verdict carries `uncalibrated`: a failure confined to those
  // checks is a silent instrument, anything else failed a calibrated
  // expectation — including a per-runtime check like pressure, whose modern
  // failure acceptance also scores as unscoreable.
  it('splits a modern verdict by its own calibrated/uncalibrated record', () => {
    expect(
      numberInvalidatingFailure({
        passed: false,
        checks: { trustedTouch: true, cadence: true, coalescing: null },
        uncalibrated: ['coalescing'],
      })
    ).toBe(false);
    expect(
      numberInvalidatingFailure({
        passed: false,
        checks: { trustedTouch: true, cadence: true, pressure: false, coalescing: null },
        uncalibrated: ['coalescing'],
      })
    ).toBe(true);
    expect(
      numberInvalidatingFailure({
        passed: false,
        checks: { trustedTouch: true, cadence: false },
        uncalibrated: [],
      })
    ).toBe(true);
  });

  // A legacy verdict predates the field, and deriving from it would strand the
  // whole banked corpus: the stable universal pair decides. The android-split
  // shape (pressure/contactGeometry failed under the old table, cadence true)
  // must NOT invalidate, and a legacy cadence failure must.
  it('falls back to the stable trustedTouch/cadence pair for a legacy verdict', () => {
    expect(
      numberInvalidatingFailure({
        passed: false,
        checks: { trustedTouch: true, cadence: true, pressure: false, contactGeometry: false },
      })
    ).toBe(false);
    expect(
      numberInvalidatingFailure({ passed: false, checks: { trustedTouch: true, cadence: false } })
    ).toBe(true);
    expect(
      numberInvalidatingFailure({ passed: false, checks: { trustedTouch: false, cadence: true } })
    ).toBe(true);
  });
});
