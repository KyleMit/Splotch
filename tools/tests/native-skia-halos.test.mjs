import {
  paperProjection,
  drawingPaper,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
// @vitest-environment happy-dom
import { createPaperInputView, paperInputPacket } from './native-paper-fixtures.mjs';
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
import { HELD_CLOCK_MS } from '../../experiments/native-architecture/src/drawing/PointerHalos.tsx';

const native = vi.hoisted(() => ({
  input: null,
  sequence: 0,
  reduced: false,
  canvasRenders: 0,
  picture: null,
  painted: null,
  timings: [],
}));

vi.mock('react-native', () => {
  const View = forwardRef(({ children }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(callback) {
        callback(0, 0, 1024, 768, 40, 800);
      },
    }));
    return createElement('div', null, children);
  });
  return {
    PixelRatio: { get: () => 1 },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => native.reduced,
      addEventListener: () => ({ remove() {} }),
    },
    useColorScheme: () => 'light',
    findNodeHandle: (target) => target,
    StyleSheet: { create: (styles) => styles, absoluteFill: {} },
    View,
    requireNativeComponent: (name) =>
      name === 'SplotchPaperInput'
        ? createPaperInputView(View, (emit) => {
            native.input = emit;
          })
        : View,
  };
});

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

function send(phase, value) {
  const previous = native.lastEvent;
  const input = value ?? {
    ...previous,
    nativeEvent: { ...previous.nativeEvent, changedTouches: previous.nativeEvent.touches },
  };
  const packet = paperInputPacket(phase, input, native.sequence++, {
    width: 1104,
    height: 1608,
    bottomInset: 0,
  });
  native.lastEvent = input;
  if (packet) act(() => native.input({ nativeEvent: packet }));
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
      projection: paperProjection(drawingPaper(emptyDrawing())),
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
    input: null,
    sequence: 0,
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
    send('start', event([touch(0, 10, 20)]));
    expect(painted().shown).toMatchObject([{ halo: { kind: 'ring', x: 10, y: 20 } }]);
    // The clock runs for as long as the contact is down, past the grow-in, so the halo layer
    // redraws on every frame of the stroke. Negative control: a clock that runs only to the
    // grow-in's end (HALO_IN_MS) fails here.
    expect(HELD_CLOCK_MS).toBeGreaterThan(HALO_IN_MS);
    expect(native.timings).toMatchObject([{ duration: HELD_CLOCK_MS, reduceMotion: 'never' }]);
    const { shown, now } = painted();
    expect(haloPose(shown[0], now, false)).toEqual({ scale: 1, opacity: 1 });

    const settled = commits;
    runFrames();
    expect(commits).toBe(settled);

    send('move', event([touch(0, 50, 60, 200)], undefined, { 0: 100 }));
    expect(painted().shown).toMatchObject([{ halo: { x: 50, y: 60 }, lifting: false }]);
    // A move inside the held clock's span leaves the running clock alone.
    expect(native.timings).toHaveLength(1);
    const lift = event([], [touch(0, 50, 60, 300)], { 0: 100 });
    send('end', lift);
    send('end', lift);
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
    send('start', event([touch(0, 10, 20)]));
    expect(painted()).toMatchObject({ reduced: true, shown: [{ halo: { x: 10, y: 20 } }] });
    // The held clock keeps the layer drawing each frame; the reduced pose never reads it.
    expect(native.timings).toMatchObject([{ duration: HELD_CLOCK_MS }]);
    const lift = event([], [touch(0, 10, 20, 300)], { 0: 100 });
    send('end', lift);
    send('end', lift);
    expect(painted().shown).toEqual([]);
    expect(native.timings).toHaveLength(1);
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
