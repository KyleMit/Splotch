import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from 'react-strict-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { brand, scale, themes } from '../../../web/src/lib/design/tokens.ts';
import { darkTheme } from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { NATIVE_DEFERRED_ICONS } from '../../../experiments/native-architecture/src/rsdDrawing/icons.deferred.generated.ts';
import { RsdStatusMessage } from '../../../experiments/native-architecture/src/rsdDrawing/RsdStatusMessage.tsx';
import { RsdVisuallyHidden } from '../../../experiments/native-architecture/src/rsdDrawing/RsdVisuallyHidden.tsx';
import { RsdDisclosure } from '../../../experiments/native-architecture/src/rsdDrawing/RsdDisclosure.tsx';
import { RsdExternalMark } from '../../../experiments/native-architecture/src/rsdDrawing/RsdExternalMark.tsx';
import { RsdConfirmCard } from '../../../experiments/native-architecture/src/rsdDrawing/RsdConfirmCard.tsx';
import { RsdStepNumber } from '../../../experiments/native-architecture/src/rsdDrawing/RsdStepNumber.tsx';
import { RsdScrollCue } from '../../../experiments/native-architecture/src/rsdDrawing/RsdScrollCue.tsx';
import {
  RsdTextArea,
  RsdTextField,
} from '../../../experiments/native-architecture/src/rsdDrawing/RsdTextField.tsx';

// The released RSD native renderer over a React Native stand-in whose host views are DOM nodes
// carrying the accessibility props and resolved style React Native would receive. Each view-like
// host also records any string it receives as a direct child: React Native renders text only
// inside Text, and a raw string under a View is an error on device that a DOM host would show.
const native = vi.hoisted(() => ({
  announce: vi.fn(),
  announceQueued: vi.fn(),
  os: 'ios',
  scroll: null,
  rawText: [],
}));

vi.mock('react-native', async () => {
  const React = await import('react');
  const { animatedPort, easingPort } = await import('./rsd-native-animated-host.mjs');
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const rawText = (name, children) => {
    for (const child of React.Children.toArray(children))
      if (typeof child === 'string' || typeof child === 'number')
        native.rawText.push(`${name}: ${JSON.stringify(child)}`);
  };
  const host = (tag) =>
    React.forwardRef((props, ref) => {
      if (tag !== 'span') rawText(tag, props.children);
      const style = flat(props.style);
      const state = props.accessibilityState ?? {};
      return React.createElement(
        tag,
        {
          ref,
          'data-native': JSON.stringify({
            role: props.role,
            label: props.accessibilityLabel,
            live: props.accessibilityLiveRegion,
            hidden: props.accessibilityElementsHidden,
            expanded: state.expanded,
            placeholderTextColor: props.placeholderTextColor,
            style,
          }),
          onClick: props.onPress,
          onFocus: props.onFocus,
          onBlur: props.onBlur,
        },
        props.children
      );
    });
  const View = host('div');
  const Text = host('span');
  const ScrollView = (props) => {
    rawText('ScrollView', props.children);
    native.scroll = props;
    return React.createElement('div', { 'data-scroll': true }, props.children);
  };
  return {
    Platform: {
      get OS() {
        return native.os;
      },
      constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
      select: (values) => values.ios ?? values.native ?? values.default,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
      announceForAccessibility: native.announce,
      announceForAccessibilityWithOptions: native.announceQueued,
    },
    Animated: animatedPort(View, Text),
    Easing: easingPort,
    StyleSheet: { create: (styles) => styles },
    StatusBar: () => null,
    useWindowDimensions: () => ({ width: 402, height: 874, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
    ScrollView,
    Text,
    TextInput: host('input'),
    Pressable: View,
    experimental_LayoutConformance: View,
    Image: View,
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
  return { SvgXml: ({ xml }) => React.createElement('svg', { 'data-xml': xml }) };
});

let root, container;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.announce.mockClear();
  native.announceQueued.mockClear();
  native.rawText = [];
  native.os = 'ios';
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  expect(native.rawText, 'text rendered directly under a native View').toEqual([]);
  await act(async () => root.unmount());
  container.remove();
});

async function render(element, mode = 'light') {
  await act(async () =>
    root.render(
      h(
        DrawingAppearanceProvider,
        { preference: mode },
        h(html.div, { style: mode === 'dark' && darkTheme }, element)
      )
    )
  );
}

const read = (node) => JSON.parse(node.dataset.native);
const nodes = () =>
  [...container.querySelectorAll('[data-native]')].map((node) => [node, read(node)]);
const find = (predicate) => {
  const match = nodes().find(([, props]) => predicate(props));
  expect(match, String(predicate)).toBeDefined();
  return match;
};
const withRole = (role) => find((props) => props.role === role);
const rgba = (value) =>
  value.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );

