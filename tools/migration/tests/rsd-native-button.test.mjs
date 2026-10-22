import { expect, describe, it, vi } from 'vitest';
import { act, createElement as h } from 'react';
import { brand, scale, themes } from '../../../web/src/lib/design/tokens.ts';
import {
  control,
  host,
  label,
  MODES,
  mount,
  pressIn,
  pressOut,
  slideOffAndRelease,
  px,
  view,
} from './rsd-native-button-host.mjs';
import { RsdButton } from '../../../experiments/native-architecture/src/rsdDrawing/RsdButton.tsx';

describe('RsdButton', () => {
  const VARIANT_FILL = {
    brand: (theme) => ({ fill: { backgroundColor: theme.brandSolid }, ink: brand.onBrand }),
    wash: (theme) => ({ fill: { backgroundColor: theme.brandWash }, ink: theme.brandText }),
    danger: (theme) => ({ fill: { backgroundColor: theme.dangerWash }, ink: theme.dangerText }),
    outline: (theme) => ({
      fill: {
        backgroundColor: 'transparent',
        borderColor: theme.brandText,
        borderWidth: px(scale.borderWidth),
      },
      ink: theme.brandText,
    }),
  };

  it.each(MODES.flatMap((mode) => Object.keys(VARIANT_FILL).map((variant) => [variant, mode])))(
    'paints the %s variant from the %s shipping theme as a named, semibold 48px button',
    async (variant, mode) => {
      await mount(h(RsdButton, { variant, onPress: vi.fn() }, 'Send report'), { mode });
      const button = control();
      const { fill, ink } = VARIANT_FILL[variant](themes[mode]);
      expect(button.style).toMatchObject(fill);
      expect(button.style).toMatchObject({
        minHeight: 48,
        minWidth: 48,
        borderRadius: px(scale.radiusMd),
        transform: [{ scale: 1 }],
      });
      expect(label()).toMatchObject({ color: ink, fontWeight: scale.fontWeightSemibold });
      expect(button.role).toBe('button');
      expect(button.disabled).toBeFalsy();
      expect(view().textContent).toBe('Send report');
    }
  );

  const SIZES = {
    sm: { block: scale.space2, inline: scale.space4, fontSize: scale.fontSizeSm },
    md: { block: scale.space3, inline: scale.space5, fontSize: scale.fontSizeSm },
    lg: { block: '14px', inline: scale.space4, fontSize: scale.fontSizeMd },
    hero: { block: '0px', inline: scale.space6, fontSize: scale.fontSizeLg },
  };

  it.each(Object.entries(SIZES))(
    'steps the %s size padding and label, the outline variant inset by its border',
    async (size, { block, inline, fontSize }) => {
      await mount(h(RsdButton, { size, onPress: vi.fn() }, 'Send report'));
      expect(control().style).toMatchObject({
        paddingTop: px(block),
        paddingBottom: px(block),
        paddingLeft: px(inline),
        paddingRight: px(inline),
      });
      expect(label().fontSize).toBe(px(fontSize));
      await mount(h(RsdButton, { size, variant: 'outline', onPress: vi.fn() }, 'Send report'));
      const border = px(scale.borderWidth);
      expect(control().style).toMatchObject({
        paddingTop: Math.max(0, px(block) - border),
        paddingLeft: px(inline) - border,
      });
    }
  );

  it('makes hero a bold 56px pill whose brand fill lifts on the brand shadow', async () => {
    await mount(h(RsdButton, { size: 'hero', variant: 'brand', onPress: vi.fn() }, 'Try again'));
    expect(control().style).toMatchObject({
      minHeight: 56,
      borderRadius: px(scale.radiusPill),
      gap: 10,
      boxShadow: '0 4px 12px rgba(171, 113, 225, 0.4)',
    });
    expect(label().fontWeight).toBe(scale.fontWeightBold);
  });

  it('presses to 0.96 on the native driver and calls onPress', async () => {
    const onPress = vi.fn();
    await mount(h(RsdButton, { variant: 'brand', onPress }, 'Send report'));
    const before = host.pressables.length;
    await pressIn();
    expect(control().style.transform).toEqual([{ scale: 0.96 }]);
    expect(host.timings.at(-1)).toMatchObject({
      useNativeDriver: true,
      duration: px(scale.durationFast) * 1000,
    });
    // One state change per press edge, not one render per animation frame.
    expect(host.pressables.length - before).toBeLessThanOrEqual(3);
    await pressOut();
    expect(control().style.transform).toEqual([{ scale: 1 }]);
    await act(async () => control().onPress({ nativeEvent: {} }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('releases the press when a touch slides off and lifts elsewhere, and presses again on return', async () => {
    const onPress = vi.fn();
    await mount(h(RsdButton, { variant: 'brand', onPress }, 'Send report'));
    await slideOffAndRelease();
    expect(control().style.transform).toEqual([{ scale: 1 }]);
    expect(onPress).not.toHaveBeenCalled();
    await pressIn();
    await pressOut();
    await pressIn();
    expect(control().style.transform).toEqual([{ scale: 0.96 }]);
  });

  it('registers no hover state natively, as a touch WebView matches no (hover: hover)', async () => {
    await mount(h(RsdButton, { variant: 'brand', onPress: vi.fn() }, 'Send report'));
    expect(control().onPointerEnter).toBeUndefined();
    expect(control().onMouseEnter).toBeUndefined();
    expect(control().style.backgroundColor).toBe(themes.light.brandSolid);
  });

  const PARKED = {
    brand: (theme) => ({ backgroundColor: theme.controlTrack }),
    wash: (theme) => ({ backgroundColor: theme.controlTrack }),
    danger: (theme) => ({ backgroundColor: theme.controlTrack }),
    outline: (theme) => ({ backgroundColor: 'transparent', borderColor: theme.border }),
  };

  it.each(MODES.flatMap((mode) => Object.keys(PARKED).map((variant) => [variant, mode])))(
    'parks a disabled %s button on the neutral %s treatment with no press',
    async (variant, mode) => {
      const onPress = vi.fn();
      await mount(h(RsdButton, { variant, disabled: true, onPress }, 'Send report'), {
        mode,
      });
      const button = control();
      expect(button.disabled).toBe(true);
      expect(button.accessibilityState).toMatchObject({ disabled: true, busy: false });
      expect(button.style).toMatchObject({
        ...PARKED[variant](themes[mode]),
        opacity: Number(scale.disabledOpacity),
        transform: [{ scale: 1 }],
      });
      expect(label().color).toBe(themes[mode].text);
      const timings = host.timings.length;
      await pressIn();
      await act(async () => control().onPress({ nativeEvent: {} }));
      expect(onPress).not.toHaveBeenCalled();
      expect(host.timings).toHaveLength(timings);
      expect(control().style.transform).toEqual([{ scale: 1 }]);
    }
  );

  it('keeps a busy button in its fill, announces busy, and turns its ring on the native driver', async () => {
    await mount(h(RsdButton, { variant: 'brand', busy: true, onPress: vi.fn() }, 'Sending…'));
    const button = control();
    expect(button.disabled).toBe(true);
    expect(button.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(button.style.backgroundColor).toBe(themes.light.brandSolid);
    expect(button.style.opacity).toBeUndefined();
    const ring = host.views.findLast((props) => props.style.width === 14);
    expect(ring.style).toMatchObject({
      height: 14,
      borderTopColor: brand.onBrand,
      borderRightColor: 'transparent',
      borderWidth: 2,
      opacity: 0.9,
    });
    expect(host.loops).toHaveLength(1);
    expect(host.timings).toContainEqual(
      expect.objectContaining({ duration: 800, toValue: 1, useNativeDriver: true })
    );
  });

  it('holds the busy ring still under Reduce Motion', async () => {
    await mount(h(RsdButton, { variant: 'wash', busy: true, onPress: vi.fn() }, 'Sending…'), {
      reduceMotion: 'reduce',
    });
    expect(host.views.findLast((props) => props.style.width === 14).style.borderTopColor).toBe(
      themes.light.brandText
    );
    expect(host.loops).toHaveLength(0);
  });
});
