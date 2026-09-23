import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ANDROID_MAX_OBSCURING_OPACITY,
  parseInputWindows,
  unoccludedTapPoint,
  untrustedOcclusionAt,
} from '../lib/android-touch-occlusion.mjs';
import {
  androidNativeTouchTarget,
  foregroundAndroidApp,
  nativeTapPoint,
} from '../ios/capture-xcuitest-actions.mjs';

// Captured from the SM-G990U1 capture phone during the issue 2214 repro, with
// the Settings Appearance section open. The ANR section's stale window list is
// rewritten to cover the whole screen so a parser that reads it fails loudly.
const DUMPSYS = readFileSync(
  join(import.meta.dirname, 'fixtures', 'android-dumpsys-input-occluded.txt'),
  'utf8'
);
const PACKAGE = 'art.splotch.app';
// The Dark option's native bounds in that repro: its centre is x=540.
const DARK_OPTION_BOUNDS = { x: 420, y: 897, width: 240, height: 132 };

describe('parseInputWindows', () => {
  it('reads the live window list in dispatcher order and ignores the ANR snapshot', () => {
    const windows = parseInputWindows(DUMPSYS);
    expect(windows.map((window) => window.name)).toEqual([
      '6985298 com.sec.android.app.launcher/com.samsung.app.honeyspace.edge.edgepanel.app.CocktailBarService',
      'f19f0c4 StatusBar',
      'eaf6ae3 nu.nav.bar',
      'cf92dfa nu.nav.bar',
      'b03e50e art.splotch.app/art.splotch.app.MainActivity',
    ]);
    expect(windows[2]).toMatchObject({
      alpha: 0.799805,
      frame: { left: 540, top: 99, right: 541, bottom: 2340 },
      ownerUid: 10334,
      occlusionMode: 'USE_OPACITY',
    });
    expect(windows[2].flags.has('NOT_TOUCHABLE')).toBe(true);
  });
});

describe('untrustedOcclusionAt', () => {
  const windows = parseInputWindows(DUMPSYS);

  it('combines one uid’s stacked overlays past the limit, as the dispatcher did', () => {
    const occlusion = untrustedOcclusionAt(windows, PACKAGE, 540, 963);
    expect(occlusion?.window).toBe('cf92dfa nu.nav.bar');
    expect(occlusion?.opacity).toBeGreaterThan(ANDROID_MAX_OBSCURING_OPACITY);
  });

  it('lets one overlay under the limit through', () => {
    const single = windows.filter((window) => window.name !== 'cf92dfa nu.nav.bar');
    expect(untrustedOcclusionAt(single, PACKAGE, 540, 963)).toBeNull();
  });

  it('ignores trusted system overlays and points outside the overlay', () => {
    expect(untrustedOcclusionAt(windows, PACKAGE, 541, 963)).toBeNull();
    expect(untrustedOcclusionAt(windows, PACKAGE, 1050, 400)).toBeNull();
  });

  it('reports nothing when the target app has no window', () => {
    expect(untrustedOcclusionAt(windows, 'com.example.absent', 540, 963)).toBeNull();
  });
});

describe('unoccludedTapPoint', () => {
  const windows = parseInputWindows(DUMPSYS);

  it('keeps the centre when nothing obscures it', () => {
    expect(unoccludedTapPoint({ x: 0, y: 0, width: 100, height: 50 }, windows, PACKAGE)).toEqual({
      x: 50,
      y: 25,
      occludedBy: null,
    });
  });

  it('keeps the centre when there is no window list to consult', () => {
    expect(unoccludedTapPoint(DARK_OPTION_BOUNDS, null, PACKAGE)).toMatchObject({
      x: 540,
      y: 963,
      occludedBy: null,
    });
  });

  it('moves an obscured tap to the nearest clear point inside the target', () => {
    const point = unoccludedTapPoint(DARK_OPTION_BOUNDS, windows, PACKAGE);
    expect(point.occludedBy?.window).toBe('cf92dfa nu.nav.bar');
    expect(point.y).toBe(963);
    expect(point.x).not.toBe(540);
    expect(point.x).toBeGreaterThan(DARK_OPTION_BOUNDS.x);
    expect(point.x).toBeLessThan(DARK_OPTION_BOUNDS.x + DARK_OPTION_BOUNDS.width);
    expect(untrustedOcclusionAt(windows, PACKAGE, point.x, point.y)).toBeNull();
  });
});

describe('native Android tap wiring', () => {
  const session = {
    capabilities: { platformName: 'Android', udid: 'SERIAL1', appPackage: PACKAGE },
  };

  it('aims only native Android sessions', () => {
    expect(
      androidNativeTouchTarget({ nativeApp: true, requestedCapabilities: {}, session })
    ).toEqual({ serial: 'SERIAL1', packageName: PACKAGE });
    expect(
      androidNativeTouchTarget({ nativeApp: false, requestedCapabilities: {}, session })
    ).toBeNull();
    expect(
      androidNativeTouchTarget({
        nativeApp: true,
        requestedCapabilities: {},
        session: { capabilities: { platformName: 'iOS', udid: 'X' } },
      })
    ).toBeNull();
  });

  it('reads the window list for the session’s phone and moves the tap', () => {
    const readWindows = vi.fn(() => parseInputWindows(DUMPSYS));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = { androidTouchTarget: { serial: 'SERIAL1', packageName: PACKAGE } };
    const point = nativeTapPoint(
      client,
      DARK_OPTION_BOUNDS,
      'switch light theme to dark',
      readWindows
    );
    expect(readWindows).toHaveBeenCalledWith('SERIAL1');
    expect(point.x).not.toBe(540);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('nu.nav.bar'));
    warn.mockRestore();
  });

  it('never reads a window list for other targets', () => {
    const readWindows = vi.fn();
    expect(nativeTapPoint({}, DARK_OPTION_BOUNDS, 'label', readWindows)).toMatchObject({
      x: 540,
      y: 963,
    });
    expect(readWindows).not.toHaveBeenCalled();
  });

  it('brings the app forward through activateApp', async () => {
    const request = vi.fn(async () => null);
    await foregroundAndroidApp({ request }, 'S', PACKAGE);
    expect(request).toHaveBeenCalledWith('POST', '/session/S/execute/sync', {
      script: 'mobile: activateApp',
      args: [{ appId: PACKAGE }],
    });
  });
});
