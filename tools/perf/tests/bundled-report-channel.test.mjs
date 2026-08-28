import { describe, expect, it } from 'vitest';
import {
  bundledReportPayloadProblem,
  iosBundledPageProblem,
  reportStringFromPreferences,
} from '../ios/bundled-report-channel.mjs';

const NONCE = '7f16d248-63df-4ba2-81d4-fb27ef0a40e2';
const PAGE_URL = `capacitor://localhost/?perf-run=1`;

function payload() {
  return {
    schema: 1,
    nonce: NONCE,
    pageUrl: PAGE_URL,
    userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15 Mobile/15E148',
    report: {
      meta: {
        ua: 'Mozilla/5.0 AppleWebKit/605.1.15 Mobile/15E148',
        counts: { frames: 2, events: 1, measures: 1 },
      },
      frames: [{ at: 1 }, { at: 2 }],
      events: [{ type: 'pointerdown' }],
      measures: [{ name: 'engine.draw' }],
    },
  };
}

describe('bundled iOS page identity', () => {
  it('accepts only the configured bundled Capacitor origin', () => {
    expect(iosBundledPageProblem(PAGE_URL)).toBeNull();
    expect(iosBundledPageProblem('http://192.168.1.2:4185/')).toMatch(/not the bundled/);
  });
});

describe('Preferences extraction', () => {
  it('finds the nonce without restating the Capacitor Preferences group prefix', () => {
    expect(
      reportStringFromPreferences({ [`CapacitorStorage.${NONCE}`]: '{"ok":true}' }, NONCE)
    ).toBe('{"ok":true}');
  });

  it('refuses an absent or ambiguous nonce', () => {
    expect(() => reportStringFromPreferences({}, NONCE)).toThrow(/contained 0/);
    expect(() =>
      reportStringFromPreferences({ [NONCE]: '{}', [`CapacitorStorage.${NONCE}`]: '{}' }, NONCE)
    ).toThrow(/contained 2/);
  });
});

describe('pulled report validation', () => {
  it('accepts exact nonce, page, table counts, and UTF-8 byte size', () => {
    const value = payload();
    expect(
      bundledReportPayloadProblem(value, {
        nonce: NONCE,
        bytes: Buffer.byteLength(JSON.stringify(value)),
        pageUrl: PAGE_URL,
      })
    ).toBeNull();
  });

  it.each([
    ['stale nonce', (value) => (value.nonce = crypto.randomUUID()), /report nonce/],
    ['remote page', (value) => (value.pageUrl = 'http://192.168.1.2/'), /report page/],
    ['contradictory UA', (value) => (value.report.meta.ua = 'Safari'), /disagree/],
    ['truncated table', (value) => value.report.frames.pop(), /frames has 1 rows/],
  ])('refuses a %s', (_name, mutate, expected) => {
    const value = payload();
    mutate(value);
    expect(
      bundledReportPayloadProblem(value, {
        nonce: NONCE,
        bytes: Buffer.byteLength(JSON.stringify(value)),
        pageUrl: PAGE_URL,
      })
    ).toMatch(expected);
  });

  it('refuses a byte count that proves the Preferences value was truncated', () => {
    const value = payload();
    expect(
      bundledReportPayloadProblem(value, {
        nonce: NONCE,
        bytes: Buffer.byteLength(JSON.stringify(value)) + 1,
        pageUrl: PAGE_URL,
      })
    ).toMatch(/not the page's/);
  });
});
