// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { Style } from '@capacitor/status-bar';
import {
  applyStatusBar,
  bandColor,
  hasNotch,
  statusBarStyleForBand,
  bandEdges,
  CUTOUT_LEFT_ANGLE,
  CUTOUT_RIGHT_ANGLE,
  statusBarHiddenFor,
  computeNotchBandState,
  NOTCH_INSET_THRESHOLD_PX,
  type NotchBandInput,
} from './notchBand';
import { PALETTE_COLORS } from '../state/colors.svelte';
import { PAPER_COLORS } from '../theme';

// Representative insets: a clear notch vs. a bezel/status-bar device.
const NOTCH_INSET = 47; // iPhone notch (portrait)
const BEZEL_INSET = 20; // iPad / plain status bar
const TRANSPARENT_EDGE_COLORS = {
  top: 'transparent',
  left: 'transparent',
  right: 'transparent',
};

// A complete input with no cutout on any edge; spread + override per test.
const NO_CUTOUT: NotchBandInput = {
  platform: 'ios',
  native: true,
  orientation: 'portrait',
  insetTop: 0,
  insetLeft: 0,
  insetRight: 0,
  orientationAngle: 0,
  activeColor: '#AB71E1',
  eraser: false,
  paperColor: PAPER_COLORS.light,
};

