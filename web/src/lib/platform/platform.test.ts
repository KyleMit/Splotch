import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPlatform, isAndroidChromium } from './index';

const originalCapacitor = globalThis.Capacitor;

afterEach(() => {
  globalThis.Capacitor = originalCapacitor;
});

describe('getPlatform', () => {
  it.each(['android', 'ios'] as const)('returns the supported native platform %s', (platform) => {
    globalThis.Capacitor = { getPlatform: () => platform };

    expect(getPlatform()).toBe(platform);
  });

  it('returns web when Capacitor reports an unexpected platform', () => {
    globalThis.Capacitor = { getPlatform: () => 'unexpected' };

    expect(getPlatform()).toBe('web');
  });

  it('returns web when Capacitor is unavailable', () => {
    globalThis.Capacitor = undefined;

    expect(getPlatform()).toBe('web');
  });
});

describe('isAndroidChromium', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    {
      runtime: 'Android Chrome',
      ua: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Mobile Safari/537.36',
      expected: true,
    },
    {
      runtime: 'Samsung Internet',
      ua: 'Mozilla/5.0 (Linux; Android 14; SM-G990U1) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
      expected: true,
    },
    {
      runtime: 'Android Firefox',
      ua: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
      expected: false,
    },
    {
      runtime: 'desktop Chrome',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
      expected: false,
    },
    {
      runtime: 'iPad Safari',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Safari/605.1.15',
      expected: false,
    },
  ])('is $expected for $runtime', ({ ua, expected }) => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua);

    expect(isAndroidChromium()).toBe(expected);
  });
});
