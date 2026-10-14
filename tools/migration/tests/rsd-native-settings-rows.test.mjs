import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from 'react-strict-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brand, scale, themes } from '../../../web/src/lib/design/tokens.ts';
import {
  SHIPPING,
  SHIPPING_STRONG_TRACKING,
  SHIPPING_THUMB_FACE,
  SHIPPING_TRACKING,
} from './rsd-settings-rows-shipping.mjs';
import { darkTheme } from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import { RsdToggleSwitch } from '../../../experiments/native-architecture/src/rsdDrawing/RsdToggleSwitch.tsx';
import { RsdToggleRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdToggleRow.tsx';
import {
  RsdSettingCard,
  RsdSettingGroup,
  RsdSettingSectionBody,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdSettingCard.tsx';
import { RsdRuleLabel } from '../../../experiments/native-architecture/src/rsdDrawing/RsdRuleLabel.tsx';
import { RsdHubRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdHubRow.tsx';
import { RsdSidebarRow } from '../../../experiments/native-architecture/src/rsdDrawing/RsdSidebarRow.tsx';

// The released RSD native renderer over a React Native stand-in that paints each host as a DOM
// node carrying its resolved style and accessibility props, and a Reanimated stand-in that
// records each UI-thread timing instead of running it.
const native = vi.hoisted(() => ({ reduceMotion: false, rtl: false, timings: [] }));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { animatedPort, easingPort } = await import('./rsd-native-animated-host.mjs');
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const host = (tag) =>
    React.forwardRef((props, ref) =>
      React.createElement(
        tag,
        {
          ref,
          id: props.nativeID,
          role: props.accessibilityRole ?? props.role,
          'aria-label': props.accessibilityLabel,
          'aria-hidden': props.accessibilityElementsHidden ? 'true' : undefined,
          'data-hint': props.accessibilityHint,
          'data-checked': props.accessibilityState?.checked,
          'data-disabled': props.accessibilityState?.disabled,
          'data-testid': props.testID,
          'data-lines': props.numberOfLines,
          'data-style': JSON.stringify(flat(props.style)),
          onClick: props.disabled ? undefined : () => props.onPress?.({ nativeEvent: {} }),
        },
        props.children
      )
    );
  const View = host('div');
  const Text = host('span');
  return {
    Platform: {
      OS: 'ios',
      constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
      select: (values) => values.ios ?? values.native ?? values.default,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => native.reduceMotion,
      addEventListener: () => ({ remove() {} }),
    },
    I18nManager: {
      get isRTL() {
        return native.rtl;
      },
      doLeftAndRightSwapInRTL: true,
    },
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    StatusBar: () => null,
    Animated: animatedPort(View, Text),
    Easing: easingPort,
    useWindowDimensions: () => ({ width: 402, height: 874, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
    Text,
    View,
    Pressable: host('button'),
    experimental_LayoutConformance: View,
    Image: View,
    TextInput: View,
    __host: View,
  };
});
vi.mock(
  '../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.ts',
  () => import('../../../experiments/native-architecture/src/rsdDrawing/sidebarRowFade.native.ts')
);
vi.mock('react-native/Libraries/Text/TextAncestor', async () => {
  const React = await import('react');
  return { default: React.createContext(false) };
});
vi.mock('react-native/Libraries/Components/View/ViewNativeComponent', async () => ({
  default: (await import('react-native')).__host,
}));
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  return {
    SvgXml: ({ width, height }) => React.createElement('svg', { 'data-icon': true, width, height }),
  };
});
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const { __host: View } = await import('react-native');
  return {
    default: { View },
    Easing: { bezier: (...points) => ({ bezier: points }) },
    ReduceMotion: { Never: 'never' },
    useSharedValue: (initial) => React.useState(() => ({ value: initial }))[0],
    useAnimatedStyle: (updater) => updater(),
    withTiming: (toValue, config) => {
      native.timings.push({ toValue, ...config });
      return toValue;
    },
  };
});

const px = (value) => Number.parseFloat(value);
const durationMs = (value) => Number.parseFloat(value) * 1000;

let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.reduceMotion = false;
  native.rtl = false;
  native.timings.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

// A transition between two renders hands the native host an animated value mid-flight; a fresh
// mount shows the state's own resting style.
async function remount() {
  await act(async () => root.unmount());
  root = createRoot(host);
}

