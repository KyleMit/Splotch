// @vitest-environment happy-dom
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
import { DrawingScreen } from '../../experiments/native-architecture/src/DrawingScreen.tsx';

const sdk = vi.hoisted(() => ({
  handlers: null,
  loads: [],
  contentChanges: 0,
  frame: [0, 0, 1024, 768, 40, 800],
}));
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
  loadDrawingLoop: (signal) =>
    new Promise((resolve, reject) => sdk.loads.push({ signal, resolve, reject })),
}));
vi.mock('../../experiments/native-architecture/src/platform/soundSettings.ts', () => ({
  soundSettingsStorage: {
    read: async () => '{"version":1,"soundEnabled":true}',
    write: async () => {},
  },
}));
vi.mock('../../experiments/native-architecture/src/platform/drawingFiles.ts', () => ({
  savePicture: vi.fn(),
  exportPng: vi.fn(),
  listPictures: async () => [],
  reopenPicture: vi.fn(),
}));
vi.mock('react-native', () => ({
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
  Platform: { OS: 'android' },
  Image: () => null,
  Dimensions: {
    get: () => ({ width: 1024, height: 768, scale: 1 }),
    addEventListener: () => ({ remove() {} }),
  },
  findNodeHandle: (value) => value,
  View: forwardRef(({ children }, ref) => {
    useImperativeHandle(ref, () => ({ measure: (complete) => complete(...sdk.frame) }));
    return createElement('div', null, children);
  }),
  PanResponder: {
    create: (handlers) => {
      sdk.handlers = handlers;
      return { panHandlers: {} };
    },
  },
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
async function send(name, x, y, timestamp, ended = false) {
  await act(async () => {
    const input = event(x, y, timestamp, ended);
    sdk.handlers[name](input);
    if (name === 'onPanResponderGrant') sdk.handlers.onPanResponderStart(input);
  });
}
const resource = () => ({ start: vi.fn(), stop: vi.fn(), setVolume: vi.fn(), dispose: vi.fn() });
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sdk.handlers = null;
  sdk.loads.length = 0;
  sdk.contentChanges = 0;
  sdk.frame = [0, 0, 1024, 768, 40, 800];
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(DrawingScreen)));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
it('defers actual audio failure and recovery layout until the last lift without truncating either stroke', async () => {
  await send('onPanResponderGrant', 10, 20, 100);
  await send('onPanResponderMove', 30, 40, 200);
  expect(sdk.loads).toHaveLength(1);
  const changes = sdk.contentChanges;
  await act(async () => sdk.loads[0].reject(new Error('SDK load failure')));
  expect(owner.drawing).toBe(true);
  expect(host.textContent).not.toContain('Drawing sound is unavailable');
  expect(sdk.contentChanges).toBe(changes);
  await send('onPanResponderMove', 200, 200, 300);
  await send('onPanResponderEnd', 400, 400, 400, true);
  expect(owner.history.drawing.strokes[0].points).toEqual([
    { x: 10, y: 20 },
    { x: 30, y: 40 },
    { x: 200, y: 200 },
    { x: 400, y: 400 },
  ]);
  expect(host.textContent).toContain('Drawing sound is unavailable');
  await send('onPanResponderGrant', 10, 20, 100);
  await send('onPanResponderMove', 30, 40, 200);
  expect(sdk.loads).toHaveLength(2);
  const retryChanges = sdk.contentChanges;
  await act(async () => sdk.loads[1].resolve(resource()));
  expect(owner.drawing).toBe(true);
  expect(host.textContent).toContain('Drawing sound is unavailable');
  expect(sdk.contentChanges).toBe(retryChanges);
  await send('onPanResponderMove', 200, 200, 300);
  await send('onPanResponderEnd', 400, 400, 400, true);
  expect(owner.history.drawing.strokes[1].points).toEqual(owner.history.drawing.strokes[0].points);
  expect(owner.history.undo).toHaveLength(2);
  expect(host.textContent).not.toContain('Drawing sound is unavailable');
});
it('continues to settle a cohort on a genuine paper-frame invalidation', async () => {
  await send('onPanResponderGrant', 10, 20, 100);
  await send('onPanResponderMove', 30, 40, 200);
  sdk.frame = [0, 0, 900, 700, 40, 800];
  await act(async () => owner.surface.current.refreshGeometry());
  await send('onPanResponderMove', 200, 200, 300);
  await send('onPanResponderEnd', 400, 400, 400, true);
  expect(owner.history.drawing.strokes[0].points).toEqual([
    { x: 10, y: 20 },
    { x: 30, y: 40 },
  ]);
  expect(owner.history.undo).toHaveLength(1);
});
