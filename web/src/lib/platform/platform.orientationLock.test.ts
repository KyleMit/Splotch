import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  autoOrientationOverridesSystemLock,
  orientationLockApplies,
  supportsOrientationLock,
  type LockableScreenOrientation,
} from './index';

// The whole point of LockableScreenOrientation is that `lock` may be absent, and
// nothing at runtime can catch it silently becoming required again — an
// intersection with ScreenOrientation cannot weaken a member lib.dom requires,
// so the obvious spelling of that type compiles and promises the opposite. This
// assertion fails `npm run check` if it ever does.
type Assert<T extends true> = T;
type _LockStaysOptional = Assert<
  Record<string, never> extends Pick<LockableScreenOrientation, 'lock'> ? true : false
>;

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

function stubMedia({
  coarse,
  fullscreenDisplayMode = false,
}: {
  coarse: boolean;
  fullscreenDisplayMode?: boolean;
}) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query) =>
      ({
        matches:
          (coarse && query === '(pointer: coarse)') ||
          (fullscreenDisplayMode && query === '(display-mode: fullscreen)'),
      }) as MediaQueryList
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
    stubMedia({ coarse });

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
    stubMedia({ coarse: false });

    expect(supportsOrientationLock()).toBe(expected);
  });
});

// Chromium rejects lock() outside element fullscreen and outside a `fullscreen`
// display mode, so capability alone would render a control that cannot turn
// anything. `standalone` is deliberately absent: Chromium refuses there too.
describe('orientationLockApplies on the web', () => {
  it.each([
    { context: 'a plain browser tab', fullscreen: false, displayMode: false, expected: false },
    {
      context: 'a tab in element fullscreen',
      fullscreen: true,
      displayMode: false,
      expected: true,
    },
    {
      context: 'an installed app in fullscreen display mode',
      fullscreen: false,
      displayMode: true,
      expected: true,
    },
  ])('is $expected in $context', ({ fullscreen, displayMode, expected }) => {
    globalThis.Capacitor = undefined;
    stubScreen({ lockable: true, width: 390, height: 844 });
    stubMedia({ coarse: true, fullscreenDisplayMode: displayMode });

    expect(orientationLockApplies(fullscreen)).toBe(expected);
  });

  it('stays false where the engine exposes no lock, fullscreen or not', () => {
    globalThis.Capacitor = undefined;
    stubScreen({ lockable: false, width: 390, height: 844 });
    stubMedia({ coarse: true, fullscreenDisplayMode: true });

    expect(orientationLockApplies(true)).toBe(false);
  });
});

// The native shells set the orientation on the Activity or scene, which carries
// no fullscreen condition, so the picker must not wait on one.
describe('orientationLockApplies on native', () => {
  it('is true outside fullscreen on a phone whose WebView lacks lock()', () => {
    globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    stubScreen({ lockable: false, width: 390, height: 844 });
    stubMedia({ coarse: false });

    expect(orientationLockApplies(false)).toBe(true);
  });
});

// Auto is the one choice that cannot beat the device's rotation lock everywhere:
// only Android's SENSOR request ignores it, so only Android omits the caption.
describe('autoOrientationOverridesSystemLock', () => {
  it.each([
    { target: 'the Android app', platform: 'android' as const, expected: true },
    { target: 'the iOS app', platform: 'ios' as const, expected: false },
  ])('is $expected in $target', ({ platform, expected }) => {
    globalThis.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };

    expect(autoOrientationOverridesSystemLock()).toBe(expected);
  });

  it('is false on the web, where unlock() defers to the system setting', () => {
    globalThis.Capacitor = undefined;

    expect(autoOrientationOverridesSystemLock()).toBe(false);
  });
});

// The installed app gets its picker on the strength of one word in the manifest:
// Chromium honors an orientation lock in the `fullscreen` display mode and
// refuses it in `standalone`. Nothing links the manifest to the gate that reads
// it, so flipping that word would drop the picker from every installed app with
// no test failing for the right reason. This reads both sides.
// The path stays a parameter: Vite rewrites a `new URL('./literal',
// import.meta.url)` into the served asset's http URL, which readFileSync rejects
// (same workaround as app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('the manifest display mode the installed-app gate depends on', () => {
  it('declares the display mode orientationLockApplies accepts', () => {
    const manifest: { display?: string } = JSON.parse(
      sourceFile('../../../static/site.webmanifest')
    );
    const gate = sourceFile('./index.ts');

    expect(gate).toContain(
      `const FULLSCREEN_DISPLAY_MODE_QUERY = '(display-mode: ${manifest.display})';`
    );
  });
});