describe('bandColor', () => {
  it('uses the active color when drawing', () => {
    expect(bandColor('#AB71E1', false, PAPER_COLORS.light)).toBe('#AB71E1');
  });

  it('clears to the paper color when erasing', () => {
    expect(bandColor('#AB71E1', true, PAPER_COLORS.light)).toBe(PAPER_COLORS.light);
    expect(bandColor('#0a0b10', true, PAPER_COLORS.dark)).toBe(PAPER_COLORS.dark);
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

describe('applyStatusBar', () => {
  const STYLE_ENUM: { Dark: Style; Light: Style } = {
    Dark: 'DARK' as Style,
    Light: 'LIGHT' as Style,
  };

  function stubBar() {
    return {
      setStyle: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
      show: vi.fn().mockResolvedValue(undefined),
    };
  }

  it('translates DARK to the dark style enum value', () => {
    const bar = stubBar();
    applyStatusBar('DARK', null, bar, STYLE_ENUM);
    expect(bar.setStyle).toHaveBeenCalledWith({ style: STYLE_ENUM.Dark });
  });

  it('translates LIGHT to the light style enum value', () => {
    const bar = stubBar();
    applyStatusBar('LIGHT', null, bar, STYLE_ENUM);
    expect(bar.setStyle).toHaveBeenCalledWith({ style: STYLE_ENUM.Light });
  });

  it('makes no style call when style is null', () => {
    const bar = stubBar();
    applyStatusBar(null, null, bar, STYLE_ENUM);
    expect(bar.setStyle).not.toHaveBeenCalled();
  });

  it('hides the status bar when hidden is true', () => {
    const bar = stubBar();
    applyStatusBar(null, true, bar, STYLE_ENUM);
    expect(bar.hide).toHaveBeenCalled();
    expect(bar.show).not.toHaveBeenCalled();
  });

  it('shows the status bar when hidden is false', () => {
    const bar = stubBar();
    applyStatusBar(null, false, bar, STYLE_ENUM);
    expect(bar.show).toHaveBeenCalled();
    expect(bar.hide).not.toHaveBeenCalled();
  });

  it('makes no visibility call when hidden is null', () => {
    const bar = stubBar();
    applyStatusBar(null, null, bar, STYLE_ENUM);
    expect(bar.hide).not.toHaveBeenCalled();
    expect(bar.show).not.toHaveBeenCalled();
  });

  it('swallows a rejected setStyle call', async () => {
    const bar = { ...stubBar(), setStyle: vi.fn().mockRejectedValue(new Error('nope')) };
    expect(() => applyStatusBar('DARK', null, bar, STYLE_ENUM)).not.toThrow();
    await vi.waitFor(() => expect(bar.setStyle).toHaveBeenCalled());
  });

  it('swallows a rejected hide/show call', async () => {
    const bar = { ...stubBar(), hide: vi.fn().mockRejectedValue(new Error('nope')) };
    expect(() => applyStatusBar(null, true, bar, STYLE_ENUM)).not.toThrow();
    await vi.waitFor(() => expect(bar.hide).toHaveBeenCalled());
  });
});

describe('bandEdges', () => {
  const landscape = { ...NO_CUTOUT, orientation: 'landscape' as const, insetTop: 0 };

  it('uses the top inset in portrait', () => {
    expect(bandEdges({ ...NO_CUTOUT, insetTop: NOTCH_INSET })).toEqual(['top']);
  });

  it('paints nothing in portrait below the notch threshold', () => {
    expect(bandEdges({ ...NO_CUTOUT, insetTop: BEZEL_INSET })).toEqual([]);
  });

  // iOS insets both landscape sides with the same value whichever side the
  // cutout is on, so neither the insets nor the angle can be trusted to pick
  // one — and neither strip is claimable, so painting both spends nothing.
  it('paints both sides when the two insets are indistinguishable', () => {
    expect(bandEdges({ ...landscape, insetLeft: NOTCH_INSET, insetRight: NOTCH_INSET })).toEqual([
      'left',
      'right',
    ]);
  });

  it('leaves an indistinguishable pair alone below the threshold', () => {
    expect(bandEdges({ ...landscape, insetLeft: BEZEL_INSET, insetRight: BEZEL_INSET })).toEqual(
      []
    );
  });

  // Asymmetric sides mean the deeper one may be a nav bar rather than the
  // cutout, so the rotation angle picks, not the depth.
  it('follows the angle to the left side, not the deeper inset', () => {
    expect(
      bandEdges({
        ...landscape,
        insetLeft: NOTCH_INSET,
        insetRight: NOTCH_INSET + 10,
        orientationAngle: CUTOUT_LEFT_ANGLE,
      })
    ).toEqual(['left']);
  });

  it('follows the angle to the right side, not the deeper inset', () => {
    expect(
      bandEdges({
        ...landscape,
        insetLeft: NOTCH_INSET + 10,
        insetRight: NOTCH_INSET,
        orientationAngle: CUTOUT_RIGHT_ANGLE,
      })
    ).toEqual(['right']);
  });

  // A wrong band spends claimable screen and leaves the cutout bare, so an
  // angle that names neither side paints nothing rather than guessing.
  it('paints nothing when an asymmetric pair has no usable angle', () => {
    expect(
      bandEdges({ ...landscape, insetLeft: NOTCH_INSET, insetRight: 0, orientationAngle: 0 })
    ).toEqual([]);
  });

  it('ignores the top inset entirely in landscape', () => {
    // Even if a stale top inset lingers, landscape never bands the long top edge.
    expect(
      bandEdges({ ...NO_CUTOUT, orientation: 'landscape', insetTop: NOTCH_INSET })
    ).not.toContain('top');
  });
});

describe('statusBarHiddenFor', () => {
  it('hides the status bar on Android native in landscape', () => {
    expect(
      statusBarHiddenFor({ ...NO_CUTOUT, platform: 'android', orientation: 'landscape' })
    ).toBe(true);
  });

  it('shows the status bar on Android native in portrait', () => {
    expect(statusBarHiddenFor({ ...NO_CUTOUT, platform: 'android', orientation: 'portrait' })).toBe(
      false
    );
  });

  it('makes no visibility call on iOS native or web', () => {
    expect(
      statusBarHiddenFor({ ...NO_CUTOUT, platform: 'ios', orientation: 'landscape' })
    ).toBeNull();
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
      activeColor: purple,
    });
    expect(state.themeColor).toBe(purple);
    expect(state.statusBarStyle).toBeNull();
    expect(state.statusBarHidden).toBeNull();
    expect(state.backgroundColors).toEqual(TRANSPARENT_EDGE_COLORS);
  });

  it('web on iOS: standalone PWA paints the CSS band under the notch', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'web',
      native: false,
      insetTop: NOTCH_INSET,
      activeColor: purple,
    });
    expect(state.backgroundColors).toEqual({
      top: purple,
      left: 'transparent',
      right: 'transparent',
    });
    // Web cannot call the native plugin even on iOS.
    expect(state.statusBarStyle).toBeNull();
  });

  it('native Android: paints the band and flips status-bar icons', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'android',
      insetTop: 34,
      activeColor: purple,
    });
    expect(state.backgroundColors.top).toBe(purple);
    expect(state.statusBarStyle).toBe(statusBarStyleForBand(purple));
    expect(state.statusBarHidden).toBe(false); // portrait
  });

  it('native iOS: paints the band and flips status-bar icons', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'ios',
      insetTop: NOTCH_INSET,
      activeColor: '#0a0b10',
    });
    expect(state.backgroundColors.top).toBe('#0a0b10');
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
      insetTop: NOTCH_INSET,
      insetLeft: NOTCH_INSET,
      orientationAngle: CUTOUT_LEFT_ANGLE,
      activeColor: '#62A2E9',
    });
    expect(state.backgroundColors).toEqual({
      top: 'transparent',
      left: '#62A2E9',
      right: 'transparent',
    });
    expect(state.statusBarHidden).toBe(true);
  });

  // This test used to assert the tie-break that was the defect: with matching
  // side insets the old rule always picked the right edge, so on the rotation
  // whose cutout was on the left it painted the wrong strip. Matching insets
  // are precisely the case the app cannot resolve — and both strips are already
  // outside the content box, so covering both spends no claimable screen.
  it('paints both sides when the side insets are indistinguishable', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      orientation: 'landscape',
      insetLeft: NOTCH_INSET,
      insetRight: NOTCH_INSET,
    });
    expect(state.backgroundColors).toEqual({
      top: 'transparent',
      left: '#AB71E1',
      right: '#AB71E1',
    });
  });

  it('hides the status bar in landscape even with no cutout (notch-less phone)', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      platform: 'android',
      orientation: 'landscape',
    });
    expect(state.backgroundColors).toEqual(TRANSPARENT_EDGE_COLORS);
    expect(state.statusBarHidden).toBe(true); // but still reclaim the top edge
  });
});

