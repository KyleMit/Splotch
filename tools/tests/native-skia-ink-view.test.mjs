// @vitest-environment happy-dom
import { act, createElement, StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing, LEGACY_PAPER } from './native-paper-fixtures.mjs';
import {
  drawingPaper,
  UNADOPTED_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { useUndoAction } from '../../experiments/native-architecture/src/useUndoAction.ts';
import {
  SvgUndoGhostLayer,
  useSvgUndoGhostPlan,
} from '../../experiments/native-architecture/src/drawing/SvgUndoGhost.tsx';
import * as tileOwner from '../../experiments/native-architecture/src/drawing/useCrayonTileReadiness.tsx';
import { planInk } from '../../experiments/native-architecture/src/drawing/checkpoints.ts';
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

const skia = vi.hoisted(() => ({
  views: [],
  canvases: 0,
  ghosts: [],
  frames: new Map(),
  nextFrame: 0,
}));

vi.mock('react-native', async () => {
  const { createElement: element, useEffect: effect } = await import('react');
  const { animatedPort, easingPort } =
    await import('../migration/tests/rsd-native-animated-host.mjs');
  const View = ({ children, onLayout, testID }) => {
    effect(() => {
      onLayout?.({ nativeEvent: { layout: PLANE } });
    }, [onLayout]);
    return element('div', { 'data-testid': testID }, children);
  };
  return {
    Animated: animatedPort(View, View),
    Easing: easingPort,
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => false,
      addEventListener: () => ({ remove() {} }),
    },
    PixelRatio: { get: () => 1 },
    Platform: { OS: 'web' },
    Image: ({ source, onLoad }) => {
      effect(() => onLoad?.(), [source.uri, onLoad]);
      return null;
    },
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
    View,
  };
});

vi.mock('../../experiments/native-architecture/src/drawing/skiaUndoGhostImage.ts', () => ({
  makeSkiaUndoGhost: (request) => {
    skia.ghosts.push(request);
    return {
      width: () => request.bounds.width,
      height: () => request.bounds.height,
      kind: 'ghost',
    };
  },
}));

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

// SVG hosts mount the real artwork resource consumers; CanvasKit tests own pixel assertions.
vi.mock('react-native-svg', () => {
  const group = ({ children }) => createElement('div', null, children);
  return {
    default: group,
    G: group,
    Defs: group,
    Mask: group,
    Pattern: group,
    Filter: group,
    LinearGradient: group,
    Stop: group,
    FeBlend: group,
    FeComposite: group,
    ClipPath: group,
    RadialGradient: group,
    SvgXml: group,
    Path: () => null,
    Use: () => null,
    Circle: () => null,
    Rect: () => null,
    Ellipse: () => null,
    Polygon: () => null,
    Image: ({ href, onLoad }) => {
      useEffect(() => onLoad?.(), [href, onLoad]);
      return null;
    },
  };
});

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

