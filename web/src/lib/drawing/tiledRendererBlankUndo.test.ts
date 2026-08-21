import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LIVE_TILE_COUNT } from './liveTiles';
import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  clearTiledRenderer,
  commitTiledCommand,
  detachTiledRenderer,
  peekTiledUndoPaper,
  recordTiledOp,
  renderTiledOp,
  resizeTiledRenderer,
  scanTiledRendererIsEmpty,
  tiledHistoryDebug,
  undoTiledCommand,
} from './tiledRenderer';

vi.mock('./crayonBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crayonBrush')>()),
  crayonPatternFor: () => ({}) as CanvasPattern,
}));

let originalGetContext: typeof HTMLCanvasElement.prototype.getContext;

beforeEach(() => {
  originalGetContext = HTMLCanvasElement.prototype.getContext;
  (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (
    this: HTMLCanvasElement,
    kind: string
  ) {
    if (kind !== '2d') return null;
    const canvas = this as HTMLCanvasElement & {
      _ctx?: CanvasRenderingContext2D;
      _testHasInk?: boolean;
    };
    if (canvas._ctx) return canvas._ctx;
    let transform = new DOMMatrix();
    const context = {
      canvas,
      lineCap: '',
      lineJoin: '',
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      save() {},
      restore() {},
      beginPath() {},
      moveTo() {},
      quadraticCurveTo() {},
      stroke() {},
      rect() {},
      clip() {},
      clearRect: vi.fn(() => {
        canvas._testHasInk = false;
      }),
      drawImage: vi.fn((source: CanvasImageSource) => {
        canvas._testHasInk = Boolean(
          (source as HTMLCanvasElement & { _testHasInk?: boolean })._testHasInk
        );
      }),
      getImageData(_x: number, _y: number, width: number, height: number) {
        const data = new Uint8ClampedArray(width * height * 4);
        if (canvas._testHasInk) data[3] = 255;
        return { data };
      },
      arc() {},
      fill() {},
      setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
        transform = new DOMMatrix([a, b, c, d, e, f]);
      },
      getTransform() {
        return transform;
      },
    } as unknown as CanvasRenderingContext2D;
    canvas._ctx = context;
    return context;
  };
});

afterEach(() => {
  detachTiledRenderer();
  HTMLCanvasElement.prototype.getContext = originalGetContext;
  vi.unstubAllGlobals();
});

function rendererElements() {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  host.append(canvas);
  for (let index = 0; index < LIVE_TILE_COUNT; index++) {
    const tile = document.createElement('canvas');
    tile.dataset.liveTile = '';
    tile.hidden = true;
    host.append(tile);

    const bottom = document.createElement('canvas');
    bottom.dataset.liveCrayonBottom = '';
    bottom.hidden = true;
    host.append(bottom);

    const top = document.createElement('canvas');
    top.dataset.liveCrayonTop = '';
    top.hidden = true;
    host.append(top);
  }
  return { host, canvas };
}

function draw(op: StrokeOp, wasEmpty: boolean) {
  beginTiledCommand(wasEmpty);
  renderTiledOp(op);
  recordTiledOp(op);
  commitTiledCommand();
}

const WIDE_PATH: StrokeOp = {
  kind: 'path',
  pid: 1,
  startX: 25,
  startY: 50,
  segs: [{ cx: 200, cy: 50, x: 375, y: 50 }],
  color: '#ff0000',
  lineWidth: 10,
  erase: false,
};

function adoptSizedRenderer(canvas: HTMLCanvasElement) {
  adoptTiledRenderer(canvas, {
    paperSize: () => ({ width: 400, height: 400 }),
    hasActivePointers: () => false,
  });
  resizeTiledRenderer(400, 400, 1);
  applyTiledView(IDENTITY_PAPER_VIEW);
}

describe('blank tiled undo', () => {
  it('exposes the paper restored by the next non-empty undo', () => {
    const { canvas } = rendererElements();
    const recordedPaper = { pxW: 400, pxH: 400, cssW: 400, cssH: 400, angle: 0 };
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      recordedPaper: () => recordedPaper,
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);

    draw(WIDE_PATH, true);
    expect(peekTiledUndoPaper()).toBeUndefined();

    clearTiledRenderer(false);
    expect(peekTiledUndoPaper()).toEqual(recordedPaper);

    undoTiledCommand(1);
    undoTiledCommand(1);
  });

  it('restores a blank state after clear without replaying retained history', () => {
    const { host, canvas } = rendererElements();
    adoptSizedRenderer(canvas);
    const deferredFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrames.push(callback);
      return deferredFrames.length;
    });
    const dot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
    };
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];

    draw(dot, true);
    clearTiledRenderer(false);
    draw(WIDE_PATH, true);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(4);

    const patchBytesBeforeUndo = tiledHistoryDebug().patchBytes;
    const deferredFramesBeforeUndo = deferredFrames.length;
    const clearCallsBeforeUndo = tiles.reduce(
      (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
      0
    );
    expect(undoTiledCommand(1)).toEqual({ empty: true, canUndo: true });
    expect(tiles.every((tile) => tile.hidden)).toBe(true);
    expect(tiledHistoryDebug().patchBytes).toBe(patchBytesBeforeUndo);
    expect(
      tiles.reduce(
        (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
        0
      )
    ).toBe(clearCallsBeforeUndo);
    expect(deferredFrames).toHaveLength(deferredFramesBeforeUndo);

    expect(undoTiledCommand(1)).toEqual({ empty: false, canUndo: true });
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
    while (deferredFrames.length) deferredFrames.shift()!(0);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);

    expect(undoTiledCommand(1)).toEqual({ empty: true, canUndo: false });
    expect(tiles.every((tile) => tile.hidden)).toBe(true);
  });

  it('ignores hidden stale backings when an eraser only reaches part of a blank canvas', () => {
    const { host, canvas } = rendererElements();
    adoptSizedRenderer(canvas);
    const eraser: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#000000',
      erase: true,
    };
    const pen: StrokeOp = { ...eraser, color: '#ff0000', erase: false };
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];

    draw(WIDE_PATH, true);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(4);
    expect(undoTiledCommand(1)).toEqual({ empty: true, canUndo: false });

    for (const tile of tiles.slice(1, 4)) {
      (tile as HTMLCanvasElement & { _testHasInk?: boolean })._testHasInk = true;
    }
    draw(eraser, true);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
    expect(scanTiledRendererIsEmpty(1)).toBe(true);

    draw(pen, true);
    expect(undoTiledCommand(1)).toEqual({ empty: true, canUndo: true });
    expect(tiles.every((tile) => tile.hidden)).toBe(true);
  });
});
