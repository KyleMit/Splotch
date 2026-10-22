import { createElement as h } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { scale, themes } from '../../../src/lib/design/tokens.ts';
import { BARE_MENU_GAP_PX } from '../../../src/lib/glassPaneGeometry.ts';
import { control, host, markup, mount, view } from './rsd-native-button-host.mjs';
import {
  BARE_OPTION_OUTLINE_PX,
  BARE_TILE_PADDING_SHARE,
  RsdIconButton,
} from '../../../src/rsdDrawing/RsdIconButton.tsx';
import { BARE_FLYOUT_MENU_GAP_PX } from '../../../src/rsdDrawing/RsdFlyoutMenu.tsx';
import { ToolbarSkin } from '../../../src/rsdDrawing/toolbarSkin.ts';

import { BARE_GLASS_THEMES, GLASS_FROST } from '../../../src/rsdDrawing/bareGlassTheme.ts';
import { glassPaneLayout } from '../../../src/rsdDrawing/bareGlassSpace.ts';
import {
  COLOR_MENU_GAP_PX,
  COLOR_MENU_LABELS,
  COLOR_MENU_PADDING_PX,
  COLOR_MENU_SWATCH_PX,
} from '../../../src/rsdDrawing/colorMenuLayout.ts';
import { NATIVE_ICONS } from '../../../src/rsdDrawing/icons.generated.ts';
import { NATIVE_DEFERRED_ICONS } from '../../../src/rsdDrawing/icons.deferred.generated.ts';
import { RsdOptionOutline } from '../../../src/rsdDrawing/optionOutline.tsx';
import { filteredMarkup } from '../../../src/rsdDrawing/greyed.ts';

describe('shipping flat toolbar drift', () => {
  it('holds every flat chrome value to its shipping declaration', () => {
    expect(BARE_FLYOUT_MENU_GAP_PX).toBe(BARE_MENU_GAP_PX);
  });

  it('holds the glass and rule tokens to the shipping theme', () => {
    const shipping = Object.fromEntries(
      ['light', 'dark'].map((mode) => {
        const theme = themes[mode];
        return [
          mode,
          {
            glassTintRgb: theme.glassTintRgb,
            ruleInk: theme.ruleInk,
            ruleBlend: theme.ruleBlend,
            ruleOpacity: Number(theme.ruleOpacity),
            ruleSecondaryOpacity: Number(theme.ruleSecondaryOpacity),
          },
        ];
      })
    );
    expect(BARE_GLASS_THEMES).toEqual(shipping);
    expect(GLASS_FROST).toEqual({ glassRail: scale.glassRail, glassStrip: scale.glassStrip });
  });
});

it('gives the glass the Color Menu its trim order keeps, and the custom swatch', () => {
  const panel = {
    mode: 'phoneLandscape',
    count: 6,
    size: 48,
    optionSize: 60,
    brushOptions: 4,
    stroke: true,
  };
  const { colorMenu } = glassPaneLayout({ width: 740, height: 360, insetBottom: 0 }, panel, false);
  expect(colorMenu).toEqual({
    swatchPx: COLOR_MENU_SWATCH_PX,
    gapPx: COLOR_MENU_GAP_PX,
    paddingPx: COLOR_MENU_PADDING_PX,
    slots: COLOR_MENU_LABELS.length + 1,
  });
});

