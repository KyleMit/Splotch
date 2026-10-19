// @vitest-environment happy-dom
import { act, createElement, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import * as tileOwner from '../../experiments/native-architecture/src/drawing/useCrayonTileReadiness.tsx';
import { CRAYON_BANDS } from '../../experiments/native-architecture/src/drawing/crayon.ts';
import { SkiaInk } from '../../experiments/native-architecture/src/drawing/SkiaInk.tsx';
import { InkPaperScope } from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import {
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const PLANE = { width: 400, height: 300 };
const skia = vi.hoisted(() => ({ contexts: [] }));

vi.mock('react-native', async () => {
  const { nativeInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return nativeInkViewSdk(
    () => PLANE,
    (onLoad) => onLoad?.()
  );
});
vi.mock('react-native-svg', async () => {
  const { svgInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgInkViewSdk((onLoad) => onLoad?.());
});
vi.mock('../../experiments/native-architecture/src/drawing/skiaUndoGhostImage.ts', () => ({
  makeSkiaUndoGhost: () => null,
}));

function recordingCanvas() {
  return new Proxy({}, { get: () => () => {} });
}

vi.mock('@shopify/react-native-skia', () => ({
  FilterMode: { Linear: 1 },
  MipmapMode: { None: 0 },
  fitRects: (_fit, src, dst) => ({ src, dst }),
  Skia: {
    XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
    Paint: () => ({}),
    PictureRecorder: () => ({
      beginRecording: recordingCanvas,
      finishRecordingAsPicture: () => ({}),
    }),
    Surface: {
      Make: (width, height) => ({
        getCanvas: recordingCanvas,
        flush: () => {},
        makeImageSnapshot: () => ({ width: () => width, height: () => height }),
      }),
    },
  },
  SkiaPictureView: forwardRef(() => null),
}));

// Each paint hands over the context it painted with; the context's identity is what is under test.
vi.mock('../../experiments/native-architecture/src/drawing/skiaInkPainter.ts', () => ({
  paintStroke: (_canvas, _stroke, context) => void skia.contexts.push(context),
  decodeDataUriImage: () => null,
}));

const paper = adoptedDrawing({ ...PLANE, pixelRatio: 1 }).paper;
const pen = (points) => ({ ...strokeStyle('pen', 'Green', emptyDrawing()), points });
const crayon = (color) => ({
  ...strokeStyle('crayon', color, emptyDrawing()),
  points: [
    { x: 1, y: 1 },
    { x: 9, y: 9 },
  ],
});
let container;
let root;

function draw(strokes, drafts, brush = 'pen', color = 'Green') {
  const ink = createElement(SkiaInk, {
    strokes,
    drafts,
    brush,
    color,
    paperFrame: { ...PLANE, pageX: 0, pageY: 0 },
    onBusy: () => {},
    onError: (error) => {
      throw error;
    },
  });
  act(() =>
    root.render(
      createElement(
        ReduceMotionPreferenceProvider,
        { preference: 'full' },
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId: 'blank', theme: 'light' } },
          createElement(InkPaperScope.Provider, { value: paper }, ink)
        )
      )
    )
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  skia.contexts.length = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Every scene memo downstream of the paint context reruns when it changes, and the context holds
// the Crayon tiles. Negative controls: building the tiles from a per-packet concatenation of the
// history and the drafts fails the argument check, and a fresh resources object per call hands
// each packet a new context.
it('keeps one paint context across a live stroke’s packets until a new pigment arrives', () => {
  const requests = vi.spyOn(tileOwner, 'useCrayonTileResources');
  const history = [
    pen([
      { x: 10, y: 10 },
      { x: 90, y: 90 },
    ]),
    crayon('Red'),
  ];
  draw(history, []);
  const packets = [];
  for (let count = 2; count <= 6; count++) {
    skia.contexts.length = 0;
    draw(history, [pen(Array.from({ length: count }, (_, x) => ({ x: x * 10, y: 20 })))]);
    packets.push(...skia.contexts);
  }
  expect(packets).toHaveLength(5);
  expect(new Set(packets).size).toBe(1);
  skia.contexts.length = 0;
  draw(history, [crayon('Red')], 'crayon', 'Red');
  expect(skia.contexts).toHaveLength(1);
  expect(skia.contexts[0]).toBe(packets[0]);
  skia.contexts.length = 0;
  const blue = [crayon('Blue')];
  draw(history, blue, 'crayon', 'Blue');
  expect(skia.contexts).toHaveLength(1);
  expect(skia.contexts[0]).not.toBe(packets[0]);
  expect(skia.contexts[0].tiles.byKey.size).toBe(2 * CRAYON_BANDS.length);
  expect(requests).toHaveBeenCalled();
  for (const [strokes] of requests.mock.calls) expect(strokes).toBe(history);
  expect(requests.mock.calls.at(-1)[3]).toBe(blue);
});
