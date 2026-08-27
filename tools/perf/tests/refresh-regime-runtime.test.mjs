import { describe, expect, it } from 'vitest';

import { CAMPAIGN_TARGETS } from '../lib/campaign-plan.mjs';
import { refreshRegimeVerdict, soleExpectedRegimeForRuntime } from '../lib/refresh-regime.mjs';

describe('soleExpectedRegimeForRuntime', () => {
  it('resolves a runtime whose targets declare exactly one expectation', () => {
    // ios-safari serves the physical iPad (60hz) and the simulator (none), so
    // there is exactly one declared expectation and it is unambiguous.
    expect(soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, 'ios-safari')).toBe('60hz');
    expect(soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, 'ios-capacitor-webview')).toBe('60hz');
  });

  it('refuses to guess when a runtime’s targets disagree', () => {
    // android-chrome is 60 Hz emulated and 120 Hz on the phone. Picking either
    // would fail correct captures of the other, so it stays unresolved and the
    // caller has to say which.
    expect(soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, 'android-chrome')).toBeNull();
    expect(soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, 'desktop-playwright')).toBeNull();
  });

  it('resolves nothing for a runtime no target declares', () => {
    expect(soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, 'not-a-runtime')).toBeNull();
  });
});

describe('the beat a capture is charged against', () => {
  it('refuses a 120 Hz capture filling a 60 Hz cell', () => {
    // The 2026-08-27 case: one Safari capture presented at 120 Hz among eight at
    // 60 Hz and scored 2.25% against siblings at ~0.6%. lostFrameTimeShare is a
    // share of the beat, so that is the display, not the app.
    const verdict = refreshRegimeVerdict(
      8,
      soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, 'ios-safari')
    );

    expect(verdict.observed).toBe('120hz');
    expect(verdict.matched).toBe(false);
  });

  it('accepts a capture holding the regime its runtime is held to', () => {
    const verdict = refreshRegimeVerdict(
      17,
      soleExpectedRegimeForRuntime(CAMPAIGN_TARGETS, 'ios-safari')
    );

    expect(verdict.observed).toBe('60hz');
    expect(verdict.matched).toBe(true);
  });
});
