import { describe, it, expect } from 'vitest';
import {
  bandColor,
  hasNotch,
  statusBarStyleForBand,
  cutoutEdge,
  statusBarHiddenFor,
  computeNotchBandState,
  ERASER_BAND_COLOR,
  NOTCH_INSET_THRESHOLD_PX,
  type NotchBandInput
} from './notchBand';
import { PALETTE_COLORS } from './state/colors.svelte';

// Representative insets: a clear notch vs. a bezel/status-bar device.
const NOTCH_INSET = 47; // iPhone notch (portrait)
const BEZEL_INSET = 20; // iPad / plain status bar

// A complete input with no cutout on any edge; spread + override per test.
const NO_CUTOUT: NotchBandInput = {
  platform: 'ios',
  native: true,
  orientation: 'portrait',
  insetTop: 0,
  insetLeft: 0,
  insetRight: 0,
  activeColor: '#AB71E1',
  eraser: false
};

describe('bandColor', () => {
  it('uses the active color when drawing', () => {
    expect(bandColor('#AB71E1', false)).toBe('#AB71E1');
  });

  it('clears to paper-white when erasing', () => {
    expect(bandColor('#AB71E1', true)).toBe(ERASER_BAND_COLOR);
    expect(bandColor('#0a0b10', true)).toBe('#ffffff');
  });
});

describe('hasNotch', () => {
  it('treats a deep inset (notch / hole-punch) as a cutout', () => {
    expect(hasNotch(NOTCH_INSET)).toBe(true);
    expect(hasNotch(59)).toBe(true); // Dynamic Island
    expect(hasNotch(NOTCH_INSET_THRESHOLD_PX)).toBe(true); // boundary is inclusive
  });

  it('treats a shallow inset (bezel iPad / status bar) as no cutout', () => {
    expect(hasNotch(BEZEL_INSET)).toBe(false);
    expect(hasNotch(0)).toBe(false); // desktop / browser tab
    expect(hasNotch(NOTCH_INSET_THRESHOLD_PX - 1)).toBe(false);
  });
});

describe('statusBarStyleForBand', () => {
  it('asks for light icons on dark colors', () => {
    expect(statusBarStyleForBand('#0a0b10')).toBe('DARK'); // black → light icons
    expect(statusBarStyleForBand('#000000')).toBe('DARK');
  });

  it('asks for dark icons on light colors', () => {
    expect(statusBarStyleForBand('#F9D24F')).toBe('LIGHT'); // yellow → dark icons
    expect(statusBarStyleForBand('#ffffff')).toBe('LIGHT'); // eraser paper
  });

  it('returns a defined style for every palette color', () => {
    for (const { hex } of PALETTE_COLORS) {
      expect(['DARK', 'LIGHT']).toContain(statusBarStyleForBand(hex));
    }
  });
});

describe('cutoutEdge', () => {
  it('uses the top inset in portrait', () => {
    expect(cutoutEdge({ ...NO_CUTOUT, insetTop: NOTCH_INSET })).toEqual({
      edge: 'top',
      inset: NOTCH_INSET
    });
  });

  it('follows the hole-punch to the right side in landscape', () => {
    // Physical top rotated to the right edge; the long top edge stays clear.
    expect(
      cutoutEdge({ ...NO_CUTOUT, orientation: 'landscape', insetTop: 0, insetRight: NOTCH_INSET })
    ).toEqual({ edge: 'right', inset: NOTCH_INSET });
  });

  it('follows the hole-punch to the left side in landscape', () => {
    expect(
      cutoutEdge({ ...NO_CUTOUT, orientation: 'landscape', insetTop: 0, insetLeft: NOTCH_INSET })
    ).toEqual({ edge: 'left', inset: NOTCH_INSET });
  });

  it('ignores the top inset entirely in landscape', () => {
    // Even if a stale top inset lingers, landscape never bands the long top edge.
    const { edge } = cutoutEdge({ ...NO_CUTOUT, orientation: 'landscape', insetTop: NOTCH_INSET });
    expect(edge).not.toBe('top');
  });
});