function render(drafts, strokes = committed, undoGhost = null, reference = paper) {
  act(() =>
    root.render(
      createElement(
        ReduceMotionPreferenceProvider,
        { preference: 'full' },
        createElement(
          InkPaperScope.Provider,
          { value: reference },
          createElement(
            InkAppearanceScope.Provider,
            { value: { pageId: 'blank', theme: 'light' } },
            createElement(SkiaInk, {
              strokes,
              undoGhost,
              paperFrame: { ...PLANE, pageX: 0, pageY: 0 },
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
    )
  );
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  skia.views.length = 0;
  skia.canvases = 0;
  skia.ghosts.length = 0;
  skia.frames.clear();
  vi.stubGlobal('requestAnimationFrame', (callback) => {
    const id = ++skia.nextFrame;
    skia.frames.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => skia.frames.delete(id));
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

it('retains the pre-Undo raster for the removed cohort without creating ghosts for ordinary commits', () => {
  render([]);
  expect(skia.ghosts).toHaveLength(0);
  const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
  const after = { ...before, strokes: [] };
  const feedback = {
    id: 1,
    before,
    after,
    reduced: false,
    startedAt: 0,
    towards: null,
    onFinished: vi.fn(),
  };
  render([], after.strokes, feedback);
  expect(skia.ghosts).toHaveLength(1);
  expect(skia.ghosts[0]).toMatchObject({
    removed: committed,
    before: { kind: 'ink' },
    after: { kind: 'ink' },
    density: 1,
  });
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).not.toBeNull();
  render([], committed);
  expect(skia.ghosts).toHaveLength(1);
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
});

function paintFrame() {
  const callbacks = [...skia.frames.values()];
  skia.frames.clear();
  act(() => {
    for (const callback of callbacks) callback(0);
  });
}

it('disposes the last-stroke ghost after Undo returns to unadopted paper', () => {
  render([]);
  const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
  const after = { ...before, paper: UNADOPTED_PAPER, strokes: [] };
  const finished = vi.fn(() => render([], after.strokes, null, UNADOPTED_PAPER));
  render(
    [],
    after.strokes,
    { id: 1, before, after, reduced: false, startedAt: 0, towards: null, onFinished: finished },
    UNADOPTED_PAPER
  );
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).not.toBeNull();
  expect(skia.ghosts.at(-1)).toMatchObject({ before: { kind: 'ink' }, after: null });
  expect(finished).not.toHaveBeenCalled();
  paintFrame();
  expect(finished).not.toHaveBeenCalled();
  paintFrame();
  expect(finished).toHaveBeenCalledOnce();
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
  expect(skia.frames.size).toBe(0);
});

it('disposes an interrupted ghost once and cancels its pending paint frames', async () => {
  render([]);
  const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
  const after = { ...before, strokes: [] };
  const finished = vi.fn();
  render([], after.strokes, {
    id: 1,
    before,
    after,
    reduced: false,
    startedAt: 0,
    towards: null,
    onFinished: finished,
  });
  expect(skia.frames.size).toBe(1);
  render([], after.strokes);
  await act(async () => {});
  expect(finished).toHaveBeenCalledOnce();
  expect(skia.frames.size).toBe(0);
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
});

it('keeps a newly accepted ghost through StrictMode replay and releases it after completion', async () => {
  const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
  const after = { ...before, paper: UNADOPTED_PAPER, strokes: [] };
  let commands;
  function Owner() {
    const [history, publish] = useState({ drawing: before, undo: [after] });
    const historyRef = useRef(history);
    historyRef.current = history;
    const surface = useRef({ lockInput: () => () => {} });
    const command = useRef(false);
    commands = useUndoAction({
      historyRef,
      surface,
      command,
      setHistory: (next) => {
        historyRef.current = next;
        publish(next);
      },
      blocked: () => false,
      inputActive: () => false,
      setNotice: () => {},
      report: (error) => {
        throw error;
      },
    });
    return createElement(
      InkPaperScope.Provider,
      { value: drawingPaper(history.drawing) },
      createElement(
        InkAppearanceScope.Provider,
        { value: { pageId: 'blank', theme: 'light' } },
        createElement(SkiaInk, {
          strokes: history.drawing.strokes,
          undoGhost: commands.undoGhost,
          paperFrame: { ...PLANE, pageX: 0, pageY: 0 },
          brush: 'pen',
          color: 'Green',
          onBusy: () => {},
          onError: (error) => {
            throw error;
          },
        })
      )
    );
  }
  await act(async () =>
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(ReduceMotionPreferenceProvider, { preference: 'full' }, createElement(Owner))
      )
    )
  );
  await act(async () => commands.undo(false, null));
  expect(commands.undoGhost).not.toBeNull();
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).not.toBeNull();
  expect(skia.ghosts.length).toBeGreaterThan(0);
  for (const ghost of skia.ghosts)
    expect(ghost).toMatchObject({ before: { kind: 'ink' }, after: null });
  paintFrame();
  expect(commands.undoGhost).not.toBeNull();
  paintFrame();
  await act(async () => {});
  expect(commands.undoGhost).toBeNull();
  expect(commands.undoFeedback.id).toBe(1);
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
  expect(skia.frames.size).toBe(0);
});

it.each(['prefix', 'exact-after', 'wrong-paper', 'wrong-prefix'])(
  'owns the complete SVG ghost scenes and only their required pigments with a %s checkpoint',
  async (kind) => {
    const prefix = Array.from({ length: 17 }, (_, index) => ({
      brush: 'crayon',
      width: 34,
      seed: index + 1,
      color: `#${(index + 1).toString(16).padStart(6, '0').toUpperCase()}`,
      points: [{ x: 40, y: 40 }],
    }));
    const separator = pen([{ x: 20, y: 20 }]);
    const green = { ...prefix[0], color: 'Green' };
    const red = { ...prefix[0], color: 'Red' };
    const tailPen = pen([{ x: 50, y: 50 }]);
    const after = {
      version: 5,
      pageId: 'blank',
      rainbow: 0,
      strokes: [...prefix, separator, green],
    };
    const before = { ...after, strokes: [...after.strokes, tailPen, red] };
    const cached = {
      id: 1,
      base64: 'checkpoint',
      paper: kind === 'wrong-paper' ? paper : LEGACY_PAPER,
      strokes: kind === 'exact-after' ? after.strokes : [...prefix, separator],
    };
    if (kind === 'wrong-prefix') cached.strokes = [{ ...prefix[0] }, ...cached.strokes.slice(1)];
    const valid = kind === 'prefix' || kind === 'exact-after';
    const beforeTail =
      kind === 'exact-after' ? [tailPen, red] : valid ? [green, tailPen, red] : before.strokes;
    const afterTail = kind === 'exact-after' ? [] : valid ? [green] : after.strokes;
    const display = planInk(after.strokes, cached, LEGACY_PAPER).strokes;
    const feedback = {
      id: 1,
      before,
      after,
      reduced: false,
      startedAt: 0,
      towards: null,
      onFinished: vi.fn(),
    };
    const requests = vi.spyOn(tileOwner, 'useCrayonTileResources');
    let current;
    function Owner({ cue }) {
      const planned = useSvgUndoGhostPlan(cue, cached, display);
      const resources = tileOwner.useCrayonTileResources(planned.tileStrokes, 'light');
      current = { ...planned, resources };
      return createElement(
        tileOwner.CrayonTileResourceScope.Provider,
        { value: resources },
        planned.ghost &&
          createElement(SvgUndoGhostLayer, {
            feedback: planned.ghost.feedback,
            checkpoint: cached,
            frame: { ...PLANE, pageX: 0, pageY: 0 },
          })
      );
    }
    function renderOwner(cue) {
      return createElement(
        ReduceMotionPreferenceProvider,
        { preference: 'full' },
        createElement(
          InkAppearanceScope.Provider,
          { value: { pageId: 'blank', theme: 'light' } },
          createElement(Owner, { cue })
        )
      );
    }
    await act(async () => root.render(renderOwner(feedback)));
    const pigmentCount = (strokes) =>
      new Set(strokes.filter((stroke) => stroke.brush === 'crayon').map((stroke) => stroke.color))
        .size;
    expect(current.resources.byKey.size).toBe(
      pigmentCount([...display, ...beforeTail, ...afterTail]) * CRAYON_BANDS.length
    );
    expect(current.ghost.plan.strokes).toEqual(beforeTail);
    expect(current.ghost.remaining.strokes).toEqual(afterTail);
    expect(current.ghost.plan.checkpoint).toBe(valid ? cached : null);
    expect(current.ghost.remaining.checkpoint).toBe(valid ? cached : null);
    expect(planInk(before.strokes, cached, LEGACY_PAPER).needsCheckpoint).toBe(true);
    const consumers = requests.mock.calls.map(([strokes], index) => ({
      strokes,
      count: requests.mock.results[index].value.byKey.size,
    }));
    expect(consumers).toEqual(
      expect.arrayContaining([
        { strokes: beforeTail, count: pigmentCount(beforeTail) * CRAYON_BANDS.length },
        { strokes: afterTail, count: pigmentCount(afterTail) * CRAYON_BANDS.length },
      ])
    );
    await act(async () => root.render(renderOwner(null)));
    expect(current.ghost).toBeNull();
    expect(current.resources.byKey.size).toBe(pigmentCount(display) * CRAYON_BANDS.length);
    requests.mockRestore();
  }
);

it.each(['eraser', 'page'])(
  'finishes an unsupported %s native candidate without ghost work',
  async (kind) => {
    const removed = {
      ...strokeStyle(kind === 'eraser' ? 'eraser' : 'pen', 'Green', emptyDrawing()),
      points: committed[0].points,
    };
    const before = { ...adoptedDrawing({ ...PLANE, pixelRatio: 1 }), strokes: [removed] };
    const after = { ...before, pageId: kind === 'page' ? 'butterfly' : before.pageId, strokes: [] };
    const feedback = {
      id: 1,
      startedAt: 0,
      reduced: false,
      before,
      after,
      towards: null,
      onFinished: vi.fn(),
    };
    render([], before.strokes, null, drawingPaper(before));
    render([], after.strokes, feedback, drawingPaper(after));
    expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
    expect(skia.ghosts).toHaveLength(0);
    expect(feedback.onFinished).toHaveBeenCalledTimes(1);
  }
);
