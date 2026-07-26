// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { osLabelFromUserAgent } from './platform';

describe('osLabelFromUserAgent', () => {
  it.each([
    ['', ''],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9)', 'Android 15'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)', 'iOS 18.5'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_6)', 'macOS 14.7.6'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Windows 10/11'],
    ['Mozilla/5.0 (Windows NT 6.1; Win64; x64)', 'Windows (NT 6.1)'],
    ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', 'ChromeOS'],
    ['Mozilla/5.0 (X11; Linux x86_64)', 'Linux'],
    ['unknown', ''],
  ])('maps %s to %s', (userAgent, expected) => {
    expect(osLabelFromUserAgent(userAgent)).toBe(expected);
  });
});
