import { emptyDrawing } from '../../../experiments/native-architecture/src/drawing/model.ts';
import { coloringBookHistory } from '../../../experiments/native-architecture/src/settings/coloringBook.ts';
import { createOfflineLibrary } from '../../../experiments/native-architecture/src/offlineLibrary/controller.ts';
import { act } from 'react';
import { createSoundSettings } from '../../../experiments/native-architecture/src/settings/soundSettings.ts';
import { PROTECTED_PARENT_POLICIES } from '../../../experiments/native-architecture/src/parentCenter/parentPolicy.ts';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import { displayOrientation, Orientation, orientationCalls } from './rsd-orientation-port.mjs';
import './rsd-native-settings-hub-mocks.mjs';
import { clearSoundPort } from './rsd-native-launch-stores.mjs';

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
    paper: null,
    screen: null,
    library: null,
    product: null,
    online: true,
    initialSettings: null,
    settingsStorage: null,
    sound: null,
    menu: null,
    aiAdmit: vi.fn().mockResolvedValue(undefined),
    saveOriginal: vi.fn(async () => ({ id: 'picture-1-fixture' })),
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
    haptic: vi.fn(),
    get clearSound() {
      return clearSoundPort;
    },
  };
});
vi.mock('../../../experiments/native-architecture/src/platform/useOnline.ts', () => ({
  useOnline: () => caller.online,
}));
vi.mock('../../../experiments/native-architecture/src/platform/ai.ts', () => ({
  aiTransport: caller.aiSend,
  admitAiImage: caller.aiAdmit,
  aiVault: {
    installationId: async () => 'a'.repeat(64),
    pin: async (kind) => ({ kind, reference: 'b'.repeat(64) }),
    readReferenced: async (reference) => {
      if (reference.kind !== 'free') throw new Error('Only fixture free reporting is available.');
      return { kind: 'free', installationId: 'a'.repeat(64) };
    },
    read: caller.aiVaultRead,
    write: caller.aiVaultWrite,
    remove: async () => {},
  },
  aiDismissal: { read: async () => null, write: async () => {} },
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
  savePicture: caller.saveOriginal,
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
    const { drawingScreenPort } = await import('./rsd-coloring-root-host.mjs');
    return drawingScreenPort(await importOriginal(), caller, coloringBookHistory);
  }
);
vi.mock('../../../experiments/native-architecture/src/offlineLibrary/runtime.ts', async () => {
  const { offlineRuntimePort } = await import('./rsd-coloring-root-host.mjs');
  return { offlineLibrary: offlineRuntimePort(caller) };
});
vi.mock('../../../experiments/native-architecture/src/platform/drawingAudio.ts', async () => {
  const { drawingAudioPort } = await import('./rsd-native-animated-host.mjs');
  return drawingAudioPort(caller);
});
vi.mock('../../../experiments/native-architecture/src/platform/clearHaptics.ts', () => ({
  impactThreshold: caller.haptic,
}));
vi.mock('../../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: async () =>
      caller.settingsStorage ? caller.settingsStorage.read() : caller.initialSettings,
    write: async (snapshot) => caller.settingsStorage?.write(snapshot),
  },
}));
// The device lock answers what a case sets; a case that sets nothing sees no lock.
vi.mock('../../../experiments/native-architecture/src/platform/deviceLock.ts', () => ({
  isDeviceLocked: async () => caller.deviceLocked === true,
}));
vi.mock('../../../experiments/native-architecture/src/platform/pencilDoubleTap.ts', () => ({
  subscribePencilDoubleTap(listener) {
    caller.pencilDoubleTap = listener;
    return () => {
      if (caller.pencilDoubleTap === listener) caller.pencilDoubleTap = null;
    };
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
vi.mock('react-native-svg', async () => {
  const { svgPort } = await import('./rsd-coloring-root-host.mjs');
  return svgPort(await import('react'));
});
const records = vi.hoisted(() => ({
  scheme: 'light',
  reduceMotion: false,
  reduceTransparency: false,
  dismissals: [],
  props: [],
  viewports: [],
  announcements: [],
  dimensions: { width: 402, height: 874, scale: 1, fontScale: 1 },
  insets: { top: 0, right: 0, bottom: 0, left: 0 },
  dimensionListeners: new Set(),
  backListeners: new Set(),
  exits: 0,
  os: 'ios',
  nativeModules: {},
  settingsOpened: 0,
  journalHostProps: false,
  statusBarHidden: [],
  statusBarStyles: [],
}));
vi.mock('expo-screen-orientation', () => import('./rsd-orientation-port.mjs'));
vi.mock('react-native-safe-area-context', async () => {
  const { safeAreaPort } = await import('./rsd-coloring-root-host.mjs');
  return safeAreaPort(await import('react'), records);
});
// A click is a press: a Pressable's onPress, or a responder's release once it would be granted.
vi.mock('react-native', async () => {
  const React = await import('react');
  const {
    accessibilityPort,
    animatedPort,
    appStatePort,
    backHandlerPort,
    easingPort,
    platformPort,
    pressNative,
    imagePort,
    useShownStyle,
    committedHostProps,
  } = await import('./rsd-native-animated-host.mjs');
  const host = (tag) =>
    React.forwardRef((props, ref) => {
      records.props.push(props);
      const shown = useShownStyle(props.style);
      return React.createElement(
        tag,
        {
          ref,
          'data-shown-opacity': shown.opacity,
          // Only a case that journals host commits pays for writing every prop out.
          'data-committed-props': records.journalHostProps ? committedHostProps(props) : undefined,
          role: props.role ?? props.accessibilityRole,
          id: props.nativeID,
          'aria-label': props.accessibilityLabel,
          'aria-labelledby': props['aria-labelledby'],
          'aria-modal': props['aria-modal'],
          'data-checked': props.accessibilityState?.checked,
          'data-selected': props.accessibilityState?.selected,
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
          onClick: props.disabled ? undefined : () => pressNative(props),
        },
        props.children
      );
    });
  const Text = host('span'),
    Pressable = host('button'),
    View = host('div');
  return {
    StyleSheet: { create: (value) => value, absoluteFill: {} },
    I18nManager: { isRTL: false, doLeftAndRightSwapInRTL: true },
    StatusBar: Object.assign(
      (props) => {
        records.props.push(props);
        return React.createElement('span', { 'data-status-bar': props.barStyle });
      },
      {
        setHidden: (hidden) => records.statusBarHidden.push(hidden),
        setBarStyle: (style) => records.statusBarStyles.push(style),
      }
    ),
    AppState: appStatePort(records),
    Linking: {
      openSettings: async () => {
        records.settingsOpened += 1;
      },
    },
    BackHandler: backHandlerPort(records),
    ScrollView: React.forwardRef((props, ref) => {
      records.viewports.push(props);
      return React.createElement(
        'section',
        { ref, 'data-testid': props.testID, 'aria-label': props.accessibilityLabel },
        props.children
      );
    }),
    Platform: platformPort(records),
    NativeModules: records.nativeModules,
    AccessibilityInfo: accessibilityPort(records),
    Animated: animatedPort(View, Text),
    Easing: easingPort,
    useWindowDimensions: () => records.dimensions,
    PixelRatio: { get: () => records.dimensions.scale },
    Dimensions: {
      get: () => records.dimensions,
      addEventListener: (_type, listener) => {
        records.dimensionListeners.add(listener);
        return { remove: () => records.dimensionListeners.delete(listener) };
      },
    },
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
      // React Native Web's Modal content is the dialog: role, aria-modal and the caller's labels.
      return props.visible === false
        ? null
        : React.createElement(
            'div',
            { 'data-native-modal': props.accessibilityLabel },
            React.createElement(View, { ...props, role: 'dialog', 'aria-modal': true })
          );
    },
    // Every picture the fixtures hand out reads as a landscape drawing's size.
    Image: imagePort(host('div')),
    TextInput: host('input'),
    requireNativeComponent: () => host('div'),
    experimental_LayoutConformance: View,
  };
});
vi.mock('react-native/Libraries/Text/TextAncestor', async () => {
  const React = await import('react');
  return { default: React.createContext(false) };
});
vi.mock('react-native/Libraries/Components/View/ViewNativeComponent', async () => {
  const { viewNativeComponentPort } = await import('./rsd-native-animated-host.mjs');
  return viewNativeComponentPort(records);
});
let root, host;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  caller.product = null;
  caller.online = true;
  caller.paperRender.mockClear();
  caller.haptic.mockClear();
  caller.realScreen = false;
  caller.paper = null;
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
  // The seed is a version 7 record, which predates the external-links policy.
  const { externalLinks: _links, ...policies } =
    settings?.parentPolicies ?? PROTECTED_PARENT_POLICIES;
  caller.initialSettings =
    settings?.status === 'ready'
      ? JSON.stringify({
          version: 7,
          soundEnabled: settings.soundEnabled,
          strokeWidth: settings.strokeWidth,
          eraserWidth: settings.eraserWidth,
          selectedColor: settings.selectedColor,
          customColors: settings.customColors,
          appearance: settings.appearance,
          aiEnabled: settings.aiEnabled ?? false,
          parentPolicies: policies,
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
  records.reduceMotion = false;
  records.reduceTransparency = false;
  records.dismissals.length = 0;
  caller.sound = null;
  caller.screen = null;
  records.props.length = 0;
  records.statusBarHidden.length = 0;
  records.statusBarStyles.length = 0;
  records.viewports.length = 0;
  records.announcements.length = 0;
  records.dimensions = { width: 402, height: 874, scale: 1, fontScale: 1 };
  records.insets = { top: 0, right: 0, bottom: 0, left: 0 };
  records.backListeners.clear();
  records.exits = 0;
  records.os = 'ios';
  for (const key of Object.keys(records.nativeModules)) delete records.nativeModules[key];
  records.settingsOpened = 0;
  records.journalHostProps = false;
  caller.liveScreen = null;
  caller.exportPng = null;
  caller.deviceLocked = false;
  orientationCalls.length = 0;
  displayOrientation.current = Orientation.PORTRAIT_UP;
});

async function expandControls() {
  const toggle = host.querySelector('[aria-label="Expand controls"]');
  if (!toggle) throw new Error('The tool drawer is not collapsed.');
  await act(async () => toggle.click());
}

// Settings opens on its hub of sections; each control lives on its section's page.
// A hub row is named by its title, status line and any "new", so it is found by its title.
async function openSettingsSection(label) {
  const row = host.querySelector(`[role="list"] button[aria-label^="${label}, "]`);
  if (!row) throw new Error(`No Settings section row named ${label}.`);
  await act(async () => row.click());
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
    caller.screen.dialogOpen = true;
    refresh();
  });
  const close = vi.fn(() => {
    caller.screen.colorPickerOpen = false;
    caller.screen.dialogOpen = false;
    refresh();
  });
  caller.screen = {
    notice: '',
    drawing: false,
    disabled: true,
    brush: 'marker',
    history: { undo: [], drawing: emptyDrawing() },
    recovery: { failed: false },
    pictures: null,
    dialogOpen: false,
    pagePickerOpen: false,
    settingsOpen: false,
    colorPickerOpen: false,
    openColorPicker: open,
    selectInkBrush: vi.fn(),
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
  checkedRadio,
  checkedSwitch,
  visibleSelection,
  assertDisabledBoundary,
} from './rsd-native-assertions.mjs';
export {
  caller,
  records,
  root,
  host,
  mount,
  createPickerCaller,
  expandControls,
  openSettingsSection,
};
