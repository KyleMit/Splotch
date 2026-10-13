import { expect, describe, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { brand, scale, themes } from '../../../web/src/lib/design/tokens.ts';
import {
  control,
  host,
  markup,
  MODES,
  mount,
  pointer,
  px,
  rgba,
  view,
} from './rsd-native-button-host.mjs';
import { RsdIconButton } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { RsdFlyoutMenu } from '../../../experiments/native-architecture/src/rsdDrawing/RsdFlyoutMenu.tsx';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';

describe('RsdIconButton', () => {
  const TILE_PX = 60;

  it('draws the corner skin as a transparent 48px button whose opacity steps on press', async () => {
    await mount(
      h(RsdIconButton, {
        skin: 'corner',
        icon: 'settings',
        label: 'Settings',
        expanded: false,
        onPress: vi.fn(),
      })
    );
    const corner = control('Settings');
    expect(corner.role).toBe('button');
    expect(corner.accessibilityState).toMatchObject({ expanded: false });
    expect(corner.style).toMatchObject({
      width: 48,
      height: 48,
      padding: px(scale.space2),
      backgroundColor: 'transparent',
      opacity: 0.5,
    });
    expect(view().querySelector('svg').getAttribute('width')).toBe('32');
    expect(markup()).toBe(
      NATIVE_ICONS.settings.light.replaceAll('currentColor', themes.light.iconInk)
    );
    await pointer('onPointerDown', 'Settings');
    expect(control('Settings').style.opacity).toBe(1);
    expect(host.timings.at(-1)).toMatchObject({ useNativeDriver: true });
  });

  it.each(MODES)('floats the %s action tile and presses it into the brand wash', async (mode) => {
    await mount(
      h(RsdIconButton, {
        skin: 'tile',
        icon: 'shapes',
        label: 'Coloring books',
        size: TILE_PX,
        onPress: vi.fn(),
      }),
      { mode }
    );
    const theme = themes[mode];
    expect(control('Coloring books').style).toMatchObject({
      width: TILE_PX,
      height: TILE_PX,
      padding: TILE_PX / 6,
      borderRadius: TILE_PX * 0.3,
      borderWidth: 2,
      borderColor: rgba(theme.floatBorder),
      backgroundColor: theme.floatSurface,
      boxShadow: rgba(theme.floatShadow),
      opacity: 1,
    });
    expect(view().querySelector('svg').getAttribute('width')).toBe(String(TILE_PX - 24));
    await pointer('onPointerDown', 'Coloring books');
    expect(control('Coloring books').style).toMatchObject({
      transform: [{ scale: 0.95 }],
      backgroundColor: theme.brandWash,
    });
    expect(host.timings.at(-1)).toMatchObject({ useNativeDriver: true });
  });

  it('rings a selected tile in the brand and reports it checked', async () => {
    await mount(
      h(RsdIconButton, {
        skin: 'tile',
        icon: 'brush-crayon',
        label: 'Crayon',
        size: TILE_PX,
        ink: '#e53935',
        selection: 'switch',
        selected: true,
        onPress: vi.fn(),
      })
    );
    const tile = control('Crayon');
    expect(tile.role).toBe('switch');
    expect(tile.accessibilityState).toMatchObject({ checked: true });
    expect(tile.style).toMatchObject({
      borderColor: brand.brand,
      backgroundColor: themes.light.brandWash,
      boxShadow: '0 0 0 2px rgba(171, 113, 225, 0.35)',
    });
    expect(markup()).toBe(NATIVE_ICONS['brush-crayon'].light.replaceAll('currentColor', '#e53935'));
  });

  it.each(MODES)(
    'fades a disabled %s tile deeper than the shared step and mutes its glyph',
    async (mode) => {
      await mount(
        h(RsdIconButton, {
          skin: 'tile',
          icon: 'settings',
          label: 'Settings',
          size: TILE_PX,
          disabled: true,
          onPress: vi.fn(),
        }),
        { mode }
      );
      const tile = control('Settings');
      expect(tile.disabled).toBe(true);
      expect(tile.accessibilityState).toMatchObject({ disabled: true });
      expect(tile.style).toMatchObject({
        opacity: 0.3,
        backgroundColor: themes[mode].floatSurfaceHover,
      });
      expect(markup()).toBe(
        NATIVE_ICONS.settings[mode].replaceAll('currentColor', themes[mode].iconMuted)
      );
      expect(tile.style.transform).toEqual([{ scale: 1 }]);
      expect(tile.onPointerDown).toBeUndefined();
    }
  );

  it('presses a flyout option to 0.92 and inks a selected monochrome glyph in the brand', async () => {
    await mount(
      h(RsdIconButton, {
        skin: 'flyout',
        icon: 'settings',
        label: 'Option',
        size: TILE_PX,
        selection: 'radio',
        selected: true,
        onPress: vi.fn(),
      })
    );
    const option = control('Option');
    expect(option.role).toBe('radio');
    expect(option.accessibilityState).toMatchObject({ checked: true });
    expect(option.style).toMatchObject({
      padding: 7,
      borderRadius: TILE_PX * 0.3,
      borderWidth: 2,
      borderColor: brand.brand,
      backgroundColor: themes.light.brandWash,
      boxShadow: '0 0 0 2px rgba(171, 113, 225, 0.35)',
    });
    expect(markup()).toBe(NATIVE_ICONS.settings.light.replaceAll('currentColor', brand.brand));
    await pointer('onPointerDown', 'Option');
    expect(control('Option').style.transform).toEqual([{ scale: 0.92 }]);
  });

  it('leaves an unselected flyout option on the float surface', async () => {
    await mount(
      h(RsdIconButton, {
        skin: 'flyout',
        icon: 'brush-pen',
        label: 'Pen',
        size: TILE_PX,
        ink: '#1e88e5',
        selection: 'radio',
        selected: false,
        onPress: vi.fn(),
      }),
      { mode: 'dark' }
    );
    expect(control('Pen').accessibilityState).toMatchObject({ checked: false });
    expect(control('Pen').style).toMatchObject({
      backgroundColor: themes.dark.floatSurface,
      borderColor: rgba(themes.dark.floatBorder),
    });
    expect(control('Pen').style.boxShadow).toBeUndefined();
  });

  const keylinedPen = (keyline, mode) =>
    mount(
      h(RsdIconButton, {
        skin: 'tile',
        icon: 'brush-pen',
        label: 'Pen',
        size: TILE_PX,
        ink: '#ffffff',
        keyline,
        onPress: vi.fn(),
      }),
      { mode }
    );

  it.each([
    ['white', 'light', '#000'],
    ['white', 'dark', '#000'],
    ['dark', 'dark', themes.dark.darkInkKeyline],
  ])('rings the ink paths for the %s keyline on %s paper', async (keyline, mode, stroke) => {
    await keylinedPen(keyline, mode);
    const inkPaths = NATIVE_ICONS['brush-pen'][mode].match(/fill="currentColor"/g).length;
    const strokes = markup().match(/stroke="[^"]+" stroke-width="[^"]+"/g);
    expect(strokes).toHaveLength(inkPaths);
    // Two screen pixels in the icon's 1000-unit viewBox.
    expect(strokes[0]).toBe(`stroke="${stroke}" stroke-width="${(2 * 1000) / (TILE_PX - 24)}"`);
    expect(markup().match(/fill="#ffffff"/g)).toHaveLength(inkPaths);
  });

  it('draws no dark keyline on light paper, where its token is transparent', async () => {
    await keylinedPen('dark', 'light');
    expect(markup()).toBe(NATIVE_ICONS['brush-pen'].light.replaceAll('currentColor', '#ffffff'));
  });
});

describe('RsdFlyoutMenu', () => {
  it.each(MODES)(
    'cards its options on the %s float surface with concentric corners',
    async (mode) => {
      await mount(
        h(
          RsdFlyoutMenu,
          { label: 'Brushes', direction: 'column', optionSize: 60 },
          h(RsdIconButton, {
            skin: 'flyout',
            icon: 'brush-pen',
            label: 'Pen',
            size: 60,
            onPress: vi.fn(),
          })
        ),
        { mode }
      );
      const menu = host.views.findLast((props) => props.accessibilityLabel === 'Brushes');
      expect(menu.role).toBe('group');
      expect(menu.style).toMatchObject({
        flexDirection: 'column',
        padding: 6,
        gap: 6,
        borderRadius: 60 * 0.3 + 6,
        backgroundColor: themes[mode].floatSurface,
        boxShadow: rgba(themes[mode].floatShadow),
      });
    }
  );
});
