import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from 'react-strict-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brand, scale, themes } from '../../../web/src/lib/design/tokens.ts';
import { darkTheme } from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import * as buttonModule from '../../../experiments/native-architecture/src/rsdDrawing/RsdButton.tsx';
import * as iconButtonModule from '../../../experiments/native-architecture/src/rsdDrawing/RsdIconButton.tsx';
import * as flyoutModule from '../../../experiments/native-architecture/src/rsdDrawing/RsdFlyoutMenu.tsx';
import { INK_KEYLINE_WIDTH_PX } from '../../../experiments/native-architecture/src/rsdDrawing/RsdIcon.tsx';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import { NATIVE_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.generated.ts';

// The released RSD native renderer over a React Native stand-in that records every host's
// props. Animated timings land on their target at once and record their config, so a test reads
// a press's end state and whether it ran on the native driver.
const host = vi.hoisted(() => ({ pressables: [], views: [], texts: [], timings: [], loops: [] }));

vi.mock('react-native', async () => {
  const React = await import('react');
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const recorder = (tag, records) =>
    React.forwardRef((props, ref) => {
      records.push({ ...props, style: flat(props.style) });
      const children = typeof props.children === 'function' ? null : props.children;
      return React.createElement(
        tag,
        { ref, role: props.role, 'aria-label': props.accessibilityLabel },
        children
      );
    });
  const View = recorder('div', host.views);
  const Text = recorder('span', host.texts);
  const Pressable = recorder('div', host.pressables);
  class Value {
    constructor(value) {
      this.value = value;
    }
    setValue(value) {
      this.value = value;
    }
    stopAnimation() {}
    interpolate({ outputRange }) {
      return outputRange.at(-1);
    }
  }
  return {
    Platform: {
      OS: 'ios',
      constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
      select: (values) => values.ios ?? values.native ?? values.default,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
    },
    Animated: {
      createAnimatedComponent: (component) => component,
      View,
      Text,
      Value,
      timing: (value, config) => {
        host.timings.push(config);
        return {
          start(done) {
            value.setValue(config.toValue);
            done?.({ finished: true });
          },
          stop() {},
        };
      },
      loop: (animation) => {
        host.loops.push(animation);
        return { start() {}, stop() {} };
      },
    },
    Easing: new Proxy({}, { get: () => () => (t) => t }),
    useWindowDimensions: () => ({ width: 402, height: 874, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
    StatusBar: () => null,
    View,
    Text,
    Pressable,
    experimental_LayoutConformance: View,
    Image: View,
    TextInput: View,
    __host: View,
  };
});
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
    SvgXml: ({ xml, width, height }) =>
      React.createElement('svg', { 'data-xml': xml, width, height }),
  };
});

const { RsdButton } = buttonModule;
const { RsdIconButton } = iconButtonModule;
const { RsdFlyoutMenu } = flyoutModule;

const rgba = (value) =>
  value.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );
const px = (value) => Number.parseFloat(value);
const MODES = ['light', 'dark'];

let container, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  for (const records of Object.values(host)) records.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function mount(element, { mode = 'light', reduceMotion = 'system' } = {}) {
  await act(async () =>
    root.render(
      h(
        DrawingAppearanceProvider,
        { preference: mode },
        h(
          ReduceMotionPreferenceProvider,
          { preference: reduceMotion },
          h(html.div, { style: mode === 'dark' ? darkTheme : null }, element)
        )
      )
    )
  );
}

const control = (label) =>
  label === undefined
    ? host.pressables.at(-1)
    : host.pressables.findLast((props) => props.accessibilityLabel === label);
// React Native has no inherited text style, so the renderer hands the label its ink and type.
const label = () => host.texts.at(-1).style;
const markup = () => container.querySelector('svg[data-xml]').dataset.xml;