const STATUS_LIVE = [
  ['success', 'status', 'polite', 'successWash', 'successText'],
  ['error', 'alert', 'assertive', 'dangerWash', 'dangerText'],
  ['warning', 'status', 'polite', 'warningWash', 'warningText'],
];

it.each(['light', 'dark'])(
  'gives each %s status message its live region and shipping wash',
  async (mode) => {
    for (const [status, role, live, wash, ink] of STATUS_LIVE) {
      await render(h(RsdStatusMessage, { status }, `Saved ${status}.`), mode);
      const [node, props] = withRole(role);
      expect(node.textContent).toBe(`Saved ${status}.`);
      expect(props.live).toBe(live);
      expect(props.style.backgroundColor).toBe(themes[mode][wash]);
      expect(props.style.color).toBe(themes[mode][ink]);
      expect(props.style.borderRadius).toBe(Number.parseFloat(scale.radiusSm));
    }
  }
);

it.each([
  ['success', 'queues'],
  ['warning', 'queues'],
])('%s message %s its announcement behind VoiceOver, inline markup included', async (status) => {
  await render(h(RsdStatusMessage, { status }, h(html.strong, null, 'Heads up.'), ' Later.'));
  expect(native.announceQueued).toHaveBeenCalledWith('Heads up. Later.', { queue: true });
  expect(native.announce).not.toHaveBeenCalled();
});

it('interrupts VoiceOver with an error, and leaves Android to its live region', async () => {
  await render(h(RsdStatusMessage, { status: 'error' }, 'Try again.'));
  expect(native.announce).toHaveBeenCalledWith('Try again.');
  expect(native.announceQueued).not.toHaveBeenCalled();
  native.os = 'android';
  native.announce.mockClear();
  await render(h(RsdStatusMessage, { status: 'error' }, 'Try again later.'));
  await render(h(RsdStatusMessage, { status: 'success' }, 'Sent.'));
  expect(native.announce).not.toHaveBeenCalled();
  expect(native.announceQueued).not.toHaveBeenCalled();
});

it('hides text from the eye but not the screen reader, and makes the live variant a status', async () => {
  await render(h(RsdVisuallyHidden, null, 'three-dot'));
  const [plain, hidden] = find((props) => props.style.position === 'absolute');
  expect(plain.textContent).toBe('three-dot');
  expect([hidden.role, hidden.live, hidden.hidden]).toEqual([undefined, undefined, undefined]);
  expect(hidden.style).toMatchObject({ width: 1, height: 1, overflow: 'hidden' });
  expect(native.announce).not.toHaveBeenCalled();
  expect(native.announceQueued).not.toHaveBeenCalled();
  await render(h(RsdVisuallyHidden, { live: true }, 'Saved to Photos'));
  const [region, live] = withRole('status');
  expect(region.textContent).toBe('Saved to Photos');
  expect(live.live).toBe('polite');
  expect(live.style).toMatchObject({ position: 'absolute', width: 1, height: 1 });
  expect(native.announceQueued).toHaveBeenCalledWith('Saved to Photos', { queue: true });
  expect(native.announce).not.toHaveBeenCalled();
});

it('expands the disclosure on press, announcing the state and turning the chevron', async () => {
  await render(h(RsdDisclosure, { summary: 'Device details' }, h(html.p, null, 'iPad, iOS 18')));
  const summary = () => withRole('button');
  const chevron = () =>
    nodes().find(([node, props]) => props.hidden === true && node.textContent === '›');
  expect(summary()[1].expanded).toBe(false);
  expect(summary()[1].style).toMatchObject({ borderWidth: 0, padding: 0 });
  expect(container.textContent).not.toContain('iPad, iOS 18');
  expect(chevron()[1].style.transform).toBeUndefined();
  await act(async () => summary()[0].click());
  expect(summary()[1].expanded).toBe(true);
  expect(container.textContent).toContain('iPad, iOS 18');
  expect(chevron()[1].style.transform).toEqual([{ rotate: '90deg' }]);
  await act(async () => summary()[0].click());
  expect(summary()[1].expanded).toBe(false);
  expect(container.textContent).not.toContain('iPad, iOS 18');
});

