// @vitest-environment happy-dom
import { drawingPaper } from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { canonicalPaper } from './native-paper-fixtures.mjs';
import { act, createElement, forwardRef, useImperativeHandle, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { DrawingSessionProvider } from '../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { strokeStyle } from '../../experiments/native-architecture/src/drawing/model.ts';

const files = vi.hoisted(() => ({
  motionRead: vi.fn().mockResolvedValue(false),
  motionListeners: new Set(),
  appStateListeners: new Set(),
  backListeners: new Set(),
  exitApp: vi.fn(),
  motionRemoves: [],
  motionListenError: null,
  save: vi.fn().mockResolvedValue({ id: 'picture-1-fixture' }),
  list: vi.fn(),
  open: vi.fn(),
  lock: vi.fn(),
  capture: vi.fn(),
  ink: vi.fn(),
  export: vi.fn(),
  aiAdmit: vi.fn().mockResolvedValue(undefined),
  aiPrepare: vi.fn().mockResolvedValue(undefined),
  aiRead: vi.fn().mockResolvedValue(null),
  aiReadPreparedUpload: vi.fn(),
  aiWrite: vi.fn().mockResolvedValue(undefined),
  aiPictures: vi.fn().mockResolvedValue([]),
  aiRetain: vi.fn().mockResolvedValue({ uri: 'file:///owned/ai.png', mime: 'image/png' }),
  aiSend: vi.fn(),
  aiVaultRead: vi.fn().mockResolvedValue(null),
  aiVaultWrite: vi.fn().mockResolvedValue(undefined),
  feedbackRead: vi.fn().mockResolvedValue(null),
  feedbackWrite: vi.fn().mockResolvedValue(undefined),
  feedbackSend: vi.fn(),
  surfaceRender: vi.fn(),
  pngRead: vi.fn().mockResolvedValue(null),
  pngWrite: vi.fn().mockResolvedValue(undefined),
  brushRead: vi.fn().mockResolvedValue(null),
  brushWrite: vi.fn().mockResolvedValue(undefined),
  settingsRead: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":false}'),
  settingsWrite: vi.fn().mockResolvedValue(undefined),
  draftRead: vi.fn().mockResolvedValue(null),
  draftWrite: vi.fn().mockResolvedValue(undefined),
  draftProtected: vi.fn().mockResolvedValue([]),
  cohort: null,
  cohortDrivers: false,
  platform: 'android',
  androidApi: 33,
  scheme: 'light',
  retainClosingModal: false,
  dismissModal: null,
}));

vi.mock('../../experiments/native-architecture/src/platform/ai.ts', () => ({
  aiTransport: files.aiSend,
  admitAiImage: files.aiAdmit,
  aiVault: {
    installationId: async () => 'a'.repeat(64),
    read: files.aiVaultRead,
    write: files.aiVaultWrite,
    remove: async () => {},
  },
  aiStorage: {
    prepare: files.aiPrepare,
    readPreparedUpload: files.aiReadPreparedUpload,
    read: files.aiRead,
    write: files.aiWrite,
    retain: files.aiRetain,
    pictures: files.aiPictures,
  },
}));
vi.mock('../../experiments/native-architecture/src/platform/feedback.ts', () => ({
  feedbackTransport: files.feedbackSend,
  feedbackDevice: () => ({ platform: 'iOS', screen: '400 × 800' }),
  feedbackOffline: () => false,
  feedbackPolicyStorage: { read: files.feedbackRead, write: files.feedbackWrite },
}));

vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: files.pngRead, write: files.pngWrite },
    deliver: async (picture) => {
      await files.export(picture.base64, picture.filename);
      return 'sharing-closed';
    },
  },
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  listPictures: files.list,
  reopenPicture: files.open,
  savePicture: files.save,
  savedColoringPageIds: vi.fn().mockResolvedValue([]),
  exportPng: files.export,
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingDraft.ts', () => ({
  drawingDraftStorage: { read: files.draftRead, write: files.draftWrite },
  protectedDraftPageIds: files.draftProtected,
}));

vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/brushPreferences.ts', () => ({
  brushPreferencesStorage: { read: files.brushRead, write: files.brushWrite },
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: files.settingsRead,
    write: files.settingsWrite,
  },
}));

