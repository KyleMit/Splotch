import { afterEach, describe, expect, it } from 'vitest';
import { getPlatform } from './index';

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
