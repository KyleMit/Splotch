import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIVE_TILE_COUNT } from './liveTiles';
import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import { MAX_UNDO_DEPTH } from './undoHistory';

type Renderer = typeof import('./tiledRenderer');
type Point = { x: number; y: number };
type Rect = { x0: number; y0: number; x1: number; y1: number };
type PaperSize = { width: number; height: number };

interface InkState {
  ink: Point[];
  transform: DOMMatrix;
  clip: Rect | null;
  pendingRect: Rect | null;
  stack: Array<{ transform: DOMMatrix; clip: Rect | null }>;
}

type InkCanvas = HTMLCanvasElement & { _ink?: InkState; _ctx?: CanvasRenderingContext2D };
type Dot = Point & { radius: number };

function freshInkState(): InkState {
  return { ink: [], transform: new DOMMatrix(), clip: null, pendingRect: null, stack: [] };
}

function inkState(canvas: InkCanvas) {
  canvas._ink ??= freshInkState();
  return canvas._ink;
}

function intersect(first: Rect | null, second: Rect): Rect {
  if (!first) return second;
  return {
    x0: Math.max(first.x0, second.x0),
    y0: Math.max(first.y0, second.y0),
    x1: Math.min(first.x1, second.x1),
    y1: Math.min(first.y1, second.y1),
  };
}

function deviceRect(transform: DOMMatrix, x: number, y: number, width: number, height: number) {
  const a = transform.transformPoint({ x, y });
  const b = transform.transformPoint({ x: x + width, y: y + height });
  return {
    x0: Math.min(a.x, b.x),
    y0: Math.min(a.y, b.y),
    x1: Math.max(a.x, b.x),
    y1: Math.max(a.y, b.y),
  };
}

function inRect(rect: Rect, point: Point) {
  return point.x >= rect.x0 && point.y >= rect.y0 && point.x < rect.x1 && point.y < rect.y1;
}

function deposit(canvas: InkCanvas, point: Point) {
  const state = inkState(canvas);
  const bounds = { x0: 0, y0: 0, x1: canvas.width, y1: canvas.height };
  if (inRect(bounds, point) && (!state.clip || inRect(state.clip, point))) state.ink.push(point);
}

// A 2D context that tracks where each dot's center lands on every canvas —
// through transforms, blits, clips, clears, erases, and backing resets — so a
// test can follow folded ink from the history base back onto the live tiles and
// export. As on a real canvas, the clip bounds every destination pixel: a fill,
// a blit, a clearRect, and a destination-out erase alike.
function inkTrackingContext(canvas: InkCanvas): CanvasRenderingContext2D {
  const state = () => inkState(canvas);
  let pendingDots: Dot[] = [];
  return {
    canvas,
    lineCap: '',
    lineJoin: '',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    createPattern: () => ({ setTransform() {} }) as unknown as CanvasPattern,
    save() {
      state().stack.push({ transform: state().transform, clip: state().clip });
    },
    restore() {
      const top = state().stack.pop();
      if (top) Object.assign(state(), top);
    },
    beginPath() {
      pendingDots = [];
      state().pendingRect = null;
    },
    rect(x: number, y: number, width: number, height: number) {
      state().pendingRect = deviceRect(state().transform, x, y, width, height);
    },
    clip() {
      const rect = state().pendingRect;
      if (rect) state().clip = intersect(state().clip, rect);
    },
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    stroke() {},
    clearRect(x: number, y: number, width: number, height: number) {
      const rect = intersect(state().clip, deviceRect(state().transform, x, y, width, height));
      state().ink = state().ink.filter((point) => !inRect(rect, point));
    },
    drawImage(source: InkCanvas, ...args: number[]) {
      const [dx, dy, dw, dh] = args.length >= 8 ? args.slice(4) : args;
      const [sx, sy, sw, sh] =
        args.length >= 8 ? args.slice(0, 4) : [0, 0, source.width, source.height];
      const scaleX = dw === undefined ? 1 : dw / sw;
      const scaleY = dh === undefined ? 1 : dh / sh;
      for (const point of inkState(source).ink) {
        if (!inRect({ x0: sx, y0: sy, x1: sx + sw, y1: sy + sh }, point)) continue;
        const local = { x: dx + (point.x - sx) * scaleX, y: dy + (point.y - sy) * scaleY };
        deposit(canvas, state().transform.transformPoint(local));
      }
    },
    getImageData(_x: number, _y: number, width: number, height: number) {
      const data = new Uint8ClampedArray(width * height * 4);
      if (state().ink.length > 0) data[3] = 255;
      return { data };
    },
    arc(x: number, y: number, radius: number) {
      const { a, b } = state().transform;
      const { x: px, y: py } = state().transform.transformPoint({ x, y });
      pendingDots.push({ x: px, y: py, radius: radius * Math.hypot(a, b) });
    },
    fill(this: CanvasRenderingContext2D) {
      if (this.globalCompositeOperation !== 'destination-out') {
        for (const point of pendingDots) deposit(canvas, point);
        return;
      }
      const { clip } = state();
      const erased = (point: Point) =>
        (!clip || inRect(clip, point)) &&
        pendingDots.some((dot) => Math.hypot(point.x - dot.x, point.y - dot.y) <= dot.radius);
      state().ink = state().ink.filter((point) => !erased(point));
    },
    setTransform(...args: [DOMMatrix] | number[]) {
      const [first] = args;
      state().transform =
        typeof first === 'object' ? DOMMatrix.fromMatrix(first) : new DOMMatrix(args as number[]);
    },
    getTransform() {
      return state().transform;
    },
  } as unknown as CanvasRenderingContext2D;
}