it.each(['light', 'dark'])('draws the %s disclosure shell in the shipping border', async (mode) => {
  await render(h(RsdDisclosure, { summary: 'More' }, h(html.p, null, 'Body')), mode);
  const [, shell] = find((props) => props.style.overflow === 'hidden');
  expect(shell.style.borderColor).toBe(themes[mode].border);
  expect(shell.style.borderRadius).toBe(Number.parseFloat(scale.radiusSm));
});

it.each([
  ['light', 'standalone', 'externalMarkWash', 'iconMuted', undefined],
  ['dark', 'standalone', 'externalMarkWash', 'iconMuted', undefined],
  ['light', 'inline', 'brandWash', null, '#7c50bb'],
  ['dark', 'inline', 'brandWash', null, '#c9a9f0'],
])(
  'names the %s %s external mark and inks its arrow on the shipping blob',
  async (mode, variant, wash, iconInk, ink) => {
    await render(h(RsdExternalMark, { variant, ink }), mode);
    const [node, props] = withRole('img');
    expect(props.label).toBe('(opens outside Splotch)');
    const xml = () => node.querySelector('svg').dataset.xml;
    expect(xml()).toContain(`fill="${themes[mode][wash]}"`);
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(xml()).toContain(NATIVE_DEFERRED_ICONS.external[mode].match(/<path d="([^"]+)"/)[1]);
    });
    expect(xml()).toContain(`fill="${ink ?? themes[mode][iconInk]}"`);
  }
);

it('lays out the confirm card with its title, copy and two caller-owned actions', async () => {
  await render(
    h(RsdConfirmCard, {
      title: 'Leave Splotch?',
      copy: 'This drawing stays while Splotch is in the background.',
      actions: [
        h(html.button, { key: 'stay', 'aria-label': 'Keep drawing' }, 'Keep drawing'),
        h(html.button, { key: 'go', 'aria-label': 'Leave' }, 'Leave'),
      ],
    })
  );
  const [title, heading] = withRole('heading');
  expect(title.textContent).toBe('Leave Splotch?');
  expect(heading.style).toMatchObject({
    color: themes.light.textStrong,
    fontSize: Number.parseFloat(scale.fontSizeXl),
  });
  const [, card] = find((props) => props.style.maxWidth !== undefined);
  expect(card.style).toMatchObject({
    maxWidth: 336,
    paddingTop: Number.parseFloat(scale.space6),
    paddingBottom: Number.parseFloat(scale.space5),
  });
  const cells = nodes().filter(([, props]) => props.style.flexBasis === 140);
  expect(cells.map(([node]) => node.textContent)).toEqual(['Keep drawing', 'Leave']);
});

// color-mix(in srgb, brand p%, base): each channel weighted p : 100 - p.
function shippingMix(mode, strengthKey, baseKey) {
  const channels = (hex) => {
    const full =
      hex.length === 4 ? [...hex.slice(1)].map((digit) => digit + digit).join('') : hex.slice(1);
    return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16));
  };
  const weight = Number.parseFloat(themes[mode][strengthKey]) / 100;
  const base = channels(themes[mode][baseKey]);
  const mixed = channels(brand.brand).map((value, index) =>
    Math.round(value * weight + base[index] * (1 - weight))
  );
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

it.each(['light', 'dark'])(
  'mixes the %s step badge wash and digit ink the way the shipping rule does',
  async (mode) => {
    await render(h(RsdStepNumber, { number: 2, size: 'regular', shape: 'disc' }), mode);
    const [badge, props] = find((candidate) => candidate.hidden === true);
    expect(props.style).toMatchObject({ width: 32, height: 32 });
    expect(props.style.backgroundColor).toBe(shippingMix(mode, 'stepWashStrength', 'surface'));
    const digit = [...badge.querySelectorAll('span')].find((node) => node.textContent === '2');
    expect(read(digit).style.color).toBe(shippingMix(mode, 'stepInkStrength', 'textStrong'));
  }
);