// Settles the device reduce-motion read, as the screen's first render does.
async function render(element, { theme = 'light', reduceMotion = 'system' } = {}) {
  await act(async () =>
    root.render(
      h(
        DrawingAppearanceProvider,
        { preference: theme },
        h(
          ReduceMotionPreferenceProvider,
          { preference: reduceMotion },
          h(html.div, { style: theme === 'dark' ? darkTheme : null }, element)
        )
      )
    )
  );
}

const style = (node) => {
  expect(node, 'host node').not.toBeNull();
  return JSON.parse(node.dataset.style);
};
const byTestId = (id) => host.querySelector(`[data-testid="${id}"]`);
const switchNode = () => host.querySelector('[role="switch"]');

function toggleSwitch(props = {}) {
  return h(RsdToggleSwitch, {
    id: 'demo-toggle',
    label: 'Sound',
    checked: false,
    onToggle: () => {},
    ...props,
  });
}

describe('RsdToggleSwitch', () => {
  it('turns on and off through a switch that reports its checked state', async () => {
    const onToggle = vi.fn();
    await render(toggleSwitch({ onToggle }));
    expect(switchNode().dataset.checked).toBe('false');
    await act(async () => switchNode().click());
    expect(onToggle).toHaveBeenLastCalledWith(true);
    await render(toggleSwitch({ checked: true, onToggle }));
    expect(switchNode().dataset.checked).toBe('true');
    await act(async () => switchNode().click());
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  it.each(['light', 'dark'])(
    'paints the %s track, ring and thumb at the shipping geometry',
    async (theme) => {
      await render(toggleSwitch(), { theme });
      const box = style(switchNode().parentElement);
      expect([box.width, box.height]).toEqual([SHIPPING.switchWidth, SHIPPING.touchTargetMin]);
      const track = style(byTestId('toggle-switch-track'));
      const inset = (SHIPPING.touchTargetMin - SHIPPING.trackHeight) / 2;
      expect([track.top, track.bottom, track.left, track.right]).toEqual([inset, inset, 0, 0]);
      expect(track.backgroundColor).toBe(themes[theme].controlTrack);
      expect(track.borderColor).toBe(themes[theme].iconMuted);
      expect(track.borderWidth).toBe(px(scale.borderWidth));
      expect(track.borderRadius).toBe(px(scale.radiusPill));
      const thumb = style(byTestId('toggle-switch-thumb'));
      expect([thumb.width, thumb.height]).toEqual([SHIPPING.thumb, SHIPPING.thumb]);
      expect(thumb.backgroundColor).toBe(SHIPPING_THUMB_FACE);
      const slot = style(byTestId('toggle-switch-slide').parentElement);
      expect([slot.top, slot.left]).toEqual([
        (SHIPPING.touchTargetMin - SHIPPING.thumb) / 2,
        SHIPPING.thumbLeft,
      ]);

      await remount();
      await render(toggleSwitch({ checked: true }), { theme });
      const on = style(byTestId('toggle-switch-track'));
      expect([on.backgroundColor, on.borderColor]).toEqual([brand.brand, brand.brand]);
    }
  );

  it('slides the thumb on the UI thread over the shipping duration and curve', async () => {
    await render(toggleSwitch({ checked: true }));
    expect(style(byTestId('toggle-switch-slide')).transform).toEqual([
      { translateX: SHIPPING.slide },
    ]);
    native.timings.length = 0;
    await render(toggleSwitch({ checked: false }));
    expect(native.timings).toEqual([
      {
        toValue: 0,
        duration: durationMs(scale.durationBase),
        easing: { bezier: [0.25, 0.1, 0.25, 1] },
        reduceMotion: 'never',
      },
    ]);
    await render(toggleSwitch({ checked: true }));
    expect(native.timings.at(-1)).toMatchObject({ toValue: SHIPPING.slide });
  });

  // React Native mirrors the slot's `left` inset to the trailing edge in a swapped RTL layout;
  // the translation is physical. Where the thumb's box then lies inside the hit area:
  async function thumbSpan(checked) {
    await remount();
    await render(toggleSwitch({ checked }));
    const slot = style(byTestId('toggle-switch-slide').parentElement);
    const [{ translateX }] = style(byTestId('toggle-switch-slide')).transform;
    const origin = native.rtl ? SHIPPING.switchWidth - slot.left - SHIPPING.thumb : slot.left;
    return [origin + translateX, origin + translateX + SHIPPING.thumb];
  }

  it('mirrors the thumb inside the track in a right-to-left layout', async () => {
    const ltr = [await thumbSpan(false), await thumbSpan(true)];
    native.rtl = true;
    const rtl = [await thumbSpan(false), await thumbSpan(true)];
    const mirror = ([start, end]) => [SHIPPING.switchWidth - end, SHIPPING.switchWidth - start];
    expect(rtl).toEqual(ltr.map(mirror));
    for (const [start, end] of [...ltr, ...rtl]) {
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(SHIPPING.switchWidth);
    }
    native.timings.length = 0;
    await render(toggleSwitch({ checked: false }));
    await render(toggleSwitch({ checked: true }));
    expect(native.timings.at(-1)).toMatchObject({ toValue: -SHIPPING.slide });
  });

  it('lands the thumb without sliding under reduced motion', async () => {
    await render(toggleSwitch(), { reduceMotion: 'reduce' });
    native.timings.length = 0;
    await render(toggleSwitch({ checked: true }), { reduceMotion: 'reduce' });
    expect(native.timings).toEqual([expect.objectContaining({ toValue: SHIPPING.slide })]);
    expect(native.timings[0].duration).toBe(0);
  });

  it('carries a sun or moon glyph in brand ink on the thumb', async () => {
    await render(toggleSwitch({ thumbIcon: 'theme-dark' }));
    const glyph = byTestId('toggle-switch-thumb').querySelector('svg');
    expect([Number(glyph.getAttribute('width')), Number(glyph.getAttribute('height'))]).toEqual([
      SHIPPING.glyph,
      SHIPPING.glyph,
    ]);
  });
});

function toggleRow(props = {}) {
  return h(RsdToggleRow, {
    icon: 'sound',
    label: 'Sound',
    id: 'sound-toggle',
    checked: false,
    onToggle: () => {},
    help: 'Plays drawing sounds.',
    ...props,
  });
}

describe('RsdToggleRow', () => {
  it('names the switch by its label and describes it by the help line', async () => {
    await render(toggleRow());
    const control = switchNode();
    expect(control.getAttribute('aria-label')).toBe('Sound');
    expect(control.dataset.hint).toBe('Plays drawing sounds.');
    expect(control.id).toBe('sound-toggle');
    expect(byTestId('sound-toggle-help').textContent).toBe('Plays drawing sounds.');
    const labelHalf = control.closest('[data-testid="sound-toggle-row"]').firstElementChild;
    expect(labelHalf.getAttribute('aria-hidden')).toBe('true');
    expect(labelHalf.textContent).toBe('Sound');
  });

  it('leaves the switch undescribed when the row has no help line', async () => {
    await render(toggleRow({ help: undefined }));
    expect(switchNode().dataset.hint).toBeUndefined();
    expect(byTestId('sound-toggle-help')).toBeNull();
  });

  it('toggles from its label as the shipping <label for> does', async () => {
    const onToggle = vi.fn();
    await render(toggleRow({ onToggle }));
    const labelHalf = byTestId('sound-toggle-row').firstElementChild;
    await act(async () => labelHalf.click());
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it.each(['light', 'dark'])('lays out the %s icon, label and indented help', async (theme) => {
    await render(toggleRow(), { theme });
    const row = byTestId('sound-toggle-row');
    expect(style(row)).toMatchObject({ flexDirection: 'row', justifyContent: 'space-between' });
    const labelHalf = row.firstElementChild;
    expect(style(labelHalf).gap).toBe(SHIPPING.settingIconGap);
    const icon = labelHalf.querySelector('svg');
    expect(Number(icon.getAttribute('width'))).toBe(SHIPPING.settingIcon);
    const label = style(labelHalf.querySelector('span'));
    expect(label).toMatchObject({
      color: themes[theme].text,
      fontSize: px(scale.fontSizeSm),
    });
    const help = style(byTestId('sound-toggle-help'));
    expect(help).toMatchObject({
      marginTop: SHIPPING.helpGap,
      marginLeft: SHIPPING.settingIcon + SHIPPING.settingIconGap,
      color: themes[theme].textSoft,
      fontSize: px(scale.fontSizeSm),
    });
  });

  it('dims a disabled row and refuses both the switch and its label', async () => {
    const onToggle = vi.fn();
    await render(toggleRow({ onToggle, disabled: true }));
    expect(switchNode().dataset.disabled).toBe('true');
    expect(style(byTestId('sound-toggle-row')).opacity).toBe(Number(scale.disabledOpacity));
    expect(style(byTestId('sound-toggle-help')).opacity).toBe(Number(scale.disabledOpacity));
    await act(async () => switchNode().click());
    await act(async () => byTestId('sound-toggle-row').firstElementChild.click());
    expect(onToggle).not.toHaveBeenCalled();
  });
});

describe('setting cards and RsdRuleLabel', () => {
  it.each(['light', 'dark'])('stacks %s cards on the raised surface', async (theme) => {
    await render(
      h(
        RsdSettingSectionBody,
        null,
        h(RsdSettingGroup, null, h(RsdSettingCard, null, h(html.span, null, 'One'))),
        h(RsdSettingGroup, null, h(RsdSettingCard, null, h(html.span, null, 'Two')))
      ),
      { theme }
    );
    expect(style(byTestId('setting-section-body')).gap).toBe(SHIPPING.groupGap);
    expect(style(byTestId('setting-group')).gap).toBe(px(scale.space2));
    expect(style(byTestId('setting-card'))).toMatchObject({
      backgroundColor: themes[theme].surface2,
      borderRadius: px(scale.radiusLg),
      paddingTop: SHIPPING.cardPaddingY,
      paddingBottom: SHIPPING.cardPaddingY,
      paddingLeft: SHIPPING.cardPaddingX,
      paddingRight: SHIPPING.cardPaddingX,
    });
  });

  it.each(['light', 'dark'])('sets the %s rule label and its strong tier', async (theme) => {
    await render(h(RsdRuleLabel, null, 'Heading'), { theme });
    const xs = px(scale.fontSizeXs);
    expect(style(byTestId('rule-label-heading'))).toMatchObject({
      color: themes[theme].labelInk,
      fontSize: xs,
      letterSpacing: SHIPPING_TRACKING * xs,
      textTransform: 'uppercase',
    });
    expect(style(byTestId('rule-label-hairline'))).toMatchObject({
      flexGrow: 1,
      height: px(scale.borderWidth),
      backgroundColor: themes[theme].border,
    });
    await render(h(RsdRuleLabel, { as: 'h4', strong: true }, 'Strong heading'), { theme });
    const sm = px(scale.fontSizeSm);
    expect(style(byTestId('rule-label-heading'))).toMatchObject({
      color: themes[theme].text,
      fontSize: sm,
      letterSpacing: SHIPPING_STRONG_TRACKING * sm,
    });
  });
});

function hubRow(props = {}) {
  return h(RsdHubRow, {
    icon: 'sound',
    title: 'Sound',
    subtitle: 'Drawing sounds on',
    unseen: false,
    onOpen: () => {},
    ...props,
  });
}

describe('RsdHubRow', () => {
  it('is a button named by its title and subtitle that opens its section', async () => {
    const onOpen = vi.fn();
    await render(hubRow({ onOpen }));
    const row = host.querySelector('[role="button"]');
    expect(row.getAttribute('aria-label')).toBe('Sound, Drawing sounds on');
    await act(async () => row.click());
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it.each(['light', 'dark'])(
    'sets the %s tile, icon column and two-line subtitle',
    async (theme) => {
      await render(hubRow(), { theme });
      expect(style(byTestId('hub-tile'))).toMatchObject({
        backgroundColor: themes[theme].surface2,
        borderRadius: px(scale.radiusLg),
      });
      const icon = host.querySelector('svg');
      expect(Number(icon.getAttribute('width'))).toBe(SHIPPING.hubIcon);
      expect(style(icon.parentElement)).toMatchObject({
        width: SHIPPING.hubIconBox,
        height: SHIPPING.hubIconBox,
      });
      const subtitle = byTestId('hub-subtitle');
      expect(Number(subtitle.dataset.lines)).toBe(SHIPPING.hubLines);
      expect(style(subtitle)).toMatchObject({ color: themes[theme].textSoft });
      expect(style(subtitle.parentElement).gap).toBe(SHIPPING.hubTextGap);
    }
  );

  it('shows the activity dot only while the section has news, and says so', async () => {
    await render(hubRow());
    const seen = style(byTestId('section-activity-dot'));
    expect(seen.opacity).toBe(0);
    await remount();
    await render(hubRow({ unseen: true }));
    const dot = style(byTestId('section-activity-dot'));
    expect(dot).toMatchObject({
      opacity: 1,
      backgroundColor: brand.brand,
      borderColor: themes.light.surface2,
      borderWidth: SHIPPING.dotRing,
      width: SHIPPING.dot + 2 * SHIPPING.dotRing,
      top: -(SHIPPING.dotOffset + SHIPPING.dotRing),
    });
    expect(host.querySelector('[role="button"]').getAttribute('aria-label')).toBe(
      'Sound, Drawing sounds on, new'
    );
  });

  it('answers a toggled section inline with a hairline and a trailing switch', async () => {
    const onToggle = vi.fn();
    await render(hubRow());
    expect(switchNode()).toBeNull();
    expect(byTestId('hub-split')).toBeNull();
    await render(
      hubRow({ toggle: { id: 'hubSoundToggle', label: 'Sound', checked: true, onToggle } })
    );
    const control = switchNode();
    expect(control.getAttribute('aria-label')).toBe('Sound');
    expect(control.dataset.checked).toBe('true');
    expect(style(byTestId('hub-split'))).toMatchObject({
      width: px(scale.borderWidth),
      height: SHIPPING.hubSplit,
      backgroundColor: themes.light.border,
    });
    expect(style(byTestId('hub-split').parentElement).gap).toBe(SHIPPING.hubActionGap);
    await act(async () => control.click());
    expect(onToggle).toHaveBeenCalledWith(false);
  });
});

function sidebarRow(props = {}) {
  return h(RsdSidebarRow, {
    icon: 'sound',
    label: 'Sound',
    unseen: false,
    active: false,
    onSelect: () => {},
    ...props,
  });
}

// The row's ink reaches its label as React Native text style, inherited from the row.
const labelInk = () => style(byTestId('sidebar-row').querySelector(':scope > span')).color;

describe('RsdSidebarRow', () => {
  it.each(['light', 'dark'])(
    'marks the %s active row with the brand rail and wash',
    async (theme) => {
      await render(sidebarRow(), { theme });
      const rest = style(byTestId('sidebar-row'));
      expect(rest).toMatchObject({
        minHeight: SHIPPING.tocRow,
        paddingTop: SHIPPING.tocPaddingY,
        borderLeftWidth: px(scale.borderWidth),
        borderLeftColor: themes[theme].border,
        paddingLeft: px(scale.space4),
      });
      expect(rest.backgroundColor).toBe('transparent');
      expect(labelInk()).toBe(themes[theme].textSoft);
      await remount();
      await render(sidebarRow({ active: true }), { theme });
      expect(style(byTestId('sidebar-row'))).toMatchObject({
        borderLeftWidth: SHIPPING.tocSegment,
        borderLeftColor: brand.brand,
        paddingLeft: px(scale.space4) - SHIPPING.tocSegment + px(scale.borderWidth),
        backgroundColor: themes[theme].brandWash,
      });
      expect(labelInk()).toBe(themes[theme].brandText);
    }
  );

  // A section change re-renders both rows in place: the one it leaves and the one it reaches.
  it.each(['light', 'dark'])(
    'paints the %s label ink of a row whose reading position moves in place',
    async (theme) => {
      await render(sidebarRow(), { theme });
      await render(sidebarRow({ active: true }), { theme });
      expect(labelInk()).toBe(themes[theme].brandText);
      await render(sidebarRow({ active: false }), { theme });
      expect(labelInk()).toBe(themes[theme].textSoft);
    }
  );

  it('selects its section and carries the icon with its activity dot', async () => {
    const onSelect = vi.fn();
    await render(sidebarRow({ unseen: true, onSelect }));
    const row = byTestId('sidebar-row');
    expect(row.getAttribute('aria-label')).toBe('Sound, new');
    expect(Number(row.querySelector('svg').getAttribute('width'))).toBe(SHIPPING.tocIcon);
    expect(style(byTestId('section-activity-dot'))).toMatchObject({
      opacity: 1,
      borderColor: themes.light.surface,
    });
    await act(async () => row.click());
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
