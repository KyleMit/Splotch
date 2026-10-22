import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { caller, records, host } from './rsd-native-selection-host.mjs';
import { displayOrientation, Orientation } from './rsd-orientation-port.mjs';
import { mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { storedSettings } from './rsd-native-settings-fixture.mjs';
import { DRAWING_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { paletteHex } from '../../../experiments/native-architecture/src/drawing/palette.ts';
import { THEME_COLOR_META_SELECTOR } from '../../../experiments/native-architecture/src/platform/notchBandPlatform.web.ts';

const PURPLE = paletteHex('Purple');
// An iPhone's Dynamic Island inset, and a bezel iPad's plain status bar.
const NOTCH_INSET_PX = 59;
const STATUS_BAR_INSET_PX = 24;
// A hole-punch Android phone's camera cutout: its status bar in portrait, one side in landscape.
const ANDROID_CUTOUT_INSET_PX = 42;
const LANDSCAPE = { width: 874, height: 402 };

// The band's strips as last committed: the top and left strips are the fills NativeFrame mounts
// after its padded safe-area view, over the drawing screen, and the right strip, on the side the
// Clear Button docks to, fills the layout's dock band layer under the clear overlay. Reading the
// mounted nodes rather than the props journal keeps a band that rerenders alone (its rotation
// resolving after mount, below) from being read stale.
function strips() {
  const committed = (node) =>
    node.dataset.committedProps === undefined
      ? []
      : [JSON.parse(node.dataset.committedProps).style];
  const frame = host.querySelector('[data-testid="rsd-safe-area-frame"]');
  const cover = [];
  for (let node = frame.nextElementSibling; node; node = node.nextElementSibling)
    cover.push(...committed(node));
  const dock = [...host.querySelector('[data-testid="rsd-dock-band"]').children].flatMap(committed);
  return [...cover, ...dock].filter(
    (style) => style.position === 'absolute' && style.pointerEvents === 'none'
  );
}

function painted() {
  return strips()
    .filter((style) => style.backgroundColor !== 'transparent')
    .map(({ backgroundColor, height, width, left }) => ({
      backgroundColor,
      ...(height === undefined ? { width, side: left === 0 ? 'left' : 'right' } : { height }),
    }));
}

const statusBars = () =>
  [...host.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar);

// The band's own status bar: the theme's carries no visibility.
const bandStatusBar = () =>
  records.props.findLast((props) => 'hidden' in props && 'barStyle' in props);

// The paint is session state: every launch starts on Purple, so another color is a pick.
async function mountWith({ insets, dimensions, os = 'ios', brush = 'crayon', settings, color }) {
  records.insets = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
  if (dimensions) records.dimensions = { scale: 1, fontScale: 1, ...dimensions };
  records.os = os;
  records.journalHostProps = true;
  await mountToolbar(toolbarScreen({ brush }), settings);
  if (color) await act(async () => caller.product.sound.owner.settings.setColor(color));
}

describe('the Notch Band', () => {
  it('paints the drawing color into a portrait cutout, with icons that read on it', async () => {
    await mountWith({ insets: { top: NOTCH_INSET_PX } });
    expect(painted()).toEqual([{ backgroundColor: PURPLE, height: NOTCH_INSET_PX }]);
    expect(statusBars().at(-1)).toBe('dark-content');
  });

  // Shipping's SystemBars call follows the band's color, so a bright band in the dark theme keeps
  // dark icons once shipping has measured its inset.
  it('picks status icons that read on the band, not on the dark theme', async () => {
    await mountWith({
      insets: { top: NOTCH_INSET_PX },
      settings: { appearance: 'dark' },
      color: 'Blue',
    });
    expect(painted()).toEqual([{ backgroundColor: paletteHex('Blue'), height: NOTCH_INSET_PX }]);
    expect(statusBars()).toEqual(['light-content', 'dark-content']);
  });

  it('tints the Android portrait status bar with the selected color and keeps it shown', async () => {
    await mountWith({
      insets: { top: ANDROID_CUTOUT_INSET_PX },
      os: 'android',
      color: 'Green',
    });
    expect(painted()).toEqual([
      { backgroundColor: paletteHex('Green'), height: ANDROID_CUTOUT_INSET_PX },
    ]);
    expect(bandStatusBar()).toMatchObject({ barStyle: 'dark-content', hidden: false });
  });

  it("paints the paper's color while the eraser is held", async () => {
    await mountWith({ insets: { top: NOTCH_INSET_PX }, brush: 'eraser' });
    expect(painted()).toEqual([
      { backgroundColor: DRAWING_THEMES.light.paper, height: NOTCH_INSET_PX },
    ]);
  });

  it('leaves a plain status bar inset unpainted', async () => {
    await mountWith({ insets: { top: STATUS_BAR_INSET_PX } });
    expect(painted()).toEqual([]);
    expect(statusBars()).toHaveLength(1);
  });

  it('paints both landscape sides when the insets cannot say which holds the cutout', async () => {
    await mountWith({
      insets: { left: NOTCH_INSET_PX, right: NOTCH_INSET_PX },
      dimensions: LANDSCAPE,
    });
    expect(painted()).toEqual([
      { backgroundColor: PURPLE, width: NOTCH_INSET_PX, side: 'left' },
      { backgroundColor: PURPLE, width: NOTCH_INSET_PX, side: 'right' },
    ]);
  });

  // Shipping's band covers the Flat rail glass, which runs out through the left inset beside a
  // landscape palette column, while the Clear Button docks over the right strip. Negative control:
  // a left strip mounted in the layout's dock band layer, under the palette bar, is painted over by
  // the rail glass.
  it('paints the left strip over the whole screen and the right one under the Clear Button', async () => {
    storedSettings({ toolbarStyle: 'bare', aiEnabled: true });
    await mountWith({
      insets: { left: NOTCH_INSET_PX, right: NOTCH_INSET_PX },
      dimensions: { width: 1180, height: 820 },
    });
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="rsd-rail-glass"]')).not.toBeNull()
    );
    const frame = host.querySelector('[data-testid="rsd-safe-area-frame"]');
    expect(frame.contains(host.querySelector('[data-testid="rsd-rail-glass"]'))).toBe(true);
    expect(painted()).toEqual([
      { backgroundColor: PURPLE, width: NOTCH_INSET_PX, side: 'left' },
      { backgroundColor: PURPLE, width: NOTCH_INSET_PX, side: 'right' },
    ]);
    expect(host.querySelector('[data-testid="rsd-dock-band"]').children).toHaveLength(1);
  });

  // Android reports one side's inset, the cutout's, so the display rotation names the side.
  it.each([
    [Orientation.LANDSCAPE_RIGHT, 'left'],
    [Orientation.LANDSCAPE_LEFT, 'right'],
  ])('paints the Android landscape cutout where rotation %s turns it', async (rotation, side) => {
    displayOrientation.current = rotation;
    await mountWith({
      insets: { [side]: ANDROID_CUTOUT_INSET_PX },
      dimensions: LANDSCAPE,
      os: 'android',
    });
    await vi.waitFor(() =>
      expect(painted()).toEqual([{ backgroundColor: PURPLE, width: ANDROID_CUTOUT_INSET_PX, side }])
    );
  });

  it('leaves a one-sided landscape inset unpainted while the rotation names no side', async () => {
    displayOrientation.current = Orientation.UNKNOWN;
    await mountWith({
      insets: { left: ANDROID_CUTOUT_INSET_PX },
      dimensions: LANDSCAPE,
      os: 'android',
    });
    expect(painted()).toEqual([]);
  });

  it('hides the Android status bar in landscape, as shipping reclaims the top edge', async () => {
    await mountWith({ dimensions: LANDSCAPE, os: 'android' });
    expect(bandStatusBar()?.hidden).toBe(true);
    expect(caller.screen.brush).toBe('crayon');
  });

  it('reasserts the hidden Android landscape bar on resume without a layout change', async () => {
    await mountWith({ dimensions: LANDSCAPE, os: 'android' });
    await act(async () => {
      for (const listener of records.appStateListeners) listener('background');
    });
    expect(records.statusBarHidden).toEqual([]);
    await act(async () => {
      for (const listener of records.appStateListeners) listener('active');
    });
    expect(records.statusBarHidden).toEqual([true]);
  });

  it('reasserts the shown portrait bar and its cutout icon style on resume', async () => {
    await mountWith({ insets: { top: ANDROID_CUTOUT_INSET_PX }, os: 'android', color: 'Green' });
    await act(async () => {
      for (const listener of records.appStateListeners) listener('active');
    });
    expect(records.statusBarHidden).toEqual([false]);
    expect(records.statusBarStyles).toEqual(['dark-content']);
  });

  it("restates shipping's theme-color selector", () => {
    expect(THEME_COLOR_META_SELECTOR).toBe('meta[name="theme-color"]');
  });
});