it('draws paint-blob steps as cycling blob paths at the compact size', async () => {
  const paths = [];
  for (const number of [1, 2, 3, 4]) {
    await render(h(RsdStepNumber, { number, size: 'compact', shape: 'blob' }));
    const [badge, props] = find((candidate) => candidate.hidden === true);
    expect(props.style).toMatchObject({ width: 20, height: 20 });
    expect(props.style.backgroundColor).toBeUndefined();
    paths.push(badge.querySelector('svg').dataset.xml.match(/<path d="([^"]+)"/)[1]);
  }
  expect(new Set(paths.slice(0, 3)).size).toBe(3);
  expect(paths[3]).toBe(paths[0]);
});

it.each(['light', 'dark'])(
  'skins the %s fields in the shipping input chrome, ringed in brand while focused',
  async (mode) => {
    await render(
      h('div', null, [
        h(RsdTextField, { key: 'line', accessibilityLabel: 'Access code', placeholder: 'code' }),
        h(RsdTextArea, { key: 'prose', accessibilityLabel: 'Message' }),
      ]),
      mode
    );
    const [line, area] = [...container.querySelectorAll('input')];
    const field = read(line);
    expect(field.label).toBe('Access code');
    expect(field.placeholderTextColor).toBe(themes[mode].textSoft);
    expect(field.style).toMatchObject({
      paddingVertical: Number.parseFloat(scale.space2),
      paddingHorizontal: Number.parseFloat(scale.space3),
      borderWidth: Number.parseFloat(scale.borderWidth),
      borderColor: themes[mode].borderWarmStrong,
      borderRadius: Number.parseFloat(scale.radiusSm),
      backgroundColor: themes[mode].surface,
      color: themes[mode].textStrong,
    });
    expect(field.style.fontFamily).toMatch(/Quicksand/);
    expect(field.style.outlineWidth).toBeUndefined();
    expect(read(area).style).toMatchObject({ minHeight: 88, paddingVertical: 10 });
    await act(async () => line.focus());
    expect(read(line).style).toMatchObject({
      borderColor: brand.brand,
      outlineColor: brand.brand,
      outlineWidth: Number.parseFloat(scale.focusRingWidth),
      outlineOffset: Number.parseFloat(scale.focusRingOffset),
    });
    await act(async () => line.blur());
    expect(read(line).style.borderColor).toBe(themes[mode].borderWarmStrong);
  }
);

// iOS would otherwise ink the indicator by the system appearance rather than the paper beneath it.
it.each([
  ['light', 'black'],
  ['dark', 'white'],
])('inks the %s scroll indicator to stand out on its surface', async (mode, indicator) => {
  await render(h(RsdScrollCue, null, h(html.p, null, 'Long help text')), mode);
  expect(native.scroll.indicatorStyle).toBe(indicator);
});

it.each(['light', 'dark'])(
  'fades the %s scroll end in the surface until the content end is reached',
  async (mode) => {
    await render(h(RsdScrollCue, null, h(html.p, null, 'Long help text')), mode);
    const cue = () =>
      read(container.querySelector('[data-native*="experimental_backgroundImage"]'));
    const surface = rgba(`rgb(${themes[mode].surfaceRgb} / 0%)`);
    expect(cue().style.experimental_backgroundImage).toBe(
      `linear-gradient(to bottom, ${surface}, ${surface.replace(/, 0\)$/, ', 1)')} 80%)`
    );
    expect(cue().hidden).toBe(true);
    expect(cue().style.pointerEvents).toBe('none');
    expect(cue().style.opacity).toBe(0);
    await act(async () => {
      native.scroll.onLayout({ nativeEvent: { layout: { height: 200 } } });
      native.scroll.onContentSizeChange(320, 600);
    });
    expect(cue().style.opacity).toBeUndefined();
    await act(async () => native.scroll.onScroll({ nativeEvent: { contentOffset: { y: 399 } } }));
    expect(cue().style.opacity).toBe(0);
  }
);
