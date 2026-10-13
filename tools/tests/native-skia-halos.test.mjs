// @vitest-environment happy-dom
import { act, createElement, forwardRef, Profiler, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import { emptyDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';
import { createHaloFeed } from '../../experiments/native-architecture/src/drawing/haloFeed.ts';
import {
  HALO_IN_MS,
  HALO_OUT_MS,
  haloPose,
} from '../../experiments/native-architecture/src/drawing/haloModel.ts';

const native = vi.hoisted(() => ({
  handlers: null,
  reduced: false,
  canvasRenders: 0,
  picture: null,
  painted: null,
  timings: [],
}));

vi.mock('react-native', () => ({
  PixelRatio: { get: () => 1 },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => native.reduced,
    addEventListener: () => ({ remove() {} }),
  },
  useColorScheme: () => 'light',
  findNodeHandle: (target) => target,
  PanResponder: {
    create(handlers) {
      native.handlers ??= handlers;
      return { panHandlers: {} };
    },
  },
  StyleSheet: { create: (styles) => styles, absoluteFill: {} },
  View: forwardRef(({ children }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        callback(0, 0, 1024, 768, 40, 800);
      },
    }));
    return createElement('div', null, children);
  }),
}));

vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: forwardRef(({ children, testID }, ref) =>
      createElement('div', { ref, 'data-testid': testID }, children)
    ),
    G: ({ children, transform }) => createElement('div', { 'data-transform': transform }, children),
    Defs: group,
    Mask: group,
    Pattern: group,
    Filter: group,
    LinearGradient: group,
    Rect: () => null,
    Circle: () => null,
    Path: () => null,
    Stop: () => null,
    Use: () => null,
    FeBlend: () => null,
    FeComposite: () => null,
  };
});

// The UI thread is out of reach in Node: a shared value is a plain box, a derived value
// recomputes when read, and a timing lands on its target at once after being recorded.
vi.mock('react-native-reanimated', async () => {
  const { useState } = await import('react');
  return {
    Easing: { linear: (progress) => progress },
    ReduceMotion: { Never: 'never' },
    cancelAnimation: () => {},
    useSharedValue: (initial) => useState(() => ({ value: initial }))[0],
    useDerivedValue: (updater) =>
      useState(() => ({
        get value() {
          return updater();
        },
      }))[0],
    withTiming(target, config) {
      native.timings.push({ target, ...config });
      return target;
    },
  };
});

vi.mock('@shopify/react-native-skia', () => ({
  Canvas: ({ children, testID }) => {
    native.canvasRenders += 1;
    return createElement('div', { 'data-testid': testID }, children);
  },
  Picture: ({ picture }) => {
    native.picture = picture;
    return null;
  },
  Skia: {
    PictureRecorder: () => ({
      beginRecording: () => ({}),
      finishRecordingAsPicture: () => ({}),
    }),
  },
}));

vi.mock('../../experiments/native-architecture/src/drawing/skiaHaloPainter.ts', () => ({
  paintHalos(_canvas, shown, now, reduced) {
    native.painted = { shown, now, reduced };
  },
}));

// Mounted drawing tests see the web halos (tools/vitest.config.mjs); this file mounts native's.
vi.mock('../../experiments/native-architecture/src/drawing/PointerHalos.web.tsx', () =>
  vi.importActual('../../experiments/native-architecture/src/drawing/PointerHalos.tsx')
);

const PAPER_TARGET = 101;
// The fake animation-frame clock ticks at 60 Hz.
const FRAME_MS = 16;
const ANIMATION_FRAMES = 20;

function touch(identifier, x, y, timestamp = 100) {
  return {
    identifier,
    locationX: x,
    locationY: y,
    pageX: x + 40,
    pageY: y + 800,
    target: PAPER_TARGET,
    timestamp,
  };
}

function event(touches, changedTouches = touches, starts = {}) {
  return {
    currentTarget: PAPER_TARGET,
    nativeEvent: { touches, changedTouches, target: PAPER_TARGET },
    touchHistory: {
      touchBank: Object.fromEntries(
        [...touches, ...changedTouches].map((item) => [
          item.identifier,
          {
            startTimeStamp: starts[item.identifier] ?? item.timestamp,
            touchActive: touches.some(({ identifier }) => identifier === item.identifier),
          },
        ])
      ),
      mostRecentTimeStamp: Math.max(
        0,
        ...[...touches, ...changedTouches].map(({ timestamp }) => timestamp)
      ),
    },
  };
}