describe('computeNotchBandState — no-cutout devices skip the band', () => {
  const baseline: NotchBandInput = { ...NO_CUTOUT, insetTop: BEZEL_INSET };

  it('bezel iPad (camera in the bezel) gets no band and no icon flip', () => {
    const state = computeNotchBandState(baseline);
    expect(state.backgroundColors).toEqual(TRANSPARENT_EDGE_COLORS);
    expect(state.statusBarStyle).toBeNull();
  });

  it('desktop web gets no band', () => {
    expect(
      computeNotchBandState({ ...baseline, platform: 'web', native: false, insetTop: 0 })
        .backgroundColors
    ).toEqual(TRANSPARENT_EDGE_COLORS);
  });
});

describe('computeNotchBandState — color follows the active tool', () => {
  it('shows the selected color while drawing', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      insetTop: NOTCH_INSET,
      activeColor: '#62A2E9',
    });
    expect(state.backgroundColors.top).toBe('#62A2E9');
    expect(state.themeColor).toBe('#62A2E9');
  });

  it('clears to the light paper (and dark icons) while erasing in light mode', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      insetTop: NOTCH_INSET,
      activeColor: '#62A2E9',
      eraser: true,
    });
    expect(state.backgroundColors.top).toBe(PAPER_COLORS.light);
    expect(state.themeColor).toBe(PAPER_COLORS.light);
    expect(state.statusBarStyle).toBe('LIGHT');
  });

  it('clears to the dark paper (and light icons) while erasing in dark mode', () => {
    const state = computeNotchBandState({
      ...NO_CUTOUT,
      insetTop: NOTCH_INSET,
      activeColor: '#62A2E9',
      eraser: true,
      paperColor: PAPER_COLORS.dark,
    });
    expect(state.backgroundColors.top).toBe(PAPER_COLORS.dark);
    expect(state.themeColor).toBe(PAPER_COLORS.dark);
    expect(state.statusBarStyle).toBe('DARK');
  });
});
