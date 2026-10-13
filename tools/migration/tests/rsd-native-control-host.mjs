import { vi } from 'vitest';

// The released RSD native renderer over a React Native stand-in for the shared controls: each host
// view paints a DOM node carrying its accessibility props and resolved style, reports a layout the
// test chooses, and keeps its latest props on the node so a test can drive the responder. The
// Reanimated stand-in records every shared-value write so a thumb's travel can be read.
export const host = {
  windowWidth: 402,
  reduceMotion: false,
  rtl: false,
  layoutOf: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  writes: [],
};

vi.mock('react-native', async () => {
  const React = await import('react');
  const { animatedPort, easingPort } = await import('./rsd-native-animated-host.mjs');
  const flat = (style) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  const hostView = (tag) =>
    React.forwardRef((props, ref) => {
      const node = React.useRef(null);
      React.useImperativeHandle(ref, () => node.current);
      React.useLayoutEffect(() => {
        node.current.__rn = { props, style: flat(props.style) };
        props.onLayout?.({ nativeEvent: { layout: host.layoutOf(node.current) } });
      });
      const children =
        typeof props.children === 'function'
          ? props.children({ pressed: false, hovered: false })
          : props.children;
      const value = props.accessibilityValue ?? {};
      return React.createElement(
        tag,
        {
          ref: node,
          role: props.role,
          id: props.nativeID,
          'aria-label': props['aria-label'] ?? props.accessibilityLabel,
          'aria-labelledby': props['aria-labelledby'] ?? props.accessibilityLabelledBy?.join(' '),
          'aria-checked': props.accessibilityState?.checked,
          'aria-selected': props.accessibilityState?.selected,
          'aria-disabled': props.accessibilityState?.disabled,
          'aria-hidden': props['aria-hidden'] ?? props.accessibilityElementsHidden,
          'aria-valuemin': props['aria-valuemin'] ?? value.min,
          'aria-valuemax': props['aria-valuemax'] ?? value.max,
          'aria-valuenow': props['aria-valuenow'] ?? value.now,
          'aria-valuetext': props['aria-valuetext'] ?? value.text,
          'data-focusable': props.focusable,
          'data-testid': props.testID,
          tabIndex: props.tabIndex,
          onKeyDown: props.onKeyDown
            ? (event) =>
                props.onKeyDown({
                  nativeEvent: { key: event.key },
                  preventDefault: () => event.preventDefault(),
                })
            : undefined,
          onKeyUp: props.onKeyUp,
          onClick: props.disabled ? undefined : () => props.onPress?.({ nativeEvent: {} }),
        },
        children
      );
    });
  const View = hostView('div');
  return {
    Platform: {
      OS: 'ios',
      constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
      select: (values) => values.ios ?? values.native ?? values.default,
    },
    I18nManager: {
      get isRTL() {
        return host.rtl;
      },
      doLeftAndRightSwapInRTL: true,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => host.reduceMotion,
      addEventListener: () => ({ remove() {} }),
    },
    StyleSheet: { create: (styles) => styles, absoluteFill: {} },
    Animated: animatedPort(View, hostView('span')),
    Easing: easingPort,
    useWindowDimensions: () => ({ width: host.windowWidth, height: 874, scale: 1, fontScale: 1 }),
    useColorScheme: () => 'light',
    StatusBar: () => null,
    View,
    Text: hostView('span'),
    Pressable: hostView('button'),
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
vi.mock('react-native-reanimated', async () => {
  const React = await import('react');
  const { View } = await import('react-native');
  const sharedValue = (initial) => {
    let current = initial;
    return {
      get value() {
        return current;
      },
      set value(next) {
        host.writes.push(next);
        current = typeof next === 'object' ? next.to : next;
      },
    };
  };
  return {
    default: {
      View: (props) => React.createElement(View, { ...props, testID: 'reanimated-view' }),
    },
    Easing: { bezier: (...curve) => ({ bezier: curve }) },
    ReduceMotion: { Never: 'never' },
    useSharedValue: (initial) => React.useState(() => sharedValue(initial))[0],
    useAnimatedStyle: (worklet) => worklet(),
    withTiming: (to, config) => ({ to, config }),
  };
});

export function resetHost() {
  host.windowWidth = 402;
  host.reduceMotion = false;
  host.rtl = false;
  host.layoutOf = () => ({ x: 0, y: 0, width: 0, height: 0 });
  host.writes.length = 0;
}

// The React Native props and resolved style the stand-in last received for this node.
export function native(node) {
  return node.__rn;
}
