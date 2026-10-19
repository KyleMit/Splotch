// @vitest-environment happy-dom
import { act, createElement, StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { adoptedDrawing } from './native-paper-fixtures.mjs';
import {
  drawingPaper,
  paperProjection,
  UNADOPTED_PAPER,
} from '../../experiments/native-architecture/src/drawing/paperSpace.ts';
import { useUndoAction } from '../../experiments/native-architecture/src/useUndoAction.ts';
import {
  DrawingSessionProvider,
  useDrawingHistory,
} from '../../experiments/native-architecture/src/product/DrawingSession.tsx';
import { SkiaInk } from '../../experiments/native-architecture/src/drawing/SkiaInk.tsx';
import { createContactCohort } from '../../experiments/native-architecture/src/drawing/contactCohort.ts';
import { createLiveInkFeed } from '../../experiments/native-architecture/src/drawing/liveInk.ts';
import { InkPaperScope } from '../../experiments/native-architecture/src/drawing/InkPaper.tsx';
import { InkAppearanceScope } from '../../experiments/native-architecture/src/drawing/InkAppearance.tsx';
import { ReduceMotionPreferenceProvider } from '../../experiments/native-architecture/src/drawing/useReduceMotion.ts';
import {
  addStrokes,
  createHistory,
  emptyDrawing,
  strokeStyle,
} from '../../experiments/native-architecture/src/drawing/model.ts';

const PLANE = { width: 400, height: 300 };

const skia = vi.hoisted(() => ({
  shown: [],
  surfaces: 0,
  inkRenders: 0,
  ghosts: [],
  frames: new Map(),
  nextFrame: 0,
  loadImages: true,
  imageLoads: 0,
  plane: { width: 400, height: 300 },
  redraws: [],
  nextView: 1,
}));

vi.mock('react-native', async () => {
  const { nativeInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return nativeInkViewSdk(() => skia.plane, loadImage);
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

// Each SkiaInk render runs its commit probe once.
vi.mock('../../experiments/native-architecture/src/drawing/perfProbe.ts', async (original) => ({
  ...(await original()),
  useInkCommitProbe: () => {
    skia.inkRenders += 1;
  },
}));

vi.mock('@shopify/react-native-skia', async () => {
  const { recordingSkiaModule } = await import('./native-skia-recording-fixture.mjs');
  return recordingSkiaModule({
    onSurface: () => {
      skia.surfaces += 1;
    },
    nativeId: () => skia.nextView++,
    redraw: (id) => skia.redraws.push(skia.shown.findLast(([shown]) => shown === id)?.[1] ?? null),
  });
});

// SVG hosts mount the real artwork resource consumers; CanvasKit tests own pixel assertions.
vi.mock('react-native-svg', async () => {
  const { svgInkViewSdk } = await import('./native-raster-sdk-fixture.mjs');
  return svgInkViewSdk(loadImage);
});

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

function loadImage(onLoad) {
  if (skia.loadImages) {
    skia.imageLoads += 1;
    onLoad?.();
  }
}

function feedbackFor(before, after, onFinished = vi.fn()) {
  return { id: 1, before, after, reduced: false, startedAt: 0, towards: null, onFinished };
}

function drawingAppearance(child) {
  return createElement(
    ReduceMotionPreferenceProvider,
    { preference: 'full' },
    createElement(
      InkAppearanceScope.Provider,
      { value: { pageId: 'blank', theme: 'light' } },
      child
    )
  );
}

let feed;
let cohort;
let handle;
function DrawingInk({ reference = paper, ...props }) {
  return drawingAppearance(
    createElement(
      InkPaperScope.Provider,
      { value: reference },
      createElement(SkiaInk, {
        ...props,
        ref: (value) => {
          handle = value;
        },
        live: feed,
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

function render(strokes = committed, undoGhost = null, reference = paper) {
  act(() => root.render(createElement(DrawingInk, { strokes, undoGhost, reference })));
}

function paintFrame() {
  const callbacks = [...skia.frames.values()];
  skia.frames.clear();
  act(() => {
    for (const callback of callbacks) callback(0);
  });
}

// The responder's half of the feed: samples land and are published, a lift settles first.
const contact = {
  start(id, point, drawing = { ...emptyDrawing(), paper }) {
    cohort.start(id, 'Green', 'pen', point, drawing, 'medium', () => paper);
    feed.publish();
  },
  sample(id, point) {
    cohort.sample(id, point);
    feed.publish();
  },
  end(id) {
    feed.settle();
    const completed = cohort.finish(id);
    feed.publish();
    return completed;
  },
};

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(performance, 'now').mockReturnValue(0);
  skia.shown.length = 0;
  skia.surfaces = 0;
  skia.inkRenders = 0;
  skia.ghosts.length = 0;
  skia.loadImages = true;
  skia.imageLoads = 0;
  skia.plane = PLANE;
  skia.redraws.length = 0;
  skia.frames.clear();
  feed = createLiveInkFeed();
  cohort = createContactCohort();
  feed.connect(cohort);
  vi.stubGlobal('SkiaViewApi', {
    setJsiProperty: (nativeId, name, value) => {
      if (name === 'picture') skia.shown.push([nativeId, value]);
    },
  });
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

const drawn = (picture) => picture.calls.filter(([name]) => name === 'drawImageRectOptions');

// Live ink reaches the view through Skia's JSI setter and renders no React (ADR-0178). The first
// packet of a display frame is shown at once; the packets after it in that frame are shown
// together at the next frame callback. Negative controls: handing ink over as React state renders
// SkiaInk on every packet; handing it over per packet shows three pictures for the first frame;
// waiting for the frame callback shows nothing until it runs.
it('shows the first packet of a display frame at once and the rest of that frame together', () => {
  render();
  expect(skia.shown).toHaveLength(1);
  expect(drawn(skia.shown[0][1]).length).toBeGreaterThan(0);
  const renders = skia.inkRenders;
  const surfaces = skia.surfaces;
  contact.start('a', { x: 100, y: 100 });
  expect(skia.shown).toHaveLength(2);
  contact.sample('a', { x: 120, y: 100 });
  contact.sample('a', { x: 140, y: 100 });
  expect(skia.shown).toHaveLength(2);
  paintFrame();
  expect(skia.shown).toHaveLength(3);
  expect(cohort.live()[0].ops).toEqual([
    [1, 0],
    [3, 1],
  ]);
  paintFrame();
  contact.sample('a', { x: 160, y: 100 });
  expect(skia.shown).toHaveLength(4);
  paintFrame();
  paintFrame();
  expect(skia.shown).toHaveLength(4);
  contact.sample('a', { x: 170, y: 100 });
  contact.sample('a', { x: 180, y: 100 });
  expect(skia.shown).toHaveLength(5);
  // A lift paints what its frame has not shown yet, at once.
  const completed = contact.end('a');
  expect(skia.shown).toHaveLength(6);
  expect(skia.frames.size).toBe(1);
  expect(skia.inkRenders).toBe(renders);
  render(
    addStrokes(createHistory({ ...emptyDrawing(), paper, strokes: committed }), completed).drawing
      .strokes
  );
  paintFrame();
  expect(skia.inkRenders).toBe(renders + 1);
  expect(skia.surfaces).toBe(surfaces);
  expect(skia.shown).toHaveLength(6);
});

// A blank picture's paper is adopted by its first contact, which records its ops until the layer
// for that paper replays them. Negative control: requiring a layer before a contact may start
// refuses the first contact on every fresh drawing.
it('admits the first contact on unadopted paper and shows it once the paper is adopted', () => {
  render([], null, UNADOPTED_PAPER);
  expect(handle.canStart()).toBe(true);
  expect(handle.readyPlan([]).ink).toBeUndefined();
  contact.start('a', { x: 100, y: 100 }, emptyDrawing());
  contact.sample('a', { x: 140, y: 100 });
  paintFrame();
  expect(skia.shown).toHaveLength(0);
  render([], null, paper);
  expect(skia.shown).toHaveLength(1);
  expect(drawn(skia.shown[0][1]).length).toBeGreaterThan(0);
  contact.sample('a', { x: 180, y: 100 });
  paintFrame();
  expect(skia.shown).toHaveLength(2);
  expect(cohort.live()[0].ops).toHaveLength(3);
});

it('replays the live cohort when its committed ink changes mid-stroke, and leaves a dropped cohort', () => {
  render();
  contact.start('a', { x: 100, y: 100 });
  contact.sample('a', { x: 140, y: 100 });
  paintFrame();
  const surfaces = skia.surfaces;
  render([]);
  expect(skia.surfaces).toBe(surfaces + 1);
  expect(skia.shown).toHaveLength(4);
  contact.sample('a', { x: 180, y: 100 });
  paintFrame();
  expect(handle.isReady()).toBe(true);
  expect(() => handle.readyPlan([])).toThrow('still being prepared');
  contact.end('a');
  paintFrame();
  expect(() => handle.readyPlan([])).toThrow('still being prepared');
  // The cohort was never committed: the frame after its commit would have rendered, the layer
  // rebuilds without it.
  paintFrame();
  expect(skia.surfaces).toBe(surfaces + 2);
  const plan = handle.readyPlan([]);
  expect(plan.ink(PLANE, plan.projection)).toBe('committed ink');
});

it('redraws the current picture after layout and cancels superseded or unmounted redraws', () => {
  render();
  paintFrame();
  expect(skia.redraws).toHaveLength(0);
  paintFrame();
  expect(skia.redraws).toEqual([skia.shown.at(-1)[1]]);
  skia.plane = { width: 300, height: 400 };
  render();
  paintFrame();
  const obsolete = [...skia.frames.values()][0];
  skia.plane = { width: 800, height: 600 };
  render();
  expect(skia.frames.size).toBe(1);
  act(() => obsolete(0));
  expect(skia.redraws).toHaveLength(1);
  paintFrame();
  paintFrame();
  expect(skia.redraws).toEqual([skia.shown[0][1], skia.shown.at(-1)[1]]);

  skia.plane = PLANE;
  render();
  const unmounted = [...skia.frames.values()][0];
  act(() => root.unmount());
  expect(skia.frames.size).toBe(0);
  act(() => unmounted(0));
  expect(skia.redraws).toHaveLength(2);
});

it.each([false, true])(
  'retains the pre-Undo raster and reprojects an active ghost when resize=%s',
  async (resize) => {
    const projection = paperProjection(paper);
    render(committed, null, projection);
    expect(skia.ghosts).toHaveLength(0);
    const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
    const after = { ...before, strokes: [] };
    const feedback = feedbackFor(before, after);
    render(after.strokes, feedback, projection);
    expect(skia.ghosts).toHaveLength(1);
    expect(skia.ghosts[0]).toMatchObject({
      removed: committed,
      before: { kind: 'ink' },
      after: { kind: 'ink' },
      density: 1,
    });
    const current = resize ? paperProjection(paper, { width: 800, height: 600 }) : projection;
    render(after.strokes, feedback, current);
    expect(skia.ghosts.at(-1).context.projection).toBe(current);
    expect(feedback.onFinished).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="undo-ink-motion"]')).not.toBeNull();
    const count = skia.ghosts.length;
    render(committed);
    expect(skia.ghosts).toHaveLength(count);
    expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
    await act(async () => {});
  }
);

it('disposes the last-stroke ghost after Undo returns to unadopted paper', () => {
  render();
  const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
  const after = { ...before, paper: UNADOPTED_PAPER, strokes: [] };
  const finished = vi.fn(() => render(after.strokes, null, UNADOPTED_PAPER));
  render(after.strokes, feedbackFor(before, after, finished), UNADOPTED_PAPER);
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
  render();
  paintFrame();
  paintFrame();
  const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
  const after = { ...before, strokes: [] };
  const finished = vi.fn();
  render(after.strokes, feedbackFor(before, after, finished));
  expect(skia.frames.size).toBe(1);
  render(after.strokes);
  await act(async () => {});
  expect(finished).toHaveBeenCalledOnce();
  expect(skia.frames.size).toBe(0);
  expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
});

it.each(['keyboard', 'button'])(
  'keeps the real history owner’s %s Undo ghost through StrictMode replay and releases it after completion',
  async (kind) => {
    const before = { version: 7, paper, pageId: 'blank', rainbow: 0, strokes: committed };
    const after = { ...before, paper: UNADOPTED_PAPER, strokes: [] };
    let commands;
    let historyOwner;
    function Owner() {
      historyOwner = useDrawingHistory();
      const { history, historyRef, setHistory } = historyOwner;
      const surface = useRef({ lockInput: () => () => {} });
      const command = useRef(false);
      commands = useUndoAction({
        historyRef,
        surface,
        command,
        setHistory,
        blocked: () => false,
        inputActive: () => false,
        setNotice: () => {},
        report: (error) => {
          throw error;
        },
      });
      return createElement(DrawingInk, {
        strokes: history.drawing.strokes,
        undoGhost: commands.undoGhost,
        reference: drawingPaper(history.drawing),
      });
    }
    const session = createElement(DrawingSessionProvider, null, createElement(Owner));
    await act(async () => root.render(createElement(StrictMode, null, session)));
    await act(async () => historyOwner.setHistory({ drawing: before, undo: [after] }));
    expect(historyOwner.historyRef.current.drawing).toBe(before);
    let measured;
    commands.undoTile.current = {
      measure: (complete) => {
        measured = complete;
      },
    };
    await act(async () => {
      if (kind === 'keyboard') commands.undo(false, null);
      else commands.undoFromButton(false);
    });
    expect(typeof measured).toBe(kind === 'button' ? 'function' : 'undefined');
    expect(historyOwner.historyRef.current.drawing).toBe(kind === 'button' ? before : after);
    await act(async () => {
      await Promise.resolve();
      measured?.(0, 0, 60, 60, 200, 300);
    });
    expect(historyOwner.historyRef.current.drawing).toBe(after);
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
    const feedback = feedbackFor(before, after);
    render(before.strokes, null, drawingPaper(before));
    render(after.strokes, feedback, drawingPaper(after));
    expect(container.querySelector('[data-testid="undo-ink-motion"]')).toBeNull();
    expect(skia.ghosts).toHaveLength(0);
    expect(feedback.onFinished).toHaveBeenCalledTimes(1);
  }
);