vi.mock('react-native', () => {
  function container({ children }) {
    return createElement('div', null, children);
  }
  return {
    Animated: {
      Value: class {
        constructor(value) {
          this.value = value;
        }
        setValue(value) {
          this.value = value;
        }
      },
      View: container,
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
    AccessibilityInfo: {
      isReduceMotionEnabled: files.motionRead,
      addEventListener(event, listener) {
        if (files.motionListenError) throw files.motionListenError;
        if (event !== 'reduceMotionChanged') throw new Error('Unexpected accessibility event');
        files.motionListeners.add(listener);
        const remove = vi.fn(() => files.motionListeners.delete(listener));
        files.motionRemoves.push(remove);
        return { remove };
      },
    },
    AppState: {
      currentState: 'active',
      addEventListener(event, listener) {
        if (event !== 'change') throw new Error('Unexpected app state event');
        files.appStateListeners.add(listener);
        return { remove: () => files.appStateListeners.delete(listener) };
      },
    },
    BackHandler: {
      addEventListener(event, listener) {
        if (event !== 'hardwareBackPress') throw new Error('Unexpected back event');
        files.backListeners.add(listener);
        return { remove: () => files.backListeners.delete(listener) };
      },
      exitApp: files.exitApp,
    },
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
      addEventListener: () => ({ remove: vi.fn() }),
    },
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    useColorScheme: () => files.scheme,
    Platform: {
      get OS() {
        return files.platform;
      },
      get Version() {
        return files.androidApi;
      },
    },
    Image: ({ source, accessibilityLabel }) =>
      createElement('img', { src: source?.uri, alt: accessibilityLabel }),
    ActivityIndicator: () => null,
    Switch: ({ value, disabled, onValueChange, accessibilityLabel }) =>
      createElement('button', {
        role: 'switch',
        'aria-label': accessibilityLabel,
        'aria-checked': value,
        disabled,
        onClick: () => onValueChange(!value),
      }),
    Modal: ({
      visible,
      children,
      onDismiss,
      accessibilityLabel,
      animationType,
      onRequestClose,
    }) => {
      const shown = useRef(false);
      if (visible) shown.current = true;
      const retained = files.retainClosingModal && onDismiss && shown.current;
      if (!visible && retained) files.dismissModal = onDismiss;
      return (
        (visible || retained) &&
        createElement(
          'div',
          {
            role: 'dialog',
            'aria-label': accessibilityLabel,
            'data-animation-type': animationType,
            onKeyDown: (event) => {
              if (event.key === 'Escape') onRequestClose?.();
            },
          },
          children
        )
      );
    },
    Pressable: forwardRef(
      (
        {
          children,
          onPress,
          disabled,
          accessibilityLabel,
          accessibilityState,
          accessibilityRole,
          'aria-pressed': pressed,
          style,
        },
        ref
      ) =>
        createElement(
          'button',
          {
            ref,
            onClick: onPress,
            disabled,
            'aria-label': accessibilityLabel,
            role: accessibilityRole,
            'aria-checked': accessibilityState?.checked,
            'aria-pressed': pressed,
            'data-native-selected': accessibilityState?.selected,
            style: Object.assign(
              {},
              ...[typeof style === 'function' ? style({ pressed: false }) : style]
                .flat()
                .filter(Boolean)
            ),
          },
          children
        )
    ),
    SafeAreaView: container,
    ScrollView: container,
    View: container,
    Text: ({ children, accessibilityRole, accessibilityLiveRegion, style }) =>
      createElement(
        'span',
        {
          role: accessibilityRole,
          'aria-live': accessibilityLiveRegion,
          style: Object.assign({}, ...[style].flat().filter(Boolean)),
        },
        children
      ),
    StatusBar: () => null,
    TextInput: forwardRef(
      ({ value, onChangeText, accessibilityLabel, maxLength, editable, multiline }, ref) =>
        createElement(multiline ? 'textarea' : 'input', {
          ref,
          value,
          'aria-label': accessibilityLabel,
          maxLength,
          disabled: editable === false,
          onInput: (event) => onChangeText?.(event.target.value),
        })
    ),
    StyleSheet: { create: (styles) => styles },
  };
});

vi.mock('react-native-svg', () => ({
  default: ({ children }) => createElement('svg', null, children),
  Defs: ({ children }) => createElement('defs', null, children),
  G: ({ children, ...props }) => createElement('g', props, children),
  LinearGradient: ({ children }) => createElement('linearGradient', null, children),
  Stop: () => null,
  Rect: (props) => createElement('rect', props),
  Ellipse: (props) => createElement('ellipse', props),
  Path: (props) => createElement('path', props),
}));

export const STROKE = {
  color: 'Purple',
  brush: 'pen',
  width: 22,
  points: [
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ],
};

