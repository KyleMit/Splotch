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

// The paper area beside the swatch bar on a 390x844 phone, upright and then turned to landscape.
const PORTRAIT_SLOT = { width: 390, height: 704 };
const LANDSCAPE_SLOT = { width: 844, height: 300 };
// [x, y, width, height, pageX, pageY] as View.measure reports the ink plane: a blank picture fills
// the portrait slot; turned to landscape, the portrait picture is contain-fitted and centered.
const PORTRAIT_FRAME = [0, 0, 390, 704, 0, 100];
const FITTED_WIDTH = (LANDSCAPE_SLOT.height * 390) / 704;
const LANDSCAPE_FRAME = [0, 0, FITTED_WIDTH, 300, (LANDSCAPE_SLOT.width - FITTED_WIDTH) / 2, 40];

const sdk = vi.hoisted(() => ({ handlers: null, frame: null, layouts: new Set(), sized: [] }));
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
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: vi.fn(),
  listPictures: async () => [],
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
  Image: ({ resizeMode }) => createElement('img', { 'data-resize-mode': resizeMode }),
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 1 }),
    addEventListener: () => ({ remove() {} }),
  },
  findNodeHandle: (value) => value,
  View: forwardRef(({ children, onLayout, style, testID }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(...sdk.frame) }));
    // The paper host is the one View styled with only its fitted size.
    if (
      style &&
      !Array.isArray(style) &&
      Object.keys(style).join() === 'width,height' &&
      typeof style.width === 'number'
    )
      sdk.sized.push({ width: style.width, height: style.height });
    useLayoutEffect(() => {
      if (!onLayout) return undefined;
      sdk.layouts.add(onLayout);
      return () => sdk.layouts.delete(onLayout);
    }, [onLayout]);
    return createElement('div', { 'data-testid': testID }, children);
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
async function rotate(slot, frame) {
  sdk.frame = frame;
  const { width, height } = slot;
  await act(async () => {
    for (const layout of [...sdk.layouts])
      layout({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
  });
}

// The RSD screen's paper owner, mounted on its own because the RSD screen needs
// the react-strict-dom renderer this suite does not load.
// The slot (RsdPaperSlot) decides whether the sheet is lifted off its margin; the test plays it.
function RsdPaper({ lifted = false }) {
  const screen = useDrawingScreen();
  const sound = useDrawingSound();
  return createElement(NativePaper, { screen, sound, menuOpen: false, lifted });
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sdk.handlers = null;
  sdk.layouts.clear();
  sdk.sized.length = 0;
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
  '%s adopts the portrait slot, keeps its shape after rotating, and maps new touches under the finger',
  async (_name, Screen) => {
    await act(async () => root.render(createElement(Screen)));
    await rotate(PORTRAIT_SLOT, PORTRAIT_FRAME);
    expect(sdk.sized.at(-1)).toEqual(PORTRAIT_SLOT);
    await stroke(
      PORTRAIT_FRAME,
      [
        [39, 70.4],
        [195, 352],
      ],
      100
    );
    const before = structuredClone(owner.history.drawing);
    expect(before.paper).toEqual({
      kind: 'adopted',
      cssWidth: 390,
      cssHeight: 704,
      backingScale: 1,
    });
    expect(before.strokes[0].points).toEqual([
      { x: 56.59, y: 102.4 },
      { x: 283.5, y: 512 },
    ]);
    sdk.sized.length = 0;
    await rotate(LANDSCAPE_SLOT, LANDSCAPE_FRAME);
    expect(owner.history.drawing).toEqual(before);
    expect(sdk.sized.at(-1).height).toBe(300);
    expect(sdk.sized.at(-1).width).toBeCloseTo(FITTED_WIDTH, 9);
    await stroke(
      LANDSCAPE_FRAME,
      [
        [FITTED_WIDTH / 4, 75],
        [FITTED_WIDTH / 2, 150],
      ],
      1000
    );
    expect(owner.history.drawing.strokes).toHaveLength(2);
    expect(owner.history.drawing.strokes[0]).toEqual(before.strokes[0]);
    expect(owner.history.drawing.paper).toEqual(before.paper);
    expect(owner.history.drawing.strokes[1].points).toEqual([
      { x: 141.68, y: 256 },
      { x: 283.5, y: 512 },
    ]);
    sdk.sized.length = 0;
    await rotate(PORTRAIT_SLOT, PORTRAIT_FRAME);
    expect(sdk.sized.at(-1)).toEqual(PORTRAIT_SLOT);
  }
);

// The sheet's own grain: the shipping paper texture beneath the ink, on the sheet itself.
function sheetGrain() {
  const ink = host.querySelector('[data-testid="drawing-paper"]');
  expect(ink).not.toBeNull();
  return ink.parentElement.querySelector(':scope > [data-testid="paper-texture"]');
}

function grainUnderInk() {
  const grain = sheetGrain();
  expect(grain, 'grain on the sheet').not.toBeNull();
  const ink = host.querySelector('[data-testid="drawing-paper"]');
  expect(grain.compareDocumentPosition(ink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(grain.querySelector('img').dataset.resizeMode).toBe('repeat');
}

// A sheet that fills the slot shows the slot's grain through it and paints none of its own; a
// rotation that lifts it off the margin gives it its own.
it('lays the RSD sheet grain under the ink once a rotation lifts the sheet', async () => {
  await act(async () => root.render(createElement(RsdPaper)));
  await rotate(PORTRAIT_SLOT, PORTRAIT_FRAME);
  expect(sheetGrain(), 'a sheet that fills the slot').toBeNull();
  await stroke(
    PORTRAIT_FRAME,
    [
      [39, 70.4],
      [195, 352],
    ],
    100
  );
  await act(async () => root.render(createElement(RsdPaper, { lifted: true })));
  await rotate(LANDSCAPE_SLOT, LANDSCAPE_FRAME);
  expect(sdk.sized.at(-1).width).toBeCloseTo(FITTED_WIDTH, 9);
  grainUnderInk();
});
