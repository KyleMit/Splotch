import { describe, expect, it } from 'vitest';
import { benchmarkEntries, seriesName } from '../lib/benchmark-series.mjs';
import { TODDLER_SESSION_BEATS, TODDLER_SESSION_SUITE } from '../lib/toddler-session.mjs';

const summary = {
  settings: {
    target: 'android-webview',
    suite: TODDLER_SESSION_SUITE,
    scenarios: TODDLER_SESSION_BEATS,
  },
  engineHotPaths: [{ name: 'engine.commit', count: 12, totalMs: 60, avgMs: 5, maxMs: 18.456 }],
  longTasks: { count: 3, totalMs: 210.5, longestMs: 120 },
  frames: { fps: 58.2, count: 900, longFrames: 4 },
};

describe('seriesName', () => {
  it('keys a series on target and suite', () => {
    expect(seriesName(summary.settings)).toBe('android-webview/toddler-session');
  });

  // A point from a run with no suite label could land on any chart; refusing
  // it is what keeps fast and full results on separate series.
  it('refuses a summary with no suite label', () => {
    expect(() => seriesName({ target: 'ios-webkit' })).toThrow(/suite is missing/);
    expect(() => seriesName({})).toThrow(/target is missing/);
  });
});

describe('benchmarkEntries', () => {
  it('emits smaller-is-better entries prefixed with the series', () => {
    expect(benchmarkEntries(summary)).toEqual([
      {
        name: 'android-webview/toddler-session · engine.commit max',
        unit: 'ms',
        value: 18.46,
        extra: '12 samples',
      },
      { name: 'android-webview/toddler-session · engine.commit avg', unit: 'ms', value: 5 },
      {
        name: 'android-webview/toddler-session · long tasks total',
        unit: 'ms',
        value: 210.5,
        extra: '3 tasks',
      },
      { name: 'android-webview/toddler-session · long frames (>32 ms)', unit: 'frames', value: 4 },
    ]);
  });

  it('refuses an empty summary instead of appending a zero point', () => {
    expect(() => benchmarkEntries({ settings: summary.settings })).toThrow(/uninstrumented/);
  });
});
