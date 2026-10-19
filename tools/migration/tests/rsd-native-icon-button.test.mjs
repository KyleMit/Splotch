import { expect, describe, it, vi } from 'vitest';
import { act, createElement as h } from 'react';
import { brand, scale, themes } from '../../../web/src/lib/design/tokens.ts';
import {
  control,
  host,
  markup,
  MODES,
  mount,
  pressIn,
  slideOffAndRelease,
  px,
  rgba,
  view,
} from './rsd-native-button-host.mjs';
import { RsdIconButton } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import { RsdFlyoutMenu } from '../../../experiments/native-architecture/src/rsdDrawing/RsdFlyoutMenu.tsx';
import { NATIVE_ICONS as STARTUP_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';
import { NATIVE_DEFERRED_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.deferred.generated.ts';

// The drawer's tools draw from the deferred module, which the native apps resolve at launch.
const NATIVE_ICONS = { ...STARTUP_ICONS, ...NATIVE_DEFERRED_ICONS };

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
    await pressIn('Settings');
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
    await pressIn('Coloring books');
    expect(control('Coloring books').style).toMatchObject({
      transform: [{ scale: 0.95 }],
      backgroundColor: theme.brandWash,
    });
    expect(host.timings.at(-1)).toMatchObject({ useNativeDriver: true });
  });

  it('rings a selected tile in the brand and exposes native selected state', async () => {
    await mount(
      h(RsdIconButton, {
        skin: 'tile',
        icon: 'brush-crayon',
        label: 'Crayon',
        size: TILE_PX,
        ink: '#e53935',
        selected: true,
        onPress: vi.fn(),
      })
    );
    const tile = control('Crayon');
    expect(tile.role).toBe('button');
    expect(tile.accessibilityState).toMatchObject({ selected: true });
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
      const onPress = vi.fn();
      await mount(
        h(RsdIconButton, {
          skin: 'tile',
          icon: 'settings',
          label: 'Settings',
          size: TILE_PX,
          disabled: true,
          onPress,
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
      const timings = host.timings.length;
      await pressIn('Settings');
      await act(async () => control('Settings').onPress({ nativeEvent: {} }));
      expect(onPress).not.toHaveBeenCalled();
      expect(host.timings).toHaveLength(timings);
      expect(control('Settings').style.transform).toEqual([{ scale: 1 }]);
    }
  );

  it('presses a flyout option to 0.92 and inks a selected monochrome glyph in the brand', async () => {
    await mount(
      h(RsdIconButton, {
        skin: 'flyout',
        icon: 'settings',
        label: 'Option',
        base: TILE_PX,
        scale: 1,
        selected: true,
        onPress: vi.fn(),
      })
    );
    const option = control('Option');
    expect(option.role).toBe('button');
    expect(option.accessibilityState).toMatchObject({ selected: true });
    expect(option.style).toMatchObject({
      padding: 7,
      borderRadius: TILE_PX * 0.3,
      borderWidth: 2,
      borderColor: brand.brand,
      backgroundColor: themes.light.brandWash,
      boxShadow: '0 0 0 2px rgba(171, 113, 225, 0.35)',
    });
    expect(markup()).toBe(NATIVE_ICONS.settings.light.replaceAll('currentColor', brand.brand));
    await pressIn('Option');
    expect(control('Option').style.transform).toEqual([{ scale: 0.92 }]);
  });

  it('leaves an unselected flyout option on the float surface', async () => {
    await mount(
      h(RsdIconButton, {
        skin: 'flyout',
        icon: 'brush-pen',
        label: 'Pen',
        base: TILE_PX,
        scale: 1,
        ink: '#1e88e5',
        selected: false,
        onPress: vi.fn(),
      }),
      { mode: 'dark' }
    );
    expect(control('Pen').accessibilityState).toMatchObject({ selected: false });
    expect(control('Pen').style).toMatchObject({
      backgroundColor: themes.dark.floatSurface,
      borderColor: rgba(themes.dark.floatBorder),
    });
    expect(control('Pen').style.boxShadow).toBeUndefined();
  });

  it.each([
    [55, 1, 60, 7],
    [60, 1, 60, 7],
    [62, 1, 62, 7],
    [68, 1, 68, 7],
    [68, 1.3, 68 * 1.3, 7 * 1.3],
    [55, 0.7, 60 * 0.7, 7 * 0.7],
  ])(
    'sizes a flyout option from a %ipx base at %f× Button Size and pads it by the scale alone',
    async (base, buttonScale, size, padding) => {
      await mount(
        h(RsdIconButton, {
          skin: 'flyout',
          icon: 'settings',
          label: 'Option',
          base,
          scale: buttonScale,
          onPress: vi.fn(),
        })
      );
      const { style } = control('Option');
      expect(style.width).toBeCloseTo(size);
      expect(style.borderRadius).toBeCloseTo(size * 0.3);
      expect(style.padding).toBeCloseTo(padding);
    }
  );

  const RELEASES = [
    [{ skin: 'corner', icon: 'settings' }, 'opacity', 0.5],
    [{ skin: 'tile', icon: 'shapes', size: TILE_PX }, 'transform', [{ scale: 1 }]],
    [{ skin: 'flyout', icon: 'settings', base: TILE_PX, scale: 1 }, 'transform', [{ scale: 1 }]],
  ];

  it.each(RELEASES)(
    'releases the %o skin when a touch slides off and lifts elsewhere',
    async (props, property, rest) => {
      const onPress = vi.fn();
      await mount(h(RsdIconButton, { ...props, label: 'Control', onPress }));
      await slideOffAndRelease('Control');
      expect(control('Control').style[property]).toEqual(rest);
      expect(onPress).not.toHaveBeenCalled();
    }
  );

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

  // react-native-svg's iOS renderer keeps a reused element's transform when the markup now at its
  // index carries none. The eraser's first width wave is moved and scaled and the pen's is not, so
  // the Stroke Width Button left the eraser held drawing a sliver of the pen's waves. Negative
  // control: an unkeyed glyph keeps one svg across the switch and fails the first identity check.
  it('mounts a new glyph or keyline afresh and repaints a recolored glyph in place', async () => {
    const purple = '#ab71e1';
    const strokeTile = (icon, props) =>
      h(RsdIconButton, {
        skin: 'tile',
        size: TILE_PX,
        icon,
        label: 'Stroke width',
        ink: purple,
        onPress: vi.fn(),
        ...props,
      });
    const svg = () => view().querySelector('svg[data-xml]');
    await mount(strokeTile('line-weight-eraser'));
    await vi.waitFor(() => expect(markup()).toContain('transform='));
    const eraser = svg();
    await mount(strokeTile('line-weight-brush'));
    await vi.waitFor(() => expect(markup()).toContain(purple));
    expect(markup()).not.toContain('transform=');
    const pen = svg();
    expect(pen).not.toBe(eraser);
    await mount(strokeTile('line-weight-brush', { dimmed: true }));
    expect(markup()).not.toContain(purple);
    expect(svg()).toBe(pen);
    await mount(strokeTile('line-weight-brush', { keyline: 'white' }));
    expect(markup()).toContain('stroke="#000"');
    expect(svg()).not.toBe(pen);
  });
});

describe('RsdFlyoutMenu', () => {
  it.each(MODES)(
    'cards its options on the %s float surface with concentric corners',
    async (mode) => {
      await mount(
        h(
          RsdFlyoutMenu,
          { label: 'Brushes', direction: 'column', base: 55, scale: 1 },
          h(RsdIconButton, {
            skin: 'flyout',
            icon: 'brush-pen',
            label: 'Pen',
            base: 55,
            scale: 1,
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
