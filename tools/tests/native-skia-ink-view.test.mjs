// @vitest-environment happy-dom
import { act, createElement, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import { SkiaInk } from '../../experiments/native-architecture/src/drawing/SkiaInk.tsx';
import { InkPaperScope } from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import {
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const PLANE = { width: 400, height: 300 };

const skia = vi.hoisted(() => ({ views: [], canvases: 0 }));

vi.mock('react-native', async () => {
  const { createElement: element, useEffect: effect } = await import('react');
  return {
    PixelRatio: { get: () => 1 },
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    View: ({ children, onLayout }) => {
      effect(() => {
        onLayout?.({ nativeEvent: { layout: PLANE } });
      }, [onLayout]);
      return element('div', null, children);
    },
  };
});

// A recording canvas: each picture is the list of calls drawn into it.
function recordingCanvas() {
  const calls = [];
  return new Proxy(
    { calls },
    {
      get: (target, name) =>
        name === 'calls' ? calls : (...args) => void calls.push([name, ...args]),
    }
  );
}

vi.mock('@shopify/react-native-skia', () => ({
  FilterMode: { Linear: 1 },
  MipmapMode: { None: 0 },
  fitRects: (_fit, src, dst) => ({ src, dst }),
  Skia: {
    XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
    Paint: () => ({}),
    PictureRecorder: () => {
      const canvas = recordingCanvas();
      return {
        beginRecording: () => canvas,
        finishRecordingAsPicture: () => ({ calls: canvas.calls }),
      };
    },
    Surface: {
      Make: (width, height) => {
        const canvas = recordingCanvas();
        return {
          getCanvas: () => canvas,
          flush: () => {},
          makeImageSnapshot: () => ({ width: () => width, height: () => height, kind: 'ink' }),
        };
      },
    },
  },
  Canvas: () => {
    skia.canvases += 1;
    return null;
  },
  SkiaPictureView: ({ picture }) => {
    useEffect(() => {
      skia.views.push(picture);
    }, [picture]);
    return null;
  },
}));

// Crayon tile readiness draws through react-native-svg, which a pen stroke never reaches.
vi.mock('react-native-svg', () => ({ default: () => null, Image: () => null }));

vi.mock('../../experiments/native-architecture/src/drawing/skiaInkPainter.ts', () => ({
  paintStroke: (canvas, stroke) => canvas.drawStroke(stroke.points.length),
  decodeDataUriImage: () => null,
}));

let container;
let root;
const paper = adoptedDrawing({ ...PLANE, pixelRatio: 1 }).paper;
const pen = (points) => ({ ...strokeStyle('pen', 'Green', emptyDrawing()), points });
const committed = [
  pen([
    { x: 10, y: 10 },
    { x: 90, y: 90 },
  ]),
];

function render(drafts) {
  act(() =>
    root.render(
      createElement(
        InkPaperScope.Provider,
        { value: paper },
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId: 'blank', theme: 'light' } },
          createElement(SkiaInk, {
            strokes: committed,
            drafts,
            brush: 'pen',
            color: 'Green',
            onBusy: vi.fn(),
            onError: (error) => {
              throw error;
            },
          })
        )
      )
    )
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  skia.views.length = 0;
  skia.canvases = 0;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

// A Skia Canvas re-records its element tree on the UI thread and draws twice for each change
// (on the reconciler's commit, then again once the render resolves), each draw a full-paper blit
// of the committed ink. The ink view takes one picture the JS thread recorded and draws it once.
// Negative control: the Canvas element tree mounts a Canvas and never hands a view a picture.
it('hands the ink view one picture per change, the committed ink beneath the stroke in progress', () => {
  render([]);
  expect(skia.canvases).toBe(0);
  expect(skia.views).toHaveLength(1);
  const [still] = skia.views;
  expect(still.calls.map(([name]) => name)).toEqual(['drawImageRectOptions']);
  expect(still.calls[0][1]).toMatchObject({ kind: 'ink' });
  expect(still.calls[0][3]).toEqual({ x: 0, y: 0, ...PLANE });

  render([
    pen([
      { x: 20, y: 20 },
      { x: 60, y: 30 },
      { x: 80, y: 70 },
    ]),
  ]);
  expect(skia.views).toHaveLength(2);
  const live = skia.views[1];
  expect(live.calls.map(([name]) => name)).toEqual(['drawImageRectOptions', 'drawPicture']);
  expect(live.calls[1][1].calls.at(-1)).toEqual(['drawStroke', 3]);
});
