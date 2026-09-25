import { describe, expect, it } from 'vitest';
import {
  PERF_RUN_PARAM,
  captureAgeDays,
  isCaptureDate,
  perfRunEpoch,
  sectionCapturedOn,
} from '../lib/capture-date.mjs';

const loaded = (url) => ({ automation: { loadedUrl: url } });

describe('perfRunEpoch', () => {
  it('reads the wall-clock stamp an XCUITest drawing capture loads', () => {
    expect(perfRunEpoch(loaded('http://<lan-host>:4173/?perf-run=1790140148608'))).toBe(
      1790140148608
    );
  });

  it('reads the stamp beside other query parameters and a fragment', () => {
    expect(perfRunEpoch(loaded(`capacitor://localhost/?a=1&${PERF_RUN_PARAM}=42#x`))).toBe(42);
  });

  it('returns null for an artifact that records no stamp', () => {
    expect(perfRunEpoch({})).toBeNull();
    expect(perfRunEpoch(loaded('http://host/?perf-runs=5'))).toBeNull();
    expect(perfRunEpoch(loaded('http://host/?perf-run=soon'))).toBeNull();
  });
});

describe('sectionCapturedOn', () => {
  it('dates a section by its oldest stamped artifact, as a UTC day', () => {
    const artifacts = [
      loaded(`http://h/?perf-run=${Date.parse('2026-09-23T03:00:00Z')}`),
      loaded(`http://h/?perf-run=${Date.parse('2026-09-22T23:30:00Z')}`),
      {},
    ];

    expect(sectionCapturedOn(artifacts, '2026-09-24')).toBe('2026-09-22');
  });

  // The fold date is the fallback: Android, desktop, and action transports
  // record no stamp, and a fold can run days after its capture.
  it('falls back to the fold date when no artifact is stamped', () => {
    expect(sectionCapturedOn([{}, null], '2026-09-24')).toBe('2026-09-24');
  });
});

describe('isCaptureDate', () => {
  it('accepts a real calendar day and refuses anything else', () => {
    expect(isCaptureDate('2026-09-24')).toBe(true);
    expect(isCaptureDate('2026-02-30')).toBe(false);
    expect(isCaptureDate('2026-9-24')).toBe(false);
    expect(isCaptureDate(20260924)).toBe(false);
  });
});

describe('captureAgeDays', () => {
  it('counts whole days between two dates', () => {
    expect(captureAgeDays('2026-08-28', '2026-09-24')).toBe(27);
    expect(captureAgeDays('2026-09-24', '2026-09-24')).toBe(0);
  });

  it('has no age for a missing or malformed date', () => {
    expect(captureAgeDays(undefined, '2026-09-24')).toBeNull();
    expect(captureAgeDays('2026-09-24', 'today')).toBeNull();
  });
});
