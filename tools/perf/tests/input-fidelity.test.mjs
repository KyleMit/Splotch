import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../../lib/proc.mjs';
import { CAMPAIGN_TARGETS } from '../lib/campaign-plan.mjs';
import {
  CAPTURE_RUNTIMES,
  DEFAULT_CAPTURE_RUNTIME,
  captureRuntime,
  describeFidelityFailures,
  inputFidelity,
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

  // The measurement this whole split rests on: same device, same night, same
  // gesture at the same cadence, and the two runtimes disagree only on how they
  // package the samples. Safari coalesces nothing; the WKWebView coalesces about
  // one sample per move. If this stops holding, the table is describing a runtime
  // that has changed and the entry has to be re-measured rather than widened.
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

  // The WKWebView's own coalescing expectation is UNCALIBRATED, so the runtime does
  // not pass — and must not, until a known-bad WKWebView capture establishes what
  // separates a driven capture from an under-driven one there. Everything else about
  // these captures is faithful, which is exactly the distinction `uncalibrated`
  // exists to make: the instrument is silent, the capture is not bad.
  it('holds the WKWebView unscoreable on coalescing alone', () => {
    for (const sample of verdicts.filter((v) => v.target === 'ipad-device-native')) {
      expect({ cell: `${sample.target}/${sample.brush}`, ...sample.fidelity }).toMatchObject({
        passed: false,
        uncalibrated: ['coalescing'],
        checks: { trustedTouch: true, cadence: true, pressure: true, contactGeometry: true },
      });
    }
  });

  // The negative control that stopped `> 0` being adopted: an under-driven Android
  // Capacitor WebView at 47.81 contact moves/s also reported more than zero
  // coalesced samples, so an inverted expectation would have passed exactly the
  // capture it exists to reject.
  it('records why more-than-zero coalescing is not a discriminator', () => {
    const underDrivenWebView = {
      kinds: 'touch',
      trust: { share: 1 },
      movesPerSecond: 47.81,
      moveGapP95Ms: 40,
      coalescedPerMove: 1.05,
    };

    expect(inputFidelity(underDrivenWebView, 'ios-capacitor-webview').checks.coalescing).toBeNull();
    expect(inputFidelity(underDrivenWebView, 'ios-capacitor-webview').passed).toBe(false);
  });

  // The Safari entry is untouched by any of that: it still has to reject a capture
  // whose samples arrive coalesced, which is what catches an under-driven
  // WebDriverAgent transport there.
  it('still rejects a coalescing capture judged as Safari', () => {
    const webview = verdicts.find((v) => v.target === 'ipad-device-native');

    expect(inputFidelity(webview.input, 'ios-safari').checks.coalescing).toBe(false);
  });
});

describe('the runtimes with no hand capture behind them', () => {
  const android = verdictsFor('2026-08-23-android-split');

  // Android keeps failing, exactly as it did before the table was split — issue
  // 1218 is the hand capture that closes it. What changes is that the verdict now
  // says the instrument is silent rather than implying the capture was bad, and an
  // uncalibrated check must never read as a pass: doing so would bank the very
  // cells the split transport exists to stop producing.
  it('reports Android Chrome as uncalibrated rather than failed, and does not pass it', () => {
    expect(android).toHaveLength(4);
    for (const sample of android) {
      expect(sample.input.movesPerSecond).toBeGreaterThan(100);
      expect(sample.fidelity.passed).toBe(false);
      expect(sample.fidelity.checks).toMatchObject({ trustedTouch: true, cadence: true });
      expect(sample.fidelity.uncalibrated).toEqual(['coalescing', 'pressure', 'contactGeometry']);
      expect(describeFidelityFailures(sample.fidelity)).toBe(
        'coalescing(uncalibrated)+pressure(uncalibrated)+contactGeometry(uncalibrated)'
      );
    }
  });

  it('names the failing check apart from the uncalibrated ones', () => {
    const underDriven = inputFidelity(
      { kinds: 'touch', trust: { share: 1 }, movesPerSecond: 46.8, moveGapP95Ms: 40 },
      'android-chrome'
    );

    expect(underDriven.passed).toBe(false);
    expect(describeFidelityFailures(underDriven)).toBe(
      'cadence+coalescing(uncalibrated)+pressure(uncalibrated)+contactGeometry(uncalibrated)'
    );
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
