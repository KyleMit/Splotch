import { afterEach, describe, expect, it, vi } from 'vitest';
import { supportsOrientationLock } from './index';

const originalCapacitor = globalThis.Capacitor;
const originalOrientation = Object.getOwnPropertyDescriptor(Screen.prototype, 'orientation');

function stubScreen({
  lockable,
  width,
  height,
}: {
  lockable: boolean;
  width: number;
  height: number;
}) {
  Object.defineProperty(Screen.prototype, 'orientation', {
    configurable: true,
    get: () => (lockable ? { lock: () => Promise.resolve(), unlock: () => {} } : {}),
  });
  vi.spyOn(window.screen, 'width', 'get').mockReturnValue(width);
  vi.spyOn(window.screen, 'height', 'get').mockReturnValue(height);
}

function stubPointer(coarse: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) => ({ matches: coarse && query === '(pointer: coarse)' }) as MediaQueryList
  );
}

afterEach(() => {
  globalThis.Capacitor = originalCapacitor;
  if (originalOrientation)
    Object.defineProperty(Screen.prototype, 'orientation', originalOrientation);
  else Reflect.deleteProperty(Screen.prototype, 'orientation');
  vi.restoreAllMocks();
});

describe('supportsOrientationLock on the web', () => {
  it.each([
    { runtime: 'Android Chrome', lockable: true, coarse: true, expected: true },
    {
      runtime: 'a browser emulating a mobile device',
      lockable: true,
      coarse: true,
      expected: true,
    },
    { runtime: 'desktop Chrome', lockable: true, coarse: false, expected: false },
    { runtime: 'iPad Safari', lockable: false, coarse: true, expected: false },
    { runtime: 'desktop Safari', lockable: false, coarse: false, expected: false },
  ])('is $expected on $runtime', ({ lockable, coarse, expected }) => {
    globalThis.Capacitor = undefined;
    stubScreen({ lockable, width: 390, height: 844 });
    stubPointer(coarse);

    expect(supportsOrientationLock()).toBe(expected);
  });
});

// The native shell locks through @capacitor/screen-orientation rather than the
// web API, so neither web signal may reach the native branch: a phone whose
// WebView lacks lock() must still offer the picker.
describe('supportsOrientationLock on native', () => {
  it.each([
    { device: 'a phone', width: 390, height: 844, expected: true },
    { device: 'a tablet', width: 1133, height: 744, expected: false },
  ])('is $expected on $device whatever the web API offers', ({ width, height, expected }) => {
    globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    stubScreen({ lockable: false, width, height });
    stubPointer(false);

    expect(supportsOrientationLock()).toBe(expected);
  });
});