vi.mock('../../experiments/native-architecture/src/drawing/DrawingSurface.tsx', () => ({
  DrawingSurface: forwardRef(
    (
      { drawing, onCohort, onDrawingChange, color, brush, strokeWidth, eraserWidth, disabled },
      ref
    ) => {
      files.surfaceRender();
      useImperativeHandle(
        ref,
        () => ({
          refreshGeometry: vi.fn(),
          lockInput: files.lock,
          capturePng: files.capture,
          captureInk: files.ink,
        }),
        []
      );
      const commit = (strokes) => {
        const reference = drawingPaper(drawing);
        onCohort(strokes, reference.kind === 'unadopted' ? canonicalPaper() : reference);
      };
      files.cohort = commit;
      const cohort = () => [
        { ...strokeStyle(brush, color, drawing, strokeWidth), points: STROKE.points },
        { ...strokeStyle('pen', 'Blue', drawing, strokeWidth), points: STROKE.points },
      ];
      return createElement(
        'div',
        null,
        createElement(
          'button',
          {
            'data-testid': 'paper',
            disabled,
            'data-drawing': JSON.stringify(drawing),
            onClick: () =>
              commit([
                {
                  ...strokeStyle(
                    brush,
                    color,
                    drawing,
                    brush === 'eraser' ? eraserWidth : strokeWidth
                  ),
                  points: STROKE.points,
                },
              ]),
          },
          'Draw fixture stroke'
        ),
        files.cohortDrivers
          ? createElement(
              'div',
              { 'data-fixture-cohort-drivers': true },
              createElement(
                'button',
                { onClick: () => commit(cohort()) },
                'Draw two-contact cohort'
              ),
              createElement('button', { onClick: () => onDrawingChange(true) }, 'Begin cohort'),
              createElement('button', { onClick: () => onDrawingChange(true) }, 'Lift one contact'),
              createElement(
                'button',
                {
                  onClick: () => {
                    commit(cohort());
                    onDrawingChange(false);
                  },
                },
                'Finish cohort'
              )
            )
          : null
      );
    }
  ),
}));

export function createScreen({ cohortDrivers = false } = {}) {
  files.cohortDrivers = cohortDrivers;
  const container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  const root = createRoot(container);
  let screenGeneration = 0;
  function render() {
    root.render(
      createElement(
        DrawingSessionProvider,
        null,
        createElement(DrawingScreen, { key: screenGeneration })
      )
    );
  }
  function button(label) {
    return [...container.querySelectorAll('button')].find(
      (element) => element.getAttribute('aria-label') === label || element.textContent === label
    );
  }
  return {
    button,
    container,
    mount: () => act(render),
    // Replacing only the screen exercises the app session's longer lifetime.
    remount: () =>
      act(() => {
        screenGeneration += 1;
        render();
      }),
    close: () => {
      act(() => root.unmount());
      container.remove();
    },
    async click(label) {
      const button = [...container.querySelectorAll('button')].find(
        (element) => element.getAttribute('aria-label') === label || element.textContent === label
      );
      expect(button, label).toBeDefined();
      expect(button.disabled, label).toBe(false);
      await act(async () => button.click());
    },
    async menuClick(label) {
      const opener = [...container.querySelectorAll('button')].find(
        (element) => element.getAttribute('aria-label') === 'Drawing tools'
      );
      expect(opener, 'Drawing tools opener').toBeDefined();
      await this.click(opener.getAttribute('aria-label'));
      expect(this.dialog().getAttribute('aria-label')).toBe('Drawing tools');
      await this.click(label);
    },
    paper: () => container.querySelector('[data-testid="paper"]').getAttribute('data-drawing'),
    dialog: () => container.querySelector('[role="dialog"]'),
  };
}

// The stored choices this screen's controls never change, at their shipping defaults.
export const UNTOUCHED_SETTINGS = {
  saveOnDeleteEnabled: false,
  buttonScale: 100,
  reduceMotion: 'system',
  whatsNewSeen: null,
  pencilEraserEnabled: true,
  applePencilSeen: false,
};
export const pictures = [
  { id: 'picture-1-bad', name: 'Broken picture', modifiedAt: 1 },
  { id: 'picture-2-good', name: 'Good picture', modifiedAt: 2 },
];

export { files };

vi.mock(
  'react-native-safe-area-context',
  () => import('../lib/native-appearance-frame-fixture.mjs')
);

export async function expectSavedSettingsReread(screen) {
  const reads = files.settingsRead.mock.calls.length;
  await screen.click('Manage Parent Center');
  const factors = screen.container.textContent.match(/(\d) × (\d)/);
  expect(factors).not.toBeNull();
  const field = screen.container.querySelector('[aria-label="Grown-up answer"]');
  await act(async () => {
    field.value = String(Number(factors[1]) * Number(factors[2]));
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await screen.click('Check answer');
  await screen.click('Read saved settings again');
  expect(files.settingsRead).toHaveBeenCalledTimes(reads + 1);
  expect(files.settingsWrite).not.toHaveBeenCalled();
  await screen.click('Keep drawing');
}