describe('statusBarHiddenFor', () => {
  it('hides the status bar on Android native in landscape', () => {
    expect(
      statusBarHiddenFor({ ...NO_CUTOUT, platform: 'android', orientation: 'landscape' })
    ).toBe(true);
  });

  it('shows the status bar on Android native in portrait', () => {
    expect(
      statusBarHiddenFor({ ...NO_CUTOUT, platform: 'android', orientation: 'portrait' })
    ).toBe(false);
  });

  it('makes no visibility call on iOS native or web', () => {
    expect(statusBarHiddenFor({ ...NO_CUTOUT, platform: 'ios', orientation: 'landscape' })).toBeNull();
    expect(
      statusBarHiddenFor({ ...NO_CUTOUT, platform: 'web', native: false, orientation: 'landscape' })
    ).toBeNull();
  });
});

// The four deployment targets (web/native × Android/iOS). At runtime only the
// native builds expose the device OS via Capacitor; the web build always
// reports platform 'web' and leans on CSS env() + theme-color, so the two web
// rows share one resolution but are asserted separately to document intent.
describe('computeNotchBandState — deployment targets', () => {
  const purple = '#AB71E1';

  it('web on Android: tints via theme-color, no native call', () => {
    // In a browser tab the page does not draw under the status bar, so the inset
    // is 0 and no CSS band shows — theme-color carries the color instead.
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'web',
      native: false,
      activeColor: purple
    });
    expect(state.themeColor).toBe(purple);
    expect(state.statusBarStyle).toBeNull();
    expect(state.statusBarHidden).toBeNull();
    expect(state.show).toBe(false);
  });

  it('web on iOS: standalone PWA paints the CSS band under the notch', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'web',
      native: false,
      insetTop: NOTCH_INSET,
      activeColor: purple
    });
    expect(state.show).toBe(true);
    expect(state.edge).toBe('top');
    expect(state.color).toBe(purple);
    // Web cannot call the native plugin even on iOS.
    expect(state.statusBarStyle).toBeNull();
  });

  it('native Android: paints the band and flips status-bar icons', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'android',
      insetTop: 34,
      activeColor: purple
    });
    expect(state.show).toBe(true);
    expect(state.color).toBe(purple);
    expect(state.statusBarStyle).toBe(statusBarStyleForBand(purple));
    expect(state.statusBarHidden).toBe(false); // portrait
  });

  it('native iOS: paints the band and flips status-bar icons', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'ios',
      insetTop: NOTCH_INSET,
      activeColor: '#0a0b10'
    });
    expect(state.show).toBe(true);
    expect(state.color).toBe('#0a0b10');
    expect(state.statusBarStyle).toBe('DARK'); // black band → light icons
    expect(state.statusBarHidden).toBeNull(); // iOS keeps its default status bar
  });
});

describe('computeNotchBandState — landscape moves the band to the cutout side', () => {
  it('native Android landscape: side band + status bar hidden', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'android',
      orientation: 'landscape',
      insetTop: 0,
      insetLeft: NOTCH_INSET,
      activeColor: '#62A2E9'
    });
    expect(state.show).toBe(true);
    expect(state.edge).toBe('left');
    expect(state.color).toBe('#62A2E9');
    expect(state.statusBarHidden).toBe(true);
  });

  it('hides the status bar in landscape even with no cutout (notch-less phone)', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'android',
      orientation: 'landscape'
    });
    expect(state.show).toBe(false); // nothing to paint
    expect(state.statusBarHidden).toBe(true); // but still reclaim the top edge
  });
});

describe('computeNotchBandState — no-cutout devices skip the band', () => {
  const baseline: NotchBandInput = { ...NO_CUTOUT, insetTop: BEZEL_INSET };

  it('bezel iPad (camera in the bezel) gets no band and no icon flip', () => {
    const state = computeNotchBandState(baseline);
    expect(state.show).toBe(false);
    expect(state.statusBarStyle).toBeNull();
  });

  it('desktop web gets no band', () => {
    expect(
      computeNotchBandState({ ...baseline, platform: 'web', native: false, insetTop: 0 }).show
    ).toBe(false);
  });
});

describe('computeNotchBandState — color follows the active tool', () => {
  it('shows the selected color while drawing', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      insetTop: NOTCH_INSET,
      activeColor: '#62A2E9'
    });
    expect(state.color).toBe('#62A2E9');
    expect(state.themeColor).toBe('#62A2E9');
  });

  it('clears to paper-white (and dark icons) while erasing', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      insetTop: NOTCH_INSET,
      activeColor: '#62A2E9',
      eraser: true
    });
    expect(state.color).toBe(ERASER_BAND_COLOR);
    expect(state.themeColor).toBe(ERASER_BAND_COLOR);
    expect(state.statusBarStyle).toBe('LIGHT');
  });
});