async function pointer(event, label) {
  await act(async () => control(label)[event]());
}

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
      expect(container.textContent).toBe('Send report');
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
    await pointer('onPointerDown');
    expect(control().style.transform).toEqual([{ scale: 0.96 }]);
    expect(host.timings.at(-1)).toMatchObject({
      useNativeDriver: true,
      duration: px(scale.durationFast) * 1000,
    });
    // One state change per press edge, not one render per animation frame.
    expect(host.pressables.length - before).toBeLessThanOrEqual(3);
    await pointer('onPointerUp');
    expect(control().style.transform).toEqual([{ scale: 1 }]);
    await act(async () => control().onPress({ nativeEvent: {} }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('registers no hover state natively, as a touch WebView matches no (hover: hover)', async () => {
    await mount(h(RsdButton, { variant: 'brand', onPress: vi.fn() }, 'Send report'));
    expect(control().onPointerEnter).toBeUndefined();
    expect(control().onMouseEnter).toBeUndefined();
    expect(control().style.backgroundColor).toBe(themes.light.brandSolid);
  });

  it.each(MODES)(
    'parks a disabled button on the neutral %s treatment with no press',
    async (mode) => {
      for (const variant of ['brand', 'outline']) {
        await mount(h(RsdButton, { variant, disabled: true, onPress: vi.fn() }, 'Send report'), {
          mode,
        });
        const button = control();
        expect(button.disabled).toBe(true);
        expect(button.accessibilityState).toMatchObject({ disabled: true, busy: false });
        expect(button.style).toMatchObject({
          backgroundColor: variant === 'outline' ? 'transparent' : themes[mode].controlTrack,
          opacity: Number(scale.disabledOpacity),
          transform: [{ scale: 1 }],
        });
        expect(label().color).toBe(themes[mode].text);
        if (variant === 'outline') expect(button.style.borderColor).toBe(themes[mode].border);
        expect(button.onPointerDown).toBeUndefined();
      }
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
    expect(container.querySelector('svg').getAttribute('width')).toBe('32');
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
    expect(container.querySelector('svg').getAttribute('width')).toBe(String(TILE_PX - 24));
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

  const KEYLINES = [
    ['white', 'light', '#000'],
    ['white', 'dark', '#000'],
    ['dark', 'light', null],
    ['dark', 'dark', themes.dark.darkInkKeyline],
  ];

  it.each(KEYLINES)(
    'rings the ink paths for the %s keyline on %s paper',
    async (keyline, mode, stroke) => {
      await mount(
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
      const icon = NATIVE_ICONS['brush-pen'][mode];
      const inkPaths = icon.match(/fill="currentColor"/g).length;
      const strokes = markup().match(/stroke="([^"]+)" stroke-width="([^"]+)"/g) ?? [];
      if (stroke === null) {
        expect(markup()).toBe(icon.replaceAll('currentColor', '#ffffff'));
        return;
      }
      expect(strokes).toHaveLength(inkPaths);
      const iconPx = TILE_PX - 24;
      // Two screen pixels in the icon's 1000-unit viewBox.
      expect(strokes[0]).toBe(`stroke="${stroke}" stroke-width="${(2 * 1000) / iconPx}"`);
      expect(markup().match(/fill="#ffffff"/g)).toHaveLength(inkPaths);
    }
  );
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

// The values the shipping chrome writes as literals rather than tokens, read from the two shipping
// sources and compared with the native constants.
const SHIPPING_SOURCES = {
  button: /<style>([\s\S]*)<\/style>/.exec(
    readFileSync(
      join(import.meta.dirname, '../../../web/src/lib/components/design/Button.svelte'),
      'utf8'
    )
  )[1],
  app: readFileSync(join(import.meta.dirname, '../../../web/src/app.css'), 'utf8'),
};

function declarations(css, selector) {
  const wanted = selector.replace(/\s+/g, ' ').trim();
  for (const [, selectors, body] of css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (selectors.replace(/\s+/g, ' ').trim() !== wanted) continue;
    return Object.fromEntries(
      body
        .split(';')
        .map((declaration) => declaration.trim())
        .filter(Boolean)
        .map((declaration) => {
          const colon = declaration.indexOf(':');
          return [
            declaration.slice(0, colon).trim(),
            declaration
              .slice(colon + 1)
              .replace(/\s+/g, ' ')
              .trim(),
          ];
        })
    );
  }
  throw new Error(`No shipping rule for ${selector}`);
}

const number = (value, pattern) => {
  const match = pattern.exec(value);
  if (!match) throw new Error(`${value} does not match ${pattern}`);
  return Number(match[1]);
};

// color-mix(in srgb, var(--brand) N%, transparent) is the brand hue at N% alpha.
function brandMix(value) {
  const shadow = /^(.*) color-mix\(in srgb, var\(--brand\) (\d+)%, transparent\)$/.exec(value);
  if (!shadow) throw new Error(`${value} is not a brand mix`);
  const [red, green, blue] = brand.brand
    .slice(1)
    .match(/../g)
    .map((pair) => Number.parseInt(pair, 16));
  return `${shadow[1]} rgba(${red}, ${green}, ${blue}, ${Number(shadow[2]) / 100})`;
}

// calc(<length or var(--token)> - var(--border-width)), resolved against the design scale.
function insetLength(value) {
  const length = (term) => {
    const token = /^var\(--([a-z0-9-]+)\)$/.exec(term);
    const key = token?.[1].replace(/-([a-z0-9])/g, (_, next) => next.toUpperCase());
    return px(key === undefined ? term : scale[key]);
  };
  const calc = /^calc\((.+) - var\(--border-width\)\)$/.exec(value);
  return calc ? length(calc[1]) - px(scale.borderWidth) : length(value);
}

// Splits a value on the spaces outside parentheses.
function terms(value) {
  const parts = [''];
  let depth = 0;
  for (const character of value) {
    depth += character === '(' ? 1 : character === ')' ? -1 : 0;
    if (character === ' ' && depth === 0) parts.push('');
    else parts[parts.length - 1] += character;
  }
  return parts;
}

function outlinePadding(css, size) {
  const [block, inline] = terms(declarations(css, `.outline.${size}`).padding);
  return { block: insetLength(block), inline: insetLength(inline) };
}

const customProperty = (css, name) => {
  const match = new RegExp(`${name}: ([^;]+);`).exec(css);
  if (!match) throw new Error(`No shipping ${name}`);
  return match[1];
};

function shippingChrome({ button, app }) {
  const ring = declarations(button, '.ring');
  const hero = declarations(button, '.hero');
  const tile = declarations(app, '.actions-panel .action-button');
  const flyoutMenu = declarations(app, '.flyout-menu');
  const flyoutOption = declarations(app, '.flyout-option');
  const keylineSelector = (kind) =>
    `.action-button.${kind}-stroke svg path[fill='currentColor'], .brush-menu.${kind}-stroke svg path[fill='currentColor'], .stroke-width-menu.${kind}-stroke svg path:not([fill^='url'])`;
  const whiteKeyline = declarations(app, keylineSelector('white'));
  const darkKeyline = declarations(app, keylineSelector('dark'));
  return {
    BUTTON_PRESS_SCALE: number(
      declarations(button, '.btn:active:not(:disabled)').transform,
      /^scale\(([\d.]+)\)$/
    ),
    BUTTON_LG_PADDING_BLOCK_PX: number(declarations(button, '.lg').padding, /^(\d+)px /),
    BUTTON_HERO_MIN_HEIGHT_PX: number(hero['min-height'], /^(\d+)px$/),
    BUTTON_HERO_GAP_PX: number(hero.gap, /^(\d+)px$/),
    BUTTON_OUTLINE_PADDING_PX: Object.fromEntries(
      ['sm', 'md', 'lg', 'hero'].map((size) => [size, outlinePadding(button, size)])
    ),
    BUSY_RING_SIZE_PX: number(ring.width, /^(\d+)px$/),
    BUSY_RING_BORDER_PX: number(ring.border, /^(\d+)px solid currentColor$/),
    BUSY_RING_OPACITY: Number(ring.opacity),
    BUSY_RING_TURN_MS: number(ring.animation, /^spin ([\d.]+)s linear infinite$/) * 1000,
    BRAND_HERO_SHADOW: brandMix(declarations(button, '.brand.hero')['box-shadow']),
    CORNER_BUTTON_SIZE_PX: number(customProperty(app, '--corner-button-size'), /^(\d+)px$/),
    CORNER_IDLE_OPACITY: Number(declarations(app, '.corner-button').opacity),
    CORNER_HOVER_OPACITY: Number(declarations(app, '.corner-button:hover').opacity),
    CORNER_PRESSED_OPACITY: Number(declarations(app, '.corner-button:active').opacity),
    ACTION_TILE_BORDER_PX: number(tile.border, /^(\d+)px solid var\(--float-border\)$/),
    ACTION_TILE_RADIUS_RATIO: Number(customProperty(app, '--action-btn-radius-ratio')),
    ACTION_TILE_PADDING_SHARE: number(
      tile.padding,
      /^calc\(var\(--action-btn-base\) \/ (\d+) \* var\(--action-btn-scale, 1\)\)$/
    ),
    ACTION_TILE_PRESS_SCALE: number(
      declarations(app, '.actions-panel .action-button:active:not(:disabled):not(.disabled)')
        .transform,
      /^scale\(([\d.]+)\)$/
    ),
    ACTION_TILE_DISABLED_OPACITY: Number(
      declarations(
        app,
        '.actions-panel .action-button:disabled, .actions-panel .action-button.disabled'
      ).opacity
    ),
    ACTION_TILE_HOVER_SHADOW: brandMix(
      declarations(app, '.actions-panel .action-button:hover:not(:disabled):not(.disabled)')[
        'box-shadow'
      ]
    ),
    BRAND_SELECTION_RING: [
      declarations(app, '.actions-panel .action-button.active')['box-shadow'],
      declarations(app, '.flyout-option.active')['box-shadow'],
    ]
      .map(brandMix)
      .reduce((tile, option) => (tile === option ? tile : `${tile} ≠ ${option}`)),
    FLYOUT_OPTION_MIN_BASE_PX: number(
      flyoutMenu['--flyout-option-base'],
      /^max\(var\(--action-btn-base\), (\d+)px\)$/
    ),
    FLYOUT_OPTION_PADDING_PX: number(
      flyoutOption.padding,
      /^calc\((\d+)px \* var\(--action-btn-scale, 1\)\)$/
    ),
    FLYOUT_OPTION_PRESS_SCALE: number(
      declarations(app, '.flyout-option:active').transform,
      /^scale\(([\d.]+)\)$/
    ),
    FLYOUT_MENU_PADDING_PX: number(flyoutMenu['--flyout-menu-padding'], /^(\d+)px$/),
    FLYOUT_MENU_GAP_PX: number(flyoutMenu.gap, /^(\d+)px$/),
    WHITE_INK_KEYLINE: whiteKeyline.stroke,
    INK_KEYLINE_WIDTH_PX: [whiteKeyline['stroke-width'], darkKeyline['stroke-width']]
      .map((width) => number(width, /^(\d+)px$/))
      .reduce((white, dark) => (white === dark ? white : NaN)),
  };
}

const NATIVE_CHROME = {
  ...Object.fromEntries(
    Object.entries({ ...buttonModule, ...iconButtonModule, ...flyoutModule }).filter(([name]) =>
      /^[A-Z][A-Z0-9_]+$/.test(name)
    )
  ),
  INK_KEYLINE_WIDTH_PX,
};

describe('shipping chrome drift', () => {
  it('holds every untokened chrome value to its shipping declaration', () => {
    expect(NATIVE_CHROME).toEqual(shippingChrome(SHIPPING_SOURCES));
  });

  it.each([
    ['button', 'scale(0.96)', 'scale(0.9)', 'BUTTON_PRESS_SCALE'],
    [
      'button',
      'calc(var(--space-3) - var(--border-width))',
      'var(--space-3)',
      'BUTTON_OUTLINE_PADDING_PX',
    ],
    ['app', '--brand) 35%', '--brand) 45%', 'BRAND_SELECTION_RING'],
    ['app', 'stroke: #000;', 'stroke: #111;', 'WHITE_INK_KEYLINE'],
    ['app', '--corner-button-size: 48px', '--corner-button-size: 44px', 'CORNER_BUTTON_SIZE_PX'],
  ])('fails when the shipping %s source changes %s', (source, from, to, constant) => {
    expect(SHIPPING_SOURCES[source]).toContain(from);
    const drifted = shippingChrome({
      ...SHIPPING_SOURCES,
      [source]: SHIPPING_SOURCES[source].replace(from, to),
    });
    expect(drifted[constant]).not.toEqual(NATIVE_CHROME[constant]);
  });
});
