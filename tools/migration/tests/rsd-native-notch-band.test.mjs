import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { caller, records, host } from './rsd-native-selection-host.mjs';
import { flat, mountToolbar, toolbarScreen } from './rsd-native-toolbar-fixture.mjs';
import { DRAWING_THEMES } from '../../../experiments/native-architecture/src/drawing/theme.ts';
import { paletteHex } from '../../../experiments/native-architecture/src/drawing/palette.ts';
import { THEME_COLOR_META_SELECTOR } from '../../../experiments/native-architecture/src/platform/notchBandPlatform.web.ts';
import { THEME_COLOR_META_SELECTOR as SHIPPING_THEME_COLOR_META_SELECTOR } from '../../../web/src/lib/theme.ts';

const PURPLE = paletteHex('Purple');
// An iPhone's Dynamic Island inset, and a bezel iPad's plain status bar.
const NOTCH_INSET_PX = 59;
const STATUS_BAR_INSET_PX = 24;

// The band's strips are the absolute fills NativeFrame mounts after its padded safe-area view.
function strips() {
  const frame = records.props.findLast((props) => props.testID === 'rsd-safe-area-frame');
  const after = records.props.slice(records.props.lastIndexOf(frame) + 1);
  return after
    .map((props) => flat(props.style))
    .filter((style) => style?.position === 'absolute' && style.pointerEvents === 'none')
    .slice(-3);
}

function painted() {
  return strips()
    .filter((style) => style.backgroundColor !== 'transparent')
    .map(({ backgroundColor, height, width, left, right }) => ({
      backgroundColor,
      ...(height === undefined ? { width, side: left === 0 ? 'left' : 'right' } : { height }),
    }));
}

const statusBars = () =>
  [...host.querySelectorAll('[data-status-bar]')].map((node) => node.dataset.statusBar);

async function mountWith({ insets, dimensions, os = 'ios', brush = 'crayon' }) {
  records.insets = { top: 0, right: 0, bottom: 0, left: 0, ...insets };
  if (dimensions) records.dimensions = { scale: 1, fontScale: 1, ...dimensions };
  records.os = os;
  await mountToolbar(toolbarScreen({ brush }));
}

describe('the Notch Band', () => {
  it('paints the drawing color into a portrait cutout, with icons that read on it', async () => {
    await mountWith({ insets: { top: NOTCH_INSET_PX } });
    expect(painted()).toEqual([{ backgroundColor: PURPLE, height: NOTCH_INSET_PX }]);
    expect(statusBars().at(-1)).toBe('dark-content');
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
      dimensions: { width: 874, height: 402 },
    });
    expect(painted()).toEqual([
      { backgroundColor: PURPLE, width: NOTCH_INSET_PX, side: 'left' },
      { backgroundColor: PURPLE, width: NOTCH_INSET_PX, side: 'right' },
    ]);
  });

  it('hides the Android status bar in landscape, as shipping reclaims the top edge', async () => {
    await mountWith({ dimensions: { width: 874, height: 402 }, os: 'android' });
    const bar = records.props.findLast((props) => 'hidden' in props && 'barStyle' in props);
    expect(bar?.hidden).toBe(true);
    expect(caller.screen.brush).toBe('crayon');
  });

  it("restates shipping's theme-color selector", () => {
    expect(THEME_COLOR_META_SELECTOR).toBe(SHIPPING_THEME_COLOR_META_SELECTOR);
    const notchBand = readFileSync(
      join(import.meta.dirname, '../../../web/src/lib/components/NotchBand.svelte'),
      'utf8'
    );
    expect(notchBand).toContain('setThemeColorMeta(band.themeColor)');
  });
});