const TILE_PX = 60;
const flat = (element) => h(ToolbarSkin.Provider, { value: 'bare' }, element);
// Shipping's parked flat wash, grayscale(1) contrast(0.55) brightness(1.2), over the colors such a
// tile paints, each as Chromium's own filter renders it.
const WASHED = {
  light: { iconInk: '#595959', brandSolid: '#858585', onBrand: '#ededed', paper: '#ebebeb' },
  dark: { iconInk: '#d7d7d7', brandSolid: '#898989', onBrand: '#ededed', paper: '#5a5a5a' },
};
// The trash glyph's #ee6202 orange through the same wash.
const WASHED_GLYPH_ORANGE = '#959595';
const markupColors = () => markup().match(/#[0-9a-f]{6}\b/gi) ?? [];
const isGrey = (hex) => hex.slice(1, 3) === hex.slice(3, 5) && hex.slice(3, 5) === hex.slice(5, 7);
const badgeStyle = () =>
  [...host.texts, ...host.views].findLast((props) => props.testID === 'free-count')?.style;

describe('flat skins', () => {
  it.each(['light', 'dark'])(
    'prints the %s action tile on the paper with no face',
    async (mode) => {
      const tile = h(RsdIconButton, {
        skin: 'tile',
        icon: 'shapes',
        label: 'Coloring books',
        size: TILE_PX,
        padding: 10,
        onPress: vi.fn(),
      });
      await mount(tile, { mode });
      // Negative control: the raised tile keeps its float face and the panel's padding.
      expect(control('Coloring books').style).toMatchObject({ borderWidth: 2, padding: 10 });
      await mount(flat(tile), { mode });
      expect(control('Coloring books').style).toMatchObject({
        width: TILE_PX,
        height: TILE_PX,
        padding: TILE_PX / BARE_TILE_PADDING_SHARE,
        borderWidth: 0,
        backgroundColor: 'transparent',
        opacity: 1,
      });
      expect(control('Coloring books').style.boxShadow ?? 'none').toBe('none');
      expect(view().querySelector('svg').getAttribute('width')).toBe(
        String(TILE_PX - (2 * TILE_PX) / BARE_TILE_PADDING_SHARE)
      );
    }
  );

  it.each(['light', 'dark'])(
    'paints the wash of a parked flat %s tile into its own colors instead of a filter',
    async (mode) => {
      const undo = (disabled) =>
        h(RsdIconButton, {
          skin: 'tile',
          // A startup glyph, so its markup is in hand without the deferred icon chunk.
          icon: 'settings',
          label: 'Undo',
          size: TILE_PX,
          disabled,
          onPress: vi.fn(),
        });
      await mount(flat(undo(true)), { mode });
      const style = control('Undo').style;
      expect(style.opacity).toBe(1);
      // iOS drops grayscale() and paints brightness() over the whole face, a white rounded tile.
      expect(style.filter).toBeUndefined();
      expect(markup()).toBe(
        NATIVE_ICONS.settings[mode].replaceAll('currentColor', WASHED[mode].iconInk)
      );
      // Negative controls: a live flat tile keeps its full ink, and a parked raised one fades.
      await mount(flat(undo(false)), { mode });
      expect(markup()).toBe(
        NATIVE_ICONS.settings[mode].replaceAll('currentColor', themes[mode].iconInk)
      );
      await mount(undo(true), { mode });
      expect(control('Undo').style.opacity).not.toBe(1);
    }
  );

  it('greys every color of a full-color glyph on a parked flat tile', async () => {
    const trash = (disabled) =>
      h(RsdIconButton, {
        skin: 'tile',
        icon: 'trash-closed',
        label: 'Clear',
        size: TILE_PX,
        disabled,
        onPress: vi.fn(),
      });
    await mount(flat(trash(false)));
    expect(markupColors().some((hex) => !isGrey(hex))).toBe(true);
    await mount(flat(trash(true)));
    expect(markupColors().length).toBeGreaterThan(0);
    expect(markupColors().every(isGrey)).toBe(true);
    expect(markupColors()).toContain(WASHED_GLYPH_ORANGE);
  });

  it.each(['light', 'dark'])("washes a parked flat %s tile's badge with it", async (mode) => {
    const ai = (disabled) =>
      h(RsdIconButton, {
        skin: 'tile',
        icon: 'settings',
        label: 'Create AI image',
        size: TILE_PX,
        badge: 3,
        disabled,
        onPress: vi.fn(),
      });
    await mount(flat(ai(true)), { mode });
    expect(badgeStyle()).toMatchObject({
      backgroundColor: WASHED[mode].brandSolid,
      color: WASHED[mode].onBrand,
    });
    expect(JSON.stringify(badgeStyle().boxShadow)).toContain(WASHED[mode].paper);
    // Negative control: a live flat tile's badge keeps the brand and the paper ring.
    await mount(flat(ai(false)), { mode });
    expect(badgeStyle().backgroundColor).not.toBe(WASHED[mode].brandSolid);
    expect(JSON.stringify(badgeStyle().boxShadow)).not.toContain(WASHED[mode].paper);
  });

  it('refuses a tile filter it cannot paint rather than leaving the tile in full color', () => {
    expect(() => filteredMarkup(NATIVE_ICONS.settings.light, 'grayscale(1) opacity(0.35)')).toThrow(
      'opacity(0.35)'
    );
  });

  // Shipping chains four drop shadows; iOS drops every drop-shadow() filter, so the native option
  // draws what they leave instead: the glyph's silhouette in the outline ink at each step of a
  // three-by-three grid, corners included, under the glyph.
  it.each([
    ['a plain ink', '#ab71e1', undefined],
    ['a keylined white ink', '#ffffff', 'white'],
  ])(
    'outlines the selected flat menu option in the strong text ink without a filter, with %s',
    async (_, ink, keyline) => {
      const option = (selected) =>
        h(RsdIconButton, {
          skin: 'flyout',
          Outline: RsdOptionOutline,
          icon: 'size-brush-3',
          label: 'Size 3',
          base: 60,
          scale: 1,
          ink,
          keyline,
          selected,
          onPress: vi.fn(),
        });
      const glyphs = () =>
        [...view().querySelectorAll('svg[data-xml]')].map((node) => node.dataset.xml);
      const outlines = () => host.views.filter((props) => props.testID === 'option-outline');
      await mount(flat(option(true)));
      await vi.waitFor(() =>
        expect(glyphs().at(-1)).toContain(NATIVE_DEFERRED_ICONS['size-brush-3'].light.slice(0, 40))
      );
      expect(control('Size 3').style).toMatchObject({
        borderWidth: 0,
        backgroundColor: 'transparent',
      });
      expect(host.views.filter((props) => props.style.filter !== undefined)).toEqual([]);
      const steps = [-BARE_OPTION_OUTLINE_PX, 0, BARE_OPTION_OUTLINE_PX];
      const grid = steps.flatMap((left) => steps.map((top) => [left, top]));
      expect(
        outlines()
          .slice(-grid.length + 1)
          .map(({ style }) => [style.position, style.left, style.top])
      ).toEqual(
        grid.filter(([left, top]) => left || top).map(([left, top]) => ['absolute', left, top])
      );
      const [glyph, ...silhouettes] = glyphs().reverse();
      expect(silhouettes).toHaveLength(grid.length - 1);
      const outline = themes.light.textStrong;
      for (const silhouette of silhouettes) {
        expect(silhouette.match(/#[0-9a-f]{3,6}\b|currentColor/gi)).toEqual(
          glyph.match(/#[0-9a-f]{3,6}\b|currentColor/gi).map(() => outline)
        );
        expect(silhouette.replaceAll(outline, '')).toBe(
          glyph.replace(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, '')
        );
      }
      // Negative controls: an unselected flat option and a selected raised one draw no outline.
      host.views.length = 0;
      await mount(flat(option(false)));
      expect(outlines()).toEqual([]);
      await mount(option(true));
      expect(outlines()).toEqual([]);
      expect(glyphs()).toHaveLength(1);
    }
  );
});
