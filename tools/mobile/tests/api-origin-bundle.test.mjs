import { expect, it } from 'vitest';
import { assertNativeApiOrigin } from '../verify-api-origin.mjs';
import apiOrigin from '../api-origin.cjs';

it.each(['utf8', 'utf16le'])(
  'guards the complete embedded %s native bundle and rejects a seeded test hostname',
  (encoding) => {
    const store = Buffer.from(
      'Hermes strings https://splotch.art/api/report https://splotch.art/coloring/',
      encoding
    );
    expect(() => assertNativeApiOrigin(store, 'https://splotch.art', true)).not.toThrow();
    for (const origin of apiOrigin.TEST_API_ORIGINS) {
      const wrong = Buffer.concat([store, Buffer.from(origin, encoding)]);
      expect(() => assertNativeApiOrigin(wrong, 'https://splotch.art', true)).toThrow('test host');
      expect(() => assertNativeApiOrigin(wrong, 'https://splotch.art', false)).toThrow('test host');
    }
  }
);

it('rejects a missing configured origin and allows a deliberately test-pointed dev Release', () => {
  const test = Buffer.from('https://test.splotch.art');
  expect(() => assertNativeApiOrigin(test, 'https://test.splotch.art', false)).not.toThrow();
  expect(() => assertNativeApiOrigin(test, 'https://splotch.art', true)).toThrow('configured');
});
