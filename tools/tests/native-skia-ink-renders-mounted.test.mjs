// @vitest-environment happy-dom
import { act, createElement, forwardRef, useEffect, useImperativeHandle } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  adoptedDrawing,
  createPaperInputView,
  paperInputPacket,
} from './native-paper-fixtures.mjs';
import { DrawingSurface } from '../../experiments/native-architecture/src/drawing/DrawingSurface.tsx';
import {
  drawingPaper,
  paperProjection,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { strokeStyle } from '../../experiments/native-architecture/src/drawing/model.ts';

const PLANE = { width: 400, height: 300 };

const native = vi.hoisted(() => ({
  surface: 0,
  ink: 0,
  frames: new Map(),
  nextFrame: 0,
  input: null,
}));

// Each probe runs once per render of its component: the native boundary's own counters.
vi.mock('../../experiments/native-architecture/src/drawing/perfProbe.ts', async (original) => ({
  ...(await original()),
  useSurfaceCommitProbe: () => {
    native.surface += 1;
  },
  useInkCommitProbe: () => {
    native.ink += 1;
  },
}));

// The Tools tier resolves the surface's ink layer to the web renderer; this budget is about the
// native one, so the surface gets SkiaInk under the recording Skia module.
vi.mock('../../experiments/native-architecture/src/drawing/InkLayer.web.tsx', () =>
  vi.importActual('../../experiments/native-architecture/src/drawing/InkLayer.tsx')
);
vi.mock('@shopify/react-native-skia', async () => {
  const { recordingSkiaModule } = await import('./native-skia-recording-fixture.mjs');
  return recordingSkiaModule({ onSurface() {}, nativeId: () => 1, redraw() {} });
});
vi.mock('react-native-svg', async () => {
  const { svgInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgInkViewSdk((onLoad) => onLoad?.());
});
vi.mock('react-native', async () => {
  const { animatedPort, easingPort } =
    await import('../migration/tests/rsd-native-animated-host.mjs');
  // Every view lays out at the plane's size and measures there, as the paper's input view does.
  const View = forwardRef(({ children, onLayout }, ref) => {
    useImperativeHandle(ref, () => ({
      measure(complete) {
        complete(0, 0, PLANE.width, PLANE.height, 0, 0);
      },
    }));
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, ...PLANE } } });
    }, [onLayout]);
    return createElement('div', null, children);
  });
  return {
    Animated: animatedPort(View, View),
    Easing: easingPort,
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
    },
    PixelRatio: { get: () => 1 },
    Platform: { OS: 'ios' },
    Image: () => null,
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    findNodeHandle: (target) => target,
    useColorScheme: () => 'light',
    View,
    requireNativeComponent: () =>
      createPaperInputView(View, (emit) => {
        native.input = emit;
      }),
  };
});

const ADOPTED = adoptedDrawing({ ...PLANE, pixelRatio: 1 });
const pen = (points) => ({ ...strokeStyle('pen', 'Green', ADOPTED), points });
const DRAWING = {
  ...ADOPTED,
  strokes: [
    pen([
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]),
  ],
};
const PROJECTION = paperProjection(drawingPaper(DRAWING));
// The renderer-recovery handlers, one object for the surface's life, as useRendererRecovery keeps.
const HANDLERS = {
  onCohort() {},
  onDrawingChange: vi.fn(),
  onPreparingChange() {},
  onError(error) {
    throw error;
  },
  onRendererFault(error) {
    throw error;
  },
};

let root, host;
let props;

function surface(changes) {
  props = { ...props, ...changes };
  act(() => root.render(createElement(DrawingSurface, props)));
}

function paintFrames() {
  for (let pass = 0; pass < 4; pass += 1) {
    const callbacks = [...native.frames.values()];
    native.frames.clear();
    act(() => callbacks.forEach((callback) => callback(0)));
  }
}

const VIEWPORT = { ...PLANE, bottomInset: 0 };
const finger = (x, y, timestamp) => ({ identifier: 0, tool: 'pen', pageX: x, pageY: y, timestamp });

function contact(phase, touch, sequence) {
  const event = {
    nativeEvent: {
      touches: phase === 'end' ? [] : [touch],
      changedTouches: [touch],
    },
    touchHistory: { touchBank: [{ startTimeStamp: 0 }] },
  };
  act(() => native.input({ nativeEvent: paperInputPacket(phase, event, sequence, VIEWPORT) }));
}

function renders(changes) {
  const before = { surface: native.surface, ink: native.ink };
  surface(changes);
  paintFrames();
  return { surface: native.surface - before.surface, ink: native.ink - before.ink };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  native.surface = 0;
  native.ink = 0;
  native.frames.clear();
  HANDLERS.onDrawingChange.mockClear();
  vi.stubGlobal('SkiaViewApi', { setJsiProperty() {} });
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++native.nextFrame;
    native.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => native.frames.delete(id));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  props = {
    ...HANDLERS,
    drawing: DRAWING,
    projection: PROJECTION,
    currentDrawing: () => props.drawing,
    color: 'Green',
    brush: 'pen',
    strokeWidth: 'medium',
    eraserWidth: 'medium',
    disabled: false,
    sound: null,
    undoGhost: null,
  };
  surface({});
  paintFrames();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

// A dialog holds the paper's input and a width pick changes the next stroke; the surface acts on
// both and the ink on neither. Negative controls: SkiaInk unmemoized, or DrawingSurface handing it
// a fresh onBusy or onError each render, renders the ink with every surface render here.
it('renders the surface, not the native ink, for a dialog holding the paper or a width pick', () => {
  expect(native.ink).toBeGreaterThan(0);
  expect(renders({ disabled: true })).toEqual({ surface: 1, ink: 0 });
  expect(renders({ disabled: false })).toEqual({ surface: 1, ink: 0 });
  expect(renders({ strokeWidth: 'thick' })).toEqual({ surface: 1, ink: 0 });
  expect(renders({ eraserWidth: 'thin' })).toEqual({ surface: 1, ink: 0 });
});

// A contact's first packet starts a cohort, which the surface renders for (its live paper); the
// ink it lays down goes through the live feed, so the ink layer has nothing to render for.
// Negative controls as above.
it('renders the surface, not the native ink, when a contact starts a cohort', () => {
  const before = { surface: native.surface, ink: native.ink };
  contact('start', finger(100, 100, 0), 0);
  paintFrames();
  expect(HANDLERS.onDrawingChange).toHaveBeenLastCalledWith(true, expect.anything());
  expect(native.surface - before.surface).toBe(1);
  expect(native.ink - before.ink).toBe(0);
});

// Positive control: what the ink draws still reaches it.
it('renders the native ink for new strokes and for a Crayon paint', () => {
  const added = {
    ...DRAWING,
    strokes: [
      ...DRAWING.strokes,
      pen([
        { x: 20, y: 200 },
        { x: 200, y: 20 },
      ]),
    ],
  };
  expect(renders({ drawing: added })).toMatchObject({ surface: 1, ink: 1 });
  expect(renders({ brush: 'crayon' }).ink).toBeGreaterThan(0);
  expect(renders({ color: 'Blue' }).ink).toBeGreaterThan(0);
});
