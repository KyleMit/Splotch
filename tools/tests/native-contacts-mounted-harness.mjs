// @vitest-environment happy-dom
import { createPaperInputView, paperInputPacket } from './native-paper-fixtures.mjs';
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { useDrawingScreen } from '../../experiments/native-architecture/src/useDrawingScreen.ts';
import { useDrawingUndoShortcut } from '../../experiments/native-architecture/src/product/useDrawingUndoShortcut.ts';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';
import { createHistory } from '../../experiments/native-architecture/src/drawing/model.ts';
import {
  DrawingSessionProvider,
  useDrawingHistory,
} from '../../experiments/native-architecture/src/product/DrawingSession.tsx';

vi.mock('../../experiments/native-architecture/src/platform/networkReturn.ts', () => ({
  subscribeNetworkReturn: () => () => {},
}));

const sdk = vi.hoisted(() => ({
  input: null,
  shortcut: null,
  sequence: 0,
  frames: new Map(),
  nextFrame: 0,
  measurements: [],
  autoMeasure: true,
  frame: [0, 0, 1024, 768, 40, 800],
  captures: [],
  hold: false,
  fail: false,
  save: vi.fn(),
  soundStart: vi.fn(),
  soundStop: vi.fn(),
  soundVolume: vi.fn(),
  soundDispose: vi.fn(),
  screenRenders: 0,
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: vi.fn(async () => ({
    start: sdk.soundStart,
    stop: sdk.soundStop,
    setVolume: sdk.soundVolume,
    dispose: sdk.soundDispose,
  })),
}));
vi.mock('../../experiments/native-architecture/src/platform/brushPreferences.ts', () => ({
  brushPreferencesStorage: { read: async () => null, write: async () => {} },
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: vi.fn().mockResolvedValue('{"version":1,"soundEnabled":true}'),
    write: vi.fn(),
  },
}));
vi.mock('react-native', () => {
  const View = forwardRef(({ children, style, onShortcutKey }, ref) => {
    if (onShortcutKey) sdk.shortcut = onShortcutKey;
    useImperativeHandle(ref, () => ({
      measure(complete) {
        sdk.measurements.push(complete);
        if (sdk.autoMeasure) complete(...sdk.frame);
      },
    }));
    return createElement('div', { style }, children);
  });
  return {
    PixelRatio: { get: () => 1 },
    AccessibilityInfo: createAccessibilityInfoFixture(),
    BackHandler: { addEventListener: () => ({ remove() {} }), exitApp() {} },
    useColorScheme: () => 'light',
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    findNodeHandle: (owner) => owner,
    View,
    requireNativeComponent: (name) =>
      name === 'SplotchPaperInput'
        ? createPaperInputView(View, (emit) => {
            sdk.input = emit;
          })
        : View,
    StyleSheet: { create: (styles) => styles, absoluteFill: {} },
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
      addEventListener: () => ({ remove() {} }),
    },
    Platform: { OS: 'android' },
    // Android's SVG capture returns exactly the pixels it was asked for, so a decoded capture
    // reports the grid of the request that produced it.
    Image: ({ source, onLoad }) => {
      useEffect(() => {
        const { width, height } = sdk.captures.at(-1)?.options ?? { width: 1024, height: 768 };
        onLoad({ nativeEvent: { source: { uri: source.uri, width, height } } });
      }, [source.uri]);
      return null;
    },
  };
});
// The saved picture's compositor paints through Skia's native module, which Node cannot load;
// native-picture-export.test.mjs covers what it paints.
vi.mock('../../experiments/native-architecture/src/drawing/pictureCompose.ts', () => ({
  composePicture: async (layer) => layer,
}));
vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: forwardRef(({ children, width, viewBox }, ref) => {
      useImperativeHandle(ref, () => ({
        toDataURL(callback, options) {
          sdk.captures.push({ callback, options, width, viewBox });
          if (sdk.fail) throw new Error('SDK capture failure');
          if (!sdk.hold) callback('SDK image fixture; no pixel claim');
        },
      }));
      return createElement('div', { 'data-svg': width }, children);
    }),
    G: ({ children, mask }) => createElement('div', { 'data-mask-use': mask }, children),
    Mask: ({ children }) => createElement('div', { 'data-mask': true }, children),
    Defs: group,
    Pattern: group,
    LinearGradient: group,
    Filter: group,
    Path: () => null,
    Use: () => null,
    Circle: () => null,
    Rect: () => null,
    Stop: () => null,
    FeBlend: () => null,
    FeComposite: () => null,
    Image: ({ href, onLoad }) => {
      useEffect(() => onLoad?.(), [href]);
      return createElement('div', { 'data-image': href });
    },
  };
});

