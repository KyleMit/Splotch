import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from 'react-strict-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { darkTheme } from '../../../experiments/native-architecture/src/rsdDrawing/tokens.css.ts';
import { DrawingAppearanceProvider } from '../../../experiments/native-architecture/src/drawing/DrawingAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../../experiments/native-architecture/src/drawing/useReduceMotion.ts';

// The released RSD native renderer over a React Native stand-in that records every host's
// props. Animated timings land on their target at once and record their config, so a test reads
// a press's end state and whether it ran on the native driver.
const host = vi.hoisted(() => ({
  pressables: [],
  views: [],
  texts: [],
  timings: [],
  loops: [],
}));

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
    StyleSheet: { create: (styles) => styles },
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

export const rgba = (value) =>
  value.replace(
    /rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)/g,
    (_, red, green, blue, alpha) => `rgba(${red}, ${green}, ${blue}, ${Number(alpha) / 100})`
  );
export const px = (value) => Number.parseFloat(value);
export const MODES = ['light', 'dark'];

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

export async function mount(element, { mode = 'light', reduceMotion = 'system' } = {}) {
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

export const control = (label) =>
  label === undefined
    ? host.pressables.at(-1)
    : host.pressables.findLast((props) => props.accessibilityLabel === label);
// React Native has no inherited text style, so the renderer hands the label its ink and type.
export const label = () => host.texts.at(-1).style;
export const markup = () => container.querySelector('svg[data-xml]').dataset.xml;

// Pressability's lifecycle as React Native drives it: press-in on touch-down and on sliding back
// within reach, press-out on sliding off, on cancellation and on release.
export async function pressIn(label) {
  await act(async () => control(label).onPressIn?.({ nativeEvent: {} }));
}

export async function pressOut(label) {
  await act(async () => control(label).onPressOut?.({ nativeEvent: {} }));
}

// A touch that lands on the control, slides off and lifts elsewhere. The control's host gets the
// pointer-down and press-in, then press-out as the finger leaves; React Native sends the
// pointer-up to whatever is under the finger at release, so the control never receives it.
export async function slideOffAndRelease(label) {
  await act(async () => control(label).onPointerDown?.({ nativeEvent: {} }));
  await pressIn(label);
  await pressOut(label);
}
// The mounted DOM, for reading rendered text and icon markup.
export const view = () => container;

export { host };
