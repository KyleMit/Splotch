// @vitest-environment happy-dom
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { useDrawingScreen } from '../../experiments/native-architecture/src/useDrawingScreen.ts';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';

const sdk = vi.hoisted(() => ({
  handlers: null,
  frames: new Map(),
  nextFrame: 0,
  measurements: [],
  autoMeasure: true,
  frame: [0, 0, 1024, 768, 40, 800],
  captures: [],
  hold: false,
  fail: false,
  opened: null,
  save: vi.fn(),
  export: vi.fn(),
  soundStart: vi.fn(),
  soundStop: vi.fn(),
  soundVolume: vi.fn(),
  soundDispose: vi.fn(),
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
vi.mock('../../experiments/native-architecture/src/platform/drawingDraft.ts', () => {
  const storage = { read: async () => null, write: async () => {} };
  return {
    drawingDraftStorage: storage,
    protectedDraftPageIds: async () => [],
  };
});
vi.mock('react-native', () => ({
  PixelRatio: { get: () => 1 },
  AccessibilityInfo: createAccessibilityInfoFixture(),
  useColorScheme: () => 'light',
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  findNodeHandle: (owner) => owner,
  View: forwardRef(({ children, style }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(complete) {
        sdk.measurements.push(complete);
        if (sdk.autoMeasure) complete(...sdk.frame);
      },
    }));
    return createElement('div', { style }, children);
  }),
  PanResponder: {
    create: (handlers) => {
      sdk.handlers = handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  Dimensions: {
    get: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    addEventListener: () => ({ remove() {} }),
  },
  Platform: { OS: 'android' },
  Image: ({ source, onLoad }) => {
    useEffect(
      () => onLoad({ nativeEvent: { source: { uri: source.uri, width: 1024, height: 768 } } }),
      [source.uri]
    );
    return null;
  },
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
vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: async () => null, write: async () => {} },
    deliver: async () => {
      return 'sharing-closed';
    },
  },
}));

// Save picture is this suite's probe of the current drawing; the photo library copy it also
// makes is covered by native-save-to-photos-mounted.test.mjs.
vi.mock('../../experiments/native-architecture/src/platform/photoLibrary.ts', () => ({
  photoLibrary: null,
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: sdk.save,
  exportPng: sdk.export,
  listPictures: () => [],
  reopenPicture: async () => sdk.opened,
}));

const PAPER_TARGET = 101;
let owner, root, host;
function Consumer() {
  owner = useDrawingScreen();
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
async function send(name, value, start = name === 'onPanResponderGrant') {
  await act(async () => {
    sdk.handlers[name](value);
    if (start) sdk.handlers.onPanResponderStart(value);
  });
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
  sdk.opened = drawing;
  await act(async () => owner.openPicture({ id: 'fixture', name: 'Fixture', modifiedAt: 1 }));
  await settle();
}
async function twoContacts() {
  await send('onPanResponderGrant', event([touch(0, 10, 20)]));
  await send(
    'onPanResponderStart',
    event([touch(0, 30, 40, 200), touch(1, 80, 90, 200)], [touch(1, 80, 90, 200)], { 0: 100 }),
    false
  );
  await send(
    'onPanResponderEnd',
    event([touch(0, 50, 60, 300)], [touch(1, 100, 110, 300)], { 0: 100, 1: 200 }),
    false
  );
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  sdk.frames.clear();
  sdk.captures.length = 0;
  sdk.measurements.length = 0;
  sdk.autoMeasure = true;
  sdk.hold = false;
  sdk.fail = false;
  sdk.frame = [0, 0, 1024, 768, 40, 800];
  sdk.save.mockClear();
  sdk.export.mockClear();
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
  await act(async () => root.render(createElement(Consumer)));
  expect(owner.brushPreferences.status).toBe('ready');
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

export { sdk, owner, root, host, touch, event, send, settle, open, twoContacts };
