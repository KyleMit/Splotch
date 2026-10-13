// @vitest-environment happy-dom
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import './native-feedback-drawing-fixture.mjs';
import { act, createElement, forwardRef, useImperativeHandle, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';
import { NativePaper } from '../../experiments/native-architecture/src/rsdDrawing/NativePaper.tsx';
import { useDrawingScreen } from '../../experiments/native-architecture/src/useDrawingScreen.ts';
import { useDrawingSound } from '../../experiments/native-architecture/src/useDrawingSound.ts';

// [x, y, width, height, pageX, pageY] as View.measure reports them: the 4:3 paper
// fitted to a portrait phone, then to the same phone turned to landscape.
const PORTRAIT_FRAME = [0, 0, 390, 292.5, 0, 200];
const LANDSCAPE_FRAME = [0, 0, 400, 300, 222, 40];

const sdk = vi.hoisted(() => ({ handlers: null, frame: null, layouts: new Set() }));
let owner, root, host;
vi.mock('../../experiments/native-architecture/src/useDrawingScreen.ts', async (original) => {
  const actual = await original();
  return {
    ...actual,
    useDrawingScreen: () => {
      owner = actual.useDrawingScreen();
      return owner;
    },
  };
});
vi.mock('../../experiments/native-architecture/src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: () => new Promise(() => {}),
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: async () => '{"version":1,"soundEnabled":false}',
    write: async () => {},
  },
}));
vi.mock('../../experiments/native-architecture/src/platform/pngRecovery.ts', () => ({
  pngRecoveryPlatform: {
    storage: { read: async () => null, write: async () => {} },
    deliver: async () => 'sharing-closed',
  },
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: vi.fn(),
  exportPng: vi.fn(),
  listPictures: async () => [],
  reopenPicture: vi.fn(),
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingDraft.ts', () => ({
  drawingDraftStorage: { read: async () => null, write: async () => {} },
  protectedDraftPageIds: async () => [],
}));
vi.mock(
  'react-native-safe-area-context',
  () => import('../lib/native-appearance-frame-fixture.mjs')
);
vi.mock('../../experiments/native-architecture/src/platform/ai.ts', async () =>
  (await import('./native-ai-boundary.mjs')).nativeAiBoundary()
);
vi.mock('react-native', () => ({
  PixelRatio: { get: () => 1 },
  AccessibilityInfo: createAccessibilityInfoFixture(),
  useColorScheme: () => 'light',
  ActivityIndicator: () => null,
  Modal: () => null,
  Pressable: ({ children, onPress, disabled, accessibilityLabel }) =>
    createElement(
      'button',
      { onClick: onPress, disabled, 'aria-label': accessibilityLabel },
      children
    ),
  Text: ({ children }) => createElement('span', null, children),
  SafeAreaView: ({ children }) => createElement('div', null, children),
  Switch: () => null,
  ScrollView: ({ children }) => createElement('div', null, children),
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 1, fontScale: 1 }),
  Platform: { OS: 'ios' },
  Image: () => null,
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 1 }),
    addEventListener: () => ({ remove() {} }),
  },
  findNodeHandle: (value) => value,
  View: forwardRef(({ children, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(...sdk.frame) }));
    useLayoutEffect(() => {
      if (!onLayout) return undefined;
      sdk.layouts.add(onLayout);
      return () => sdk.layouts.delete(onLayout);
    }, [onLayout]);
    return createElement('div', null, children);
  }),
  PanResponder: {
    create: (handlers) => {
      sdk.handlers = handlers;
      return { panHandlers: {} };
    },
  },
  StatusBar: () => null,
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
}));
vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  const empty = () => null;
  return {
    default: forwardRef(({ children }, ref) => createElement('div', { ref }, children)),
    G: group,
    Defs: group,
    Mask: group,
    Pattern: group,
    Filter: group,
    LinearGradient: group,
    Rect: empty,
    Circle: empty,
    Path: empty,
    Use: empty,
    Stop: empty,
    Image: empty,
    FeBlend: empty,
    FeComposite: empty,
  };
});

const TARGET = 101;
function touchEvent(pageX, pageY, timestamp, ended, startTimeStamp) {
  const touch = {
    identifier: 0,
    pageX,
    pageY,
    locationX: pageX,
    locationY: pageY,
    timestamp,
    target: TARGET,
  };
  return {
    currentTarget: TARGET,
    nativeEvent: { target: TARGET, touches: ended ? [] : [touch], changedTouches: [touch] },
    touchHistory: {
      touchBank: [{ touchActive: !ended, startTimeStamp }],
      mostRecentTimeStamp: timestamp,
    },
  };
}
async function stroke(frame, points, start) {
  const [, , , , pageX, pageY] = frame;
  const at = (index, ended = false) =>
    touchEvent(
      pageX + points[index][0],
      pageY + points[index][1],
      start + index * 100,
      ended,
      start
    );
  await act(async () => {
    sdk.handlers.onPanResponderGrant(at(0));
    sdk.handlers.onPanResponderStart(at(0));
  });
  for (let index = 1; index < points.length; index++)
    await act(async () => sdk.handlers.onPanResponderMove(at(index)));
  await act(async () => sdk.handlers.onPanResponderEnd(at(points.length - 1, true)));
}
async function rotate(frame) {
  sdk.frame = frame;
  const [, , width, height] = frame;
  await act(async () => {
    for (const layout of [...sdk.layouts])
      layout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });
}

// The RSD screen's paper owner, mounted on its own because the RSD screen needs
// the react-strict-dom renderer this suite does not load.
function RsdPaper() {
  const screen = useDrawingScreen();
  const sound = useDrawingSound();
  return createElement(NativePaper, { screen, sound, menuOpen: false });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sdk.handlers = null;
  sdk.layouts.clear();
  sdk.frame = PORTRAIT_FRAME;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

it.each([
  ['PaperWorkspace', DrawingScreen],
  ['RSD NativePaper', RsdPaper],
])(
  '%s keeps the picture and remaps new touches to the same paper spot after rotating',
  async (_name, Screen) => {
    await act(async () => root.render(createElement(Screen)));
    await stroke(
      PORTRAIT_FRAME,
      [
        [39, 29.25],
        [195, 146.25],
      ],
      100
    );
    const before = structuredClone(owner.history.drawing);
    expect(before.strokes).toHaveLength(1);
    expect(before.strokes[0].points).toEqual([
      { x: 102.4, y: 76.8 },
      { x: 512, y: 384 },
    ]);
    await rotate(LANDSCAPE_FRAME);
    expect(owner.history.drawing).toEqual(before);
    await stroke(
      LANDSCAPE_FRAME,
      [
        [100, 75],
        [200, 150],
      ],
      1000
    );
    expect(owner.history.drawing.strokes).toHaveLength(2);
    expect(owner.history.drawing.strokes[0]).toEqual(before.strokes[0]);
    expect(owner.history.drawing.paper).toEqual(before.paper);
    expect(owner.history.drawing.strokes[1].points).toEqual([
      { x: 256, y: 192 },
      { x: 512, y: 384 },
    ]);
  }
);