let renderer: Renderer;
let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;
const sizeDescriptors = new Map<'width' | 'height', PropertyDescriptor>();

beforeEach(async () => {
  vi.resetModules();
  renderer = await import('./tiledRenderer');
  const prototype = HTMLCanvasElement.prototype;
  originalGetContext = prototype.getContext;
  for (const name of ['width', 'height'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, name)!;
    sizeDescriptors.set(name, descriptor);
    Object.defineProperty(prototype, name, {
      configurable: true,
      get() {
        return descriptor.get!.call(this);
      },
      set(value: number) {
        descriptor.set!.call(this, value);
        (this as InkCanvas)._ink = freshInkState();
      },
    });
  }
  (prototype as unknown as { getContext: unknown }).getContext = function (
    this: InkCanvas,
    kind: string
  ) {
    if (kind !== '2d') return null;
    this._ctx ??= inkTrackingContext(this);
    return this._ctx;
  };
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 16)
  );
});

afterEach(() => {
  renderer.detachTiledRenderer();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  for (const [name, descriptor] of sizeDescriptors) {
    Object.defineProperty(HTMLCanvasElement.prototype, name, descriptor);
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const LANDSCAPE: PaperSize = { width: 1000, height: 600 };
const FOLDED_INK_X = 900;

function mountRenderer(initialPaper: PaperSize) {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  for (let index = 0; index < LIVE_TILE_COUNT; index++) {
    for (const surface of ['liveTile', 'liveCrayonBottom', 'liveCrayonTop']) {
      const tile = document.createElement('canvas');
      tile.dataset[surface] = '';
      tile.hidden = true;
      host.append(tile);
    }
  }
  let paper = initialPaper;
  renderer.adoptTiledRenderer(canvas, {
    paperSize: () => paper,
    recordedPaper: () => ({
      pxW: paper.width,
      pxH: paper.height,
      cssW: paper.width,
      cssH: paper.height,
      angle: 0,
    }),
    hasActivePointers: () => false,
  });

  // Mirrors engine.resizeCanvas: adopt the paper, resize the tiles, and repaint
  // unless the canvas is blank or an undo is about to restore from patches.
  function adoptPaper(
    next: PaperSize,
    { empty = false, repaint = !empty }: { empty?: boolean; repaint?: boolean } = {}
  ) {
    paper = next;
    const resized = renderer.resizeTiledRenderer(next.width, next.height, 1, empty);
    renderer.applyTiledView(IDENTITY_PAPER_VIEW);
    if (resized && repaint) renderer.repaintTiledRenderer();
  }

  function liveInkAt(x: number) {
    return [...host.querySelectorAll<InkCanvas>('canvas[data-live-tile]')].some((tile) => {
      if (tile.hidden) return false;
      const { e, f } = tile.getContext('2d')!.getTransform();
      return inkState(tile).ink.some((point) => point.x - e === x && point.y - f >= 0);
    });
  }

  // A scaled export samples past the paper edge, so the snapshot must not rely
  // on the target's bounds to hide base ink beyond the paper; `targetWidth`
  // wider than the paper exposes whatever it would have blended in.
  function exportedInkAt(x: number, targetWidth = paper.width) {
    const target = document.createElement('canvas') as InkCanvas;
    target.width = targetWidth;
    target.height = paper.height;
    renderer.renderTiledSnapshot(target.getContext('2d')!);
    return inkState(target).ink.some((point) => point.x === x);
  }

  adoptPaper(initialPaper);
  return { adoptPaper, liveInkAt, exportedInkAt };
}

function dot(x: number, y: number): StrokeOp {
  return { kind: 'dot', x, y, radius: 5, color: '#f00', erase: false };
}

function magicSheet(sourceUrl: string) {
  return { canvas: document.createElement('canvas'), originX: 0, originY: 0, sourceUrl };
}

function eraserDot(x: number, y: number, radius: number): StrokeOp {
  return { kind: 'dot', x, y, radius, color: '#f00', erase: true };
}

function magicDot(x: number, y: number): StrokeOp {
  const sheet = magicSheet('/coloring/farm/cat-wide.light');
  return {
    kind: 'dot',
    x,
    y,
    radius: 5,
    color: '#f00',
    erase: false,
    magic: true,
    magicSheet: sheet,
  };
}

function draw(op: StrokeOp, wasEmpty = false) {
  renderer.beginTiledCommand(wasEmpty);
  renderer.renderTiledOp(op);
  renderer.recordTiledOp(op);
  renderer.commitTiledCommand();
}

function settleFolds() {
  vi.runAllTimers();
}

function drawFarRightInkThenEnoughToFoldIt() {
  draw(dot(FOLDED_INK_X, 100), true);
  for (let index = 0; index < MAX_UNDO_DEPTH; index++) draw(dot(100 + index, 100));
}

describe('folded history-base ink under a temporarily smaller paper', () => {
  it('survives a full repaint when the paper never changes', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();
    expect(renderer.tiledHistoryDebug().historyLength).toBe(MAX_UNDO_DEPTH);

    renderer.repaintTiledRenderer();

    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('returns when a same-orientation shrink re-adopts the paper and the window grows back', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();

    view.adoptPaper({ width: 800, height: 600 });
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(false);
    view.adoptPaper(LANDSCAPE);

    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('returns when its command folds while the paper is smaller', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();

    view.adoptPaper({ width: 800, height: 600 });
    settleFolds();
    expect(renderer.tiledHistoryDebug().historyLength).toBe(MAX_UNDO_DEPTH);
    view.adoptPaper(LANDSCAPE);

    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('survives clear, a blank-page rotation, and undoing the clear', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();
    renderer.clearTiledRenderer(false);
    vi.advanceTimersByTime(500);

    view.adoptPaper({ width: LANDSCAPE.height, height: LANDSCAPE.width }, { empty: true });
    view.adoptPaper(LANDSCAPE, { repaint: false });
    const undone = renderer.undoTiledCommand(1);
    expect(undone.empty).toBe(false);
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);

    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);
    renderer.repaintTiledRenderer();
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('releases the retained extent once a folded clear leaves the base blank', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();
    const paperBytes = renderer.tiledHistoryDebug().baseRasterBytes;
    expect(paperBytes).toBe(LANDSCAPE.width * LANDSCAPE.height * 4);

    view.adoptPaper({ width: 800, height: 600 });
    expect(renderer.tiledHistoryDebug().baseRasterBytes).toBe(paperBytes);

    renderer.clearTiledRenderer(false);
    for (let index = 0; index <= MAX_UNDO_DEPTH; index++) draw(dot(100 + index, 100), index === 0);
    settleFolds();

    expect(renderer.tiledHistoryDebug().baseRasterBytes).toBe(800 * 600 * 4);
  });

  it('stays cleared when a clear folds under a smaller paper and a later stroke folds after it returns', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();
    view.adoptPaper({ width: 800, height: 600 });
    renderer.clearTiledRenderer(false);
    for (let index = 0; index < MAX_UNDO_DEPTH; index++) draw(dot(780, 100 + index));
    settleFolds();
    expect(renderer.tiledHistoryDebug().historyLength).toBe(MAX_UNDO_DEPTH);
    view.adoptPaper(LANDSCAPE);
    draw(dot(780, 300));
    vi.advanceTimersByTime(renderer.TILE_HISTORY_FOLD_IDLE_MS + 10);
    expect(renderer.tiledHistoryDebug().historyLength).toBe(MAX_UNDO_DEPTH);
    renderer.repaintTiledRenderer();
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(false);
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(false);
  });

  it('keeps base ink past a shrunken paper out of the export', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();

    view.adoptPaper({ width: 800, height: 600 });

    expect(view.exportedInkAt(FOLDED_INK_X, LANDSCAPE.width)).toBe(false);
    view.adoptPaper(LANDSCAPE);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('keeps folded magic ink past a smaller paper when a recode rebuilds the base under it', () => {
    const view = mountRenderer(LANDSCAPE);
    draw(magicDot(FOLDED_INK_X, 100), true);
    for (let index = 0; index < MAX_UNDO_DEPTH; index++) draw(dot(100 + index, 100));
    settleFolds();

    view.adoptPaper({ width: 800, height: 600 });
    expect(renderer.recodeTiledMagicOps(magicSheet('/coloring/farm/cat-wide.dark'), null)).toBe(
      true
    );
    view.adoptPaper(LANDSCAPE);

    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('keeps ink drawn past the paper edge off the page when the paper grows', () => {
    const narrow = { width: 800, height: 600 };
    const overhangX = 820;
    const view = mountRenderer(narrow);
    draw(dot(overhangX, 100), true);
    view.adoptPaper(LANDSCAPE);
    expect(view.liveInkAt(overhangX)).toBe(false);
    expect(view.exportedInkAt(overhangX)).toBe(false);

    for (let index = 0; index < MAX_UNDO_DEPTH; index++) draw(dot(100 + index, 100));
    settleFolds();
    renderer.repaintTiledRenderer();

    expect(view.liveInkAt(overhangX)).toBe(false);
    expect(view.exportedInkAt(overhangX)).toBe(false);
  });

  it('keeps the part of a stroke drawn after the paper grew mid-stroke through replay and fold', () => {
    const view = mountRenderer({ width: 800, height: 600 });
    renderer.beginTiledCommand(true);
    const head = dot(750, 100);
    renderer.renderTiledOp(head);
    renderer.recordTiledOp(head);
    view.adoptPaper(LANDSCAPE, { repaint: false });
    const tail = dot(FOLDED_INK_X, 100);
    renderer.renderTiledOp(tail);
    renderer.recordTiledOp(tail);
    renderer.commitTiledCommand();

    renderer.repaintTiledRenderer();
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);

    for (let index = 0; index < MAX_UNDO_DEPTH; index++) draw(dot(100 + index, 300));
    settleFolds();
    renderer.repaintTiledRenderer();
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('leaves base ink a smaller paper hid alone when an eraser on that paper replays or folds', () => {
    const erasedX = 700;
    const view = mountRenderer(LANDSCAPE);
    draw(dot(erasedX, 100), true);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();

    view.adoptPaper({ width: 800, height: 600 });
    draw(eraserDot(790, 100, 250));
    view.adoptPaper(LANDSCAPE);

    expect(view.liveInkAt(erasedX)).toBe(false);
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);

    for (let index = 0; index < MAX_UNDO_DEPTH; index++) draw(dot(100 + index, 300));
    settleFolds();
    renderer.repaintTiledRenderer();

    expect(view.liveInkAt(erasedX)).toBe(false);
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(true);
    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(true);
  });

  it('wipes base ink past a smaller paper from replay and export when a clear on that paper is still undoable', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();
    view.adoptPaper({ width: 800, height: 600 });
    renderer.clearTiledRenderer(false);
    vi.advanceTimersByTime(500);

    view.adoptPaper(LANDSCAPE, { empty: true });

    expect(view.exportedInkAt(FOLDED_INK_X)).toBe(false);
    renderer.repaintTiledRenderer();
    expect(view.liveInkAt(FOLDED_INK_X)).toBe(false);
  });

  it('returns the base to the current paper when a clear recorded on the other orientation folds', () => {
    const view = mountRenderer(LANDSCAPE);
    drawFarRightInkThenEnoughToFoldIt();
    settleFolds();
    renderer.clearTiledRenderer(false);
    vi.advanceTimersByTime(500);
    const portrait = { width: 500, height: 900 };
    view.adoptPaper(portrait, { empty: true });
    expect(renderer.tiledHistoryDebug().baseRasterBytes).toBe(
      LANDSCAPE.width * portrait.height * 4
    );

    for (let index = 0; index < MAX_UNDO_DEPTH; index++) draw(dot(100, 100 + index), index === 0);
    settleFolds();

    expect(renderer.tiledHistoryDebug().historyLength).toBe(MAX_UNDO_DEPTH);
    expect(renderer.tiledHistoryDebug().baseRasterBytes).toBe(portrait.width * portrait.height * 4);
  });
});
