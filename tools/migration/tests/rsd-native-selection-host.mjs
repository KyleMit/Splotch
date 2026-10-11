import { act } from 'react';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';

const caller = vi.hoisted(() => ({ screen: null, sound: null }));
vi.mock('../../../experiments/native-architecture/src/useDrawingScreen.ts', () => ({
  useDrawingScreen: () => caller.screen,
}));
vi.mock('../../../experiments/native-architecture/src/useDrawingSound.ts', () => ({
  useDrawingSound: () => caller.sound,
}));
vi.mock('../../../experiments/native-architecture/src/useDrawingMenu.ts', () => ({
  useDrawingMenu: () => ({ open: false }),
}));
vi.mock('../../../experiments/native-architecture/src/rsdDrawing/NativePaper.tsx', () => ({
  NativePaper: () => null,
}));
vi.mock('../../../experiments/native-architecture/src/rsdDrawing/RsdRecoveryNotice.tsx', () => ({
  RsdRecoveryNotice: () => null,
}));
vi.mock('react-native-svg', async () => {
  const React = await import('react');
  const Svg = ({ children }) => React.createElement('div', null, children);
  return { default: Svg, Defs: Svg, LinearGradient: Svg, Rect: Svg, Stop: Svg };
});
const records = vi.hoisted(() => ({
  scheme: 'light',
  props: [],
  viewports: [],
  dimensions: { width: 402, height: 874, scale: 1, fontScale: 1 },
}));
vi.mock('react-native-safe-area-context', async () => {
  const React = await import('react');
  const boundary = (kind) => (props) => {
    records.props.push(props);
    return React.createElement(
      'div',
      {
        'data-safe-area-kind': kind,
        'data-testid': props.testID,
      },
      props.children
    );
  };
  return { SafeAreaProvider: boundary('provider'), SafeAreaView: boundary('padding') };
});
vi.mock('react-native', async () => {
  const React = await import('react');
  const host = (tag) =>
    React.forwardRef((props, ref) => {
      records.props.push(props);
      return React.createElement(
        tag,
        {
          ref,
          role: props.role,
          disabled: props.disabled,
          'aria-label': props.accessibilityLabel,
          'data-checked': props.accessibilityState?.checked,
          'data-native-background': props.style?.backgroundColor,
          'data-native-color': props.style?.color,
          'aria-live': props.accessibilityLiveRegion,
          'data-testid': props.testID,
          onClick: props.disabled ? undefined : () => props.onPress?.({ nativeEvent: {} }),
        },
        props.children
      );
    });
  const Text = host('span'),
    Pressable = host('button'),
    View = host('div');
  return {
    StyleSheet: { create: (value) => value },
    AppState: { addEventListener: () => ({ remove() {} }) },
    ScrollView: React.forwardRef((props, ref) => {
      records.viewports.push(props);
      return React.createElement(
        'section',
        { ref, 'data-testid': props.testID, 'aria-label': props.accessibilityLabel },
        props.children
      );
    }),
    Platform: {
      OS: 'ios',
      constants: { reactNativeVersion: { major: 0, minor: 86, patch: 3 } },
      select: (values) => values.ios ?? values.native ?? values.default,
    },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
    },
    Animated: { createAnimatedComponent: (component) => component, View, Text, Image: View },
    Easing: {},
    useWindowDimensions: () => records.dimensions,
    useColorScheme: () => records.scheme,
    Text,
    Pressable,
    View,
    SafeAreaView: View,
    Modal: View,
    Image: View,
    TextInput: host('input'),
    experimental_LayoutConformance: View,
  };
});
vi.mock('react-native/Libraries/Text/TextAncestor', async () => {
  const React = await import('react');
  return { default: React.createContext(false) };
});
vi.mock('react-native/Libraries/Components/View/ViewNativeComponent', async () => {
  const React = await import('react');
  return {
    default: React.forwardRef((props, ref) => {
      records.props.push(props);
      return React.createElement(
        'div',
        { ref, role: props.role, 'aria-label': props.accessibilityLabel },
        props.children
      );
    }),
  };
});
let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
});
async function mount(element) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(element));
  return host;
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  host?.remove();
  root = null;
  records.scheme = 'light';
  records.props.length = 0;
  records.viewports.length = 0;
  records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
});

function checkedRadio(node) {
  if (!node || node.getAttribute('role') !== 'radio' || node.dataset.checked !== 'true')
    throw new Error('Missing native checked radio');
}

function visibleSelection(node) {
  const color = node?.querySelector('span')?.dataset.nativeColor;
  if (
    !node?.dataset.nativeBackground ||
    node.dataset.nativeBackground === 'transparent' ||
    !color ||
    node.dataset.nativeBackground === color
  )
    throw new Error('Missing contrasting native selected treatment');
}

function assertDisabledBoundary(props, disabled) {
  if (props?.accessibilityState?.disabled !== disabled)
    throw new Error('Missing explicit native disabled boolean');
}

function assertPortraitControls(props) {
  if (
    props?.testID !== 'rsd-paint-controls-viewport' ||
    props.style?.maxHeight !== '45%' ||
    props.style.flexGrow !== 0 ||
    props.accessible !== false
  )
    throw new Error('Missing bounded native controls owner');
}

function createPickerCaller(refresh) {
  const owner = createSoundSettings(
    { read: async () => null, write: async () => {} },
    (settings) => {
      caller.sound.settings = settings;
      refresh();
    }
  );
  const open = vi.fn(() => {
    caller.screen.colorPickerOpen = true;
    caller.screen.disabled = true;
    refresh();
  });
  const close = vi.fn(() => {
    caller.screen.colorPickerOpen = false;
    caller.screen.disabled = false;
    refresh();
  });
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: true,
    brush: 'marker',
    history: { undo: [] },
    recovery: { failed: false },
    pictures: null,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    openColorPicker: open,
    closeColorPicker: close,
  };
  caller.sound = { settings: null, owner: { settings: owner }, audioMessage: '' };
  return { owner, open, close };
}

export {
  caller,
  records,
  root,
  host,
  mount,
  checkedRadio,
  visibleSelection,
  assertDisabledBoundary,
  assertPortraitControls,
  createPickerCaller,
};