function send(callback, input) {
  act(() => {
    native.handlers[callback](input);
    if (callback === 'onPanResponderGrant') native.handlers.onPanResponderStart(input);
  });
}

function painted() {
  void native.picture.value;
  return native.painted;
}

function runFrames() {
  for (let frame = 0; frame < ANIMATION_FRAMES; frame += 1)
    act(() => vi.advanceTimersByTime(FRAME_MS));
}

let root;
let container;
let commits;

async function mount(element) {
  act(() =>
    root.render(
      createElement(
        Profiler,
        {
          id: 'halos',
          onRender() {
            commits += 1;
          },
        },
        element
      )
    )
  );
  await act(async () => {});
}

function mountSurface() {
  return mount(
    createElement(DrawingSurface, {
      drawing: emptyDrawing(),
      currentDrawing: () => emptyDrawing(),
      color: 'Purple',
      brush: 'pen',
      strokeWidth: 'medium',
      eraserWidth: 'medium',
      disabled: false,
      onCohort: vi.fn(),
      onDrawingChange: vi.fn(),
      onError: vi.fn(),
      onPreparingChange: vi.fn(),
      onRendererFault: vi.fn(),
    })
  );
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout'],
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  Object.assign(native, {
    handlers: null,
    reduced: false,
    canvasRenders: 0,
    picture: null,
    painted: null,
    timings: [],
  });
  commits = 0;
  container = globalThis.document.createElement('div');
  globalThis.document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('native Skia Pointer Halos', () => {
  it('follow, grow in and lift off without rendering the drawing surface', async () => {
    await mountSurface();
    const canvasRenders = native.canvasRenders;
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    expect(painted().shown).toMatchObject([{ halo: { kind: 'ring', x: 10, y: 20 } }]);
    expect(native.timings).toMatchObject([{ duration: HALO_IN_MS, reduceMotion: 'never' }]);
    const { shown, now } = painted();
    expect(haloPose(shown[0], now, false)).toEqual({ scale: 1, opacity: 1 });

    const settled = commits;
    runFrames();
    expect(commits).toBe(settled);

    send('onPanResponderMove', event([touch(0, 50, 60, 200)], undefined, { 0: 100 }));
    expect(painted().shown).toMatchObject([{ halo: { x: 50, y: 60 }, lifting: false }]);
    const lift = event([], [touch(0, 50, 60, 300)], { 0: 100 });
    send('onPanResponderEnd', lift);
    send('onPanResponderRelease', lift);
    expect(painted().shown).toMatchObject([{ halo: { x: 50, y: 60 }, lifting: true }]);
    expect(native.timings.at(-1)).toMatchObject({ duration: HALO_OUT_MS });
    const lifted = painted();
    expect(haloPose(lifted.shown[0], lifted.now, false).opacity).toBe(0);

    const released = commits;
    runFrames();
    expect(commits).toBe(released);
    expect(native.canvasRenders).toBe(canvasRenders);
  });

  it('shows and drops a halo at once under reduced motion', async () => {
    native.reduced = true;
    await mountSurface();
    send('onPanResponderGrant', event([touch(0, 10, 20)]));
    expect(painted()).toMatchObject({ reduced: true, shown: [{ halo: { x: 10, y: 20 } }] });
    const lift = event([], [touch(0, 10, 20, 300)], { 0: 100 });
    send('onPanResponderEnd', lift);
    send('onPanResponderRelease', lift);
    expect(painted().shown).toEqual([]);
    expect(native.timings).toEqual([]);
  });

  // Positive control for the render probe: the web halos animate through React state, and the
  // same frames that leave the native halos alone commit them once per frame.
  it('sees the web halos render on every animation frame', async () => {
    const { PointerHalos } = await vi.importActual(
      '../../experiments/native-architecture/src/drawing/PointerHalos.web.tsx'
    );
    const feed = createHaloFeed();
    await mount(createElement(PointerHalos, { feed }));
    act(() => feed.publish([{ id: 1, kind: 'ring', x: 10, y: 20, size: 8 }]));
    const published = commits;
    runFrames();
    expect(commits - published).toBeGreaterThanOrEqual(Math.floor(HALO_IN_MS / FRAME_MS));
  });
});
