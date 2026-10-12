import { coloringBookHistory } from '../../../experiments/native-architecture/src/settings/coloringBook.ts';
import { createOfflineLibrary } from '../../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { act } from 'react';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';

const caller = vi.hoisted(() => {
  let journal = null;
  let upload = new Uint8Array();
  const receipt = (next) =>
    Object.freeze({
      kind: 'prepared',
      journal: Object.freeze({ ...next }),
      nonce: 'c'.repeat(64),
      revision: 1,
      originalRevision: 1,
      originalDigest: 'd'.repeat(64),
      inputDigest: 'e'.repeat(64),
      inputLength: upload.length,
      resultDigest: next.result ? 'f'.repeat(64) : null,
      resultLength: next.result ? 1 : null,
    });
  return {
    realScreen: false,
    drawingList: vi.fn(() => []),
    drawingOpen: vi.fn(),
    paper: null,
    screen: null,
    library: null,
    product: null,
    initialSettings: null,
    settingsStorage: null,
    sound: null,
    menu: null,
    aiAdmit: vi.fn().mockResolvedValue(undefined),
    aiPrepare: vi.fn(async (next, _, bytes) => {
      journal = next;
      upload = bytes.slice();
      return receipt(next);
    }),
    aiReadPreparedUpload: vi.fn(async () => upload.slice()),
    aiRead: vi.fn().mockResolvedValue(null),
    aiWrite: vi.fn(async (next) => {
      journal = next;
      return receipt(next);
    }),
    aiSend: vi.fn(),
    aiRetain: vi.fn(async () => {
      const picture = { uri: 'file:///owned/rsd-ai.png', mime: 'image/png' };
      journal = { ...journal, phase: 'result', result: picture };
      return { picture, receipt: receipt(journal) };
    }),
    aiVaultRead: vi.fn().mockResolvedValue(null),
    aiVaultWrite: vi.fn().mockResolvedValue(undefined),
    feedbackRead: vi.fn().mockResolvedValue(null),
    feedbackWrite: vi.fn().mockResolvedValue(undefined),
    feedbackSend: vi.fn(),
    paperRender: vi.fn(),
  };
});
vi.mock('../../../experiments/native-architecture/src/platform/ai.ts', () => ({
  aiTransport: caller.aiSend,
  admitAiImage: caller.aiAdmit,
  aiVault: {
    installationId: async () => 'a'.repeat(64),
    read: caller.aiVaultRead,
    write: caller.aiVaultWrite,
    remove: async () => {},
  },
  aiStorage: {
    prepare: caller.aiPrepare,
    readPreparedUpload: caller.aiReadPreparedUpload,
    read: caller.aiRead,
    write: caller.aiWrite,
    retain: caller.aiRetain,
    pictures: async () => [],
  },
}));
vi.mock('../../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: async () => ({ id: 'picture-1-fixture' }),
  listPictures: caller.drawingList,
  reopenPicture: caller.drawingOpen,
  savedColoringPageIds: async () => [],
}));
vi.mock('../../../experiments/native-architecture/src/platform/feedback.ts', () => ({
  feedbackTransport: caller.feedbackSend,
  feedbackDevice: () => ({ platform: 'iOS' }),
  feedbackOffline: () => false,
  feedbackPolicyStorage: { read: caller.feedbackRead, write: caller.feedbackWrite },
}));
vi.mock(
  '../../../experiments/native-architecture/src/useDrawingScreen.ts',
  async (importOriginal) => {
    const actual = await importOriginal();
    const { drawingScreenPort } = await import('./rsd-coloring-root-host.mjs');
    return drawingScreenPort(actual, caller, coloringBookHistory);
  }
);
vi.mock('../../../experiments/native-architecture/src/offlineLibrary/runtime.ts', async () => {
  const { offlineRuntimePort } = await import('./rsd-coloring-root-host.mjs');
  return { offlineLibrary: offlineRuntimePort(caller) };
});
vi.mock('../../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: async () => null, write: async () => {} },
    deliver: async () => 'sharing-closed',
  },
}));
vi.mock('../../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: async () => {
    throw new Error('Audio playback is outside this native caller fixture.');
  },
}));
vi.mock('../../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: async () =>
      caller.settingsStorage ? caller.settingsStorage.read() : caller.initialSettings,
    write: async (snapshot) => caller.settingsStorage?.write(snapshot),
  },
}));
vi.mock(
  '../../../experiments/native-architecture/src/product/useDrawingProduct.ts',
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      useDrawingProduct(screen) {
        const product = actual.useDrawingProduct(screen);
        caller.product = product;
        caller.sound = product.sound;
        return product;
      },
    };
  }
);
vi.mock(
  '../../../experiments/native-architecture/src/useDrawingMenu.ts',
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      useDrawingMenu: (screen) =>
        caller.realScreen ? actual.useDrawingMenu(screen) : (caller.menu ?? { open: false }),
    };
  }
);
vi.mock('../../../experiments/native-architecture/src/rsdDrawing/NativePaper.tsx', async () => {
  const React = await import('react');
  const { strokeStyle } =
    await import('../../../experiments/native-architecture/src/drawing/model.ts');
  const { paperPort } = await import('./rsd-coloring-root-host.mjs');
  const port = paperPort(React, strokeStyle, caller);
  return {
    ...port,
    NativePaper(props) {
      caller.paperRender();
      return React.createElement(port.NativePaper, props);
    },
  };
});
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
  dismissals: [],
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
          'aria-label': props.accessibilityLabel,
          'data-checked': props.accessibilityState?.checked,
          'data-native-background': props.style?.backgroundColor,
          'data-native-color': props.style?.color,
          'aria-live': props.accessibilityLiveRegion,
          'data-testid': props.testID,
          value: props.value,
          maxLength: props.maxLength,
          disabled: props.disabled || props.editable === false,
          onInput: props.onChange
            ? (event) => props.onChange({ nativeEvent: { text: event.target.value } })
            : props.onChangeText
              ? (event) => props.onChangeText(event.target.value)
              : undefined,
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
    StatusBar: (props) => {
      records.props.push(props);
      return React.createElement('span', { 'data-status-bar': props.barStyle });
    },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
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
    Animated: {
      createAnimatedComponent: (component) => component,
      View,
      Text,
      Image: View,
      Value: class {
        constructor(value) {
          this.value = value;
        }
        setValue(value) {
          this.value = value;
        }
      },
      timing: (value, config) => ({
        start(done) {
          value.setValue(config.toValue);
          done?.();
        },
        stop() {},
      }),
      sequence: (animations) => ({
        start() {
          for (const animation of animations) animation.start();
        },
        stop() {
          for (const animation of animations) animation.stop();
        },
      }),
    },
    Easing: {},
    useWindowDimensions: () => records.dimensions,
    useColorScheme: () => records.scheme,
    Text,
    Pressable,
    View,
    SafeAreaView: View,
    Modal: (props) => {
      const previous = React.useRef(props.visible);
      React.useEffect(() => {
        if (previous.current === true && props.visible === false) {
          records.dismissals.push(props.accessibilityLabel);
          props.onDismiss?.();
        }
        previous.current = props.visible;
      }, [props.visible, props.onDismiss]);
      return props.visible === false
        ? null
        : React.createElement(
            'div',
            { 'data-native-modal': props.accessibilityLabel },
            React.createElement(View, props)
          );
    },
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
  caller.product = null;
  caller.paperRender.mockClear();
  caller.realScreen = false;
  caller.paper = null;
  caller.drawingList.mockReset().mockReturnValue([]);
  caller.drawingOpen.mockReset();
  caller.settingsStorage = null;
  caller.initialSettings = null;
  const refused = async () => {
    throw new Error('Offline storage is outside this caller fixture.');
  };
  const owner = createOfflineLibrary(
    {
      environment: async () => ({ online: false, metered: false, freeBytes: 0 }),
      list: async () => [],
      read: async () => null,
      write: refused,
      remove: refused,
      move: refused,
      uri: () => {
        throw new Error('Offline artwork is outside this caller fixture.');
      },
      verify: async () => false,
      download: refused,
      dispose() {},
    },
    'full'
  );
  caller.library = { owner, state: owner.snapshot(), remove: () => owner.remove(async () => []) };
});
async function mount(element) {
  const settings = caller.sound?.settings;
  caller.initialSettings =
    settings?.status === 'ready'
      ? JSON.stringify({
          version: 6,
          soundEnabled: settings.soundEnabled,
          strokeWidth: settings.strokeWidth,
          eraserWidth: settings.eraserWidth,
          selectedColor: settings.selectedColor,
          customColors: settings.customColors,
          appearance: settings.appearance,
          aiEnabled: settings.aiEnabled ?? false,
          parentPolicies: settings.parentPolicies ?? {
            ai: 'always',
            feedback: 'always',
            parentCenter: 'always',
          },
          coloringBookEnabled: settings.coloringBookEnabled ?? true,
        })
      : null;
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
  caller.menu = null;
  caller.product = null;
  caller.settingsStorage = null;
  caller.initialSettings = null;
  caller.library.owner.dispose();
  caller.library = null;
  records.scheme = 'light';
  records.dismissals.length = 0;
  caller.sound = null;
  caller.screen = null;
  records.props.length = 0;
  records.viewports.length = 0;
  records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
});

function checkedRadio(node) {
  if (!node || node.getAttribute('role') !== 'radio' || node.dataset.checked !== 'true')
    throw new Error('Missing native checked radio');
}

function checkedSwitch(node, checked) {
  if (!node || node.getAttribute('role') !== 'switch' || node.dataset.checked !== String(checked))
    throw new Error('Missing native checked switch');
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
  const current = () => caller.product?.sound.owner?.settings ?? owner;
  const liveOwner = {
    load: () => current().load(),
    setColor: (color) => current().setColor(color),
    setAppearance: (appearance) => current().setAppearance(appearance),
    dispose: () => current().dispose(),
  };
  return { owner: liveOwner, open, close };
}

export {
  caller,
  records,
  root,
  host,
  mount,
  checkedRadio,
  checkedSwitch,
  visibleSelection,
  assertDisabledBoundary,
  assertPortraitControls,
  createPickerCaller,
};
