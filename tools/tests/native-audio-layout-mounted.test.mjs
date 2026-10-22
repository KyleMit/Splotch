import { paperProjection, drawingPaper } from '../../src/drawing/paperSpace.ts';
// @vitest-environment happy-dom
import { createPaperInputView, paperInputPacket } from './native-paper-fixtures.mjs';
import { createAccessibilityInfoFixture } from '../lib/native-accessibility-fixture.mjs';
import './native-feedback-drawing-fixture.mjs';
import {
  act,
  createElement,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NativePaper } from '../../src/rsdDrawing/NativePaper.tsx';
import { useDrawingScreen } from '../../src/useDrawingScreen.ts';
import { useDrawingSound } from '../../src/useDrawingSound.ts';

const sdk = vi.hoisted(() => ({
  input: null,
  sequence: 0,
  loads: [],
  contentChanges: 0,
  frame: [0, 0, 1024, 768, 40, 800],
}));
let owner, root, host;
vi.mock('../../src/useDrawingScreen.ts', async (original) => {
  const actual = await original();
  return {
    ...actual,
    useDrawingScreen: () => {
      owner = actual.useDrawingScreen();
      return owner;
    },
  };
});
vi.mock('../../src/platform/drawingAudio.ts', () => ({
  loadDrawingLoop: (signal) =>
    new Promise((resolve, reject) => sdk.loads.push({ signal, resolve, reject })),
}));
vi.mock('../../src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: async () => '{"version":1,"soundEnabled":true}',
    write: async () => {},
  },
}));

vi.mock('react-native', () => {
  const View = forwardRef(({ children }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(...sdk.frame) }));
    return createElement('div', null, children);
  });
  return {
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
    ScrollView: ({ children, onContentSizeChange }) => {
      const content = useRef(null),
        previous = useRef(null);
      useLayoutEffect(() => {
        const text = content.current.textContent;
        if (previous.current !== null && text !== previous.current) {
          sdk.contentChanges += 1;
          onContentSizeChange?.(1024, text.length);
        }
        previous.current = text;
      });
      return createElement('div', { ref: content }, children);
    },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
    Platform: { OS: 'android' },
    Image: () => null,
    Dimensions: {
      get: () => ({ width: 1024, height: 768, scale: 1 }),
      addEventListener: () => ({ remove() {} }),
    },
    findNodeHandle: (value) => value,
    View,
    requireNativeComponent: (name) =>
      name === 'SplotchPaperInput'
        ? createPaperInputView(View, (emit) => {
            sdk.input = emit;
          })
        : View,
    StatusBar: () => null,
    StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  };
});
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
function Paper() {
  const screen = useDrawingScreen();
  const sound = useDrawingSound();
  return createElement(NativePaper, {
    screen,
    sound,
    projection: paperProjection(drawingPaper(screen.history.drawing)),
    menuOpen: false,
    lifted: false,
    frame: { left: 0, top: 0, width: sdk.frame[2], height: sdk.frame[3] },
  });
}
const TARGET = 101;
function event(x, y, timestamp, ended = false) {
  const touch = {
    identifier: 0,
    pageX: x + 40,
    pageY: y + 800,
    locationX: x,
    locationY: y,
    timestamp,
    target: TARGET,
  };
  return {
    currentTarget: TARGET,
    nativeEvent: { target: TARGET, touches: ended ? [] : [touch], changedTouches: [touch] },
    touchHistory: {
      touchBank: [{ touchActive: !ended, startTimeStamp: 100 }],
      mostRecentTimeStamp: timestamp,
    },
  };
}
async function send(phase, x, y, timestamp, ended = false) {
  const packet = paperInputPacket(phase, event(x, y, timestamp, ended), sdk.sequence++, {
    width: 1104,
    height: 1608,
    bottomInset: 0,
  });
  if (packet) await act(async () => sdk.input({ nativeEvent: packet }));
}

beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sdk.input = null;
  sdk.sequence = 0;
  sdk.loads.length = 0;
  sdk.contentChanges = 0;
  sdk.frame = [0, 0, 1024, 768, 40, 800];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(Paper)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it('retains the live cohort through a measured paper-frame change', async () => {
  await send('start', 10, 20, 100);
  await send('move', 30, 40, 200);
  sdk.frame = [0, 0, 900, 700, 40, 800];
  await act(async () => owner.surface.current.refreshGeometry());
  await send('move', 200, 200, 300);
  await send('end', 400, 400, 400, true);
  expect(owner.history.drawing.strokes[0].points).toEqual([
    { x: 10, y: 20 },
    { x: 30, y: 40 },
    { x: 227.56, y: 213.33 },
    { x: 455.11, y: 440.89 },
  ]);
  expect(owner.history.undo).toHaveLength(1);
});

vi.mock(
  'react-native-safe-area-context',
  () => import('../lib/native-appearance-frame-fixture.mjs')
);

vi.mock('../../src/platform/ai.ts', async () =>
  (await import('./native-ai-boundary.mjs')).nativeAiBoundary()
);