// The live photo-library save and retry behavior is covered by rsd-native-save-to-photos.test.mjs.
vi.mock('../../experiments/native-architecture/src/platform/photoLibrary.ts', () => ({
  photoLibrary: { save: sdk.save },
}));

const PAPER_TARGET = 101;
let owner, historyOwner, root, host;
function Consumer() {
  sdk.screenRenders += 1;
  historyOwner = useDrawingHistory();
  owner = useDrawingScreen();
  useDrawingUndoShortcut(owner, false);
  const sound = useDrawingSound();
  return createElement(DrawingSurface, {
    sound: sound.owner?.contacts ?? null,
    key: owner.recovery.generation,
    ref: owner.surface,
    drawing: owner.history.drawing,
    currentDrawing: owner.currentDrawing,
    color: sound.settings.selectedColor,
    strokeWidth: sound.settings.strokeWidth,
    eraserWidth: sound.settings.eraserWidth,
    brush: owner.brush,
    disabled: owner.busy || owner.sheetOpen || sound.settings.status === 'loading',
    ...owner.recovery.callbacks,
  });
}
function touch(identifier, x, y, timestamp = 100) {
  return {
    identifier,
    tool: 'pen',
    locationX: -900,
    locationY: -800,
    pageX: x + 40,
    pageY: y + 800,
    timestamp,
    target: PAPER_TARGET,
  };
}
function event(touches, changedTouches = touches, starts = {}) {
  const touchBank = [];
  for (const t of [...touches, ...changedTouches])
    touchBank[t.identifier] = {
      touchActive: touches.some(({ identifier }) => identifier === t.identifier),
      startTimeStamp: starts[t.identifier] ?? t.timestamp,
    };
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank,
      mostRecentTimeStamp: Math.max(
        0,
        ...[...touches, ...changedTouches].map(({ timestamp }) => timestamp)
      ),
    },
  };
}
function deliver(phase, value) {
  const packet = paperInputPacket(phase, value, sdk.sequence++, {
    width: 1104,
    height: 1608,
    bottomInset: 0,
  });
  if (packet) sdk.input({ nativeEvent: packet });
}
async function send(phase, value) {
  await act(async () => deliver(phase, value));
}
async function settle() {
  for (let count = 0; count < 8; count += 1)
    await act(async () => {
      const frames = [...sdk.frames.values()];
      sdk.frames.clear();
      for (const frame of frames) frame(0);
    });
}
async function open(drawing) {
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  await settle();
  await act(async () => historyOwner.setHistory(createHistory(drawing)));
  await settle();
  return owner.history.drawing;
}
async function twoContacts() {
  await send('start', event([touch(0, 10, 20)]));
  await send(
    'start',
    event([touch(0, 30, 40, 200), touch(1, 80, 90, 200)], [touch(1, 80, 90, 200)], { 0: 100 }),
    false
  );
  await send(
    'end',
    event([touch(0, 50, 60, 300)], [touch(1, 100, 110, 300)], { 0: 100, 1: 200 }),
    false
  );
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  sdk.input = null;
  sdk.shortcut = null;
  sdk.sequence = 0;
  sdk.frames.clear();
  sdk.captures.length = 0;
  sdk.measurements.length = 0;
  sdk.autoMeasure = true;
  sdk.hold = false;
  sdk.fail = false;
  sdk.screenRenders = 0;
  sdk.frame = [0, 0, 1024, 768, 40, 800];
  sdk.save.mockClear();
  sdk.soundStart.mockClear();
  sdk.soundStop.mockClear();
  sdk.soundVolume.mockClear();
  sdk.soundDispose.mockClear();
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++sdk.nextFrame;
    sdk.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => sdk.frames.delete(id));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(createElement(DrawingSessionProvider, null, createElement(Consumer)))
  );
  expect(owner.brushPreferences.status).toBe('ready');
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

export {
  sdk,
  owner,
  historyOwner,
  root,
  host,
  touch,
  event,
  send,
  deliver,
  settle,
  open,
  twoContacts,
  Consumer,
};
