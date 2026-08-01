import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  captureTiledCanvasSnapshot,
  clearTiledRenderer,
  commitTiledCommand,
  detachTiledRenderer,
  hasUnresolvedTiledMagicOps,
  recordTiledOp,
  repaintTiledRenderer,
  renderTiledOp,
  resizeTiledRenderer,
  tiledHistoryDebug,
  tiledSurfaceTopologyDebug,
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
    const canvas = this as HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D };
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
      rect() {},
      clip() {},
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData(_x: number, _y: number, width: number, height: number) {
        return { data: new Uint8ClampedArray(width * height * 4) };
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
  vi.useRealTimers();
});

function rendererElements() {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.width = 400;
  canvas.height = 400;
  host.append(canvas);
  for (let index = 0; index < 16; index++) {
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

describe('idle tiled canvas visibility', () => {
  it('composites only painted tiles and restores visibility through clear and undo', () => {
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    canvas.width = 1;
    canvas.height = 1;
    resizeTiledRenderer(400, 400, 1);
    expect(tiledSurfaceTopologyDebug()).toEqual(
      Array.from({ length: 16 }, () => ({ width: 100, height: 100 }))
    );
    applyTiledView(IDENTITY_PAPER_VIEW);
    const deferredCrayonTiles = [
      ...host.querySelectorAll<HTMLCanvasElement>('[data-live-crayon-bottom]'),
      ...host.querySelectorAll<HTMLCanvasElement>('[data-live-crayon-top]'),
    ];
    expect(deferredCrayonTiles.every((tile) => tile.width === 300 && tile.height === 150)).toBe(
      true
    );

    const dot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
    };
    beginTiledCommand(true);
    renderTiledOp(dot);
    recordTiledOp(dot);
    commitTiledCommand();

    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
    expect(resizeTiledRenderer(400, 400, 1)).toBe(false);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);

    const patchBytesBeforeClear = tiledHistoryDebug().patchBytes;
    const clearCallsBefore = tiles.reduce(
      (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
      0
    );
    const deferredFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrames.push(callback);
      return deferredFrames.length;
    });
    clearTiledRenderer(false);
    expect(tiles.every((tile) => tile.hidden)).toBe(true);
    const clearCallsAfter = tiles.reduce(
      (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
      0
    );
    expect(tiledHistoryDebug().patchBytes - patchBytesBeforeClear).toBe(0);
    expect(clearCallsAfter - clearCallsBefore).toBe(0);
    deferredFrames.shift()?.(0);
    expect(tiledHistoryDebug().patchBytes - patchBytesBeforeClear).toBe(100 * 100 * 4);

    undoTiledCommand(1);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
    const clearCallsAfterUndo = tiles.reduce(
      (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
      0
    );
    deferredFrames.shift()?.(0);
    deferredFrames.shift()?.(16);
    const clearCallsAfterDeferredFrames = tiles.reduce(
      (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
      0
    );
    expect(clearCallsAfterDeferredFrames).toBe(clearCallsAfterUndo);

    undoTiledCommand(1);
    expect(tiles.every((tile) => tile.hidden)).toBe(true);

    const magic: StrokeOp = { ...dot, magic: true };
    beginTiledCommand(true);
    recordTiledOp(magic);
    expect(hasUnresolvedTiledMagicOps()).toBe(true);

    magic.magicSheet = {
      canvas: document.createElement('canvas'),
      originX: 0,
      originY: 0,
    };
    expect(hasUnresolvedTiledMagicOps()).toBe(false);
    commitTiledCommand();
    undoTiledCommand(1);
  });

  it('captures visible settled tiles before an asynchronous export continues', async () => {
    const { host, canvas } = rendererElements();
    const bitmaps = Array.from({ length: 16 }, (_, index) => ({ index }) as unknown as ImageBitmap);
    let nextBitmap = 0;
    const createBitmap = vi.fn((_: HTMLCanvasElement) => Promise.resolve(bitmaps[nextBitmap++]));
    vi.stubGlobal('createImageBitmap', createBitmap);
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    tiles[0].hidden = false;
    tiles[5].hidden = false;

    const snapshot = captureTiledCanvasSnapshot();

    expect(snapshot).toMatchObject({ width: 400, height: 400 });
    expect(snapshot?.tiles).toHaveLength(2);
    expect(createBitmap).toHaveBeenCalledTimes(2);
    await expect(Promise.all(snapshot!.tiles.map((tile) => tile.bitmap))).resolves.toEqual(
      bitmaps.slice(0, 2)
    );
    expect(snapshot?.tiles[0]).toMatchObject({ x: 0, y: 0 });
    expect(snapshot?.tiles[1]).toMatchObject({ x: 100, y: 100 });
  });

  it('spreads clear snapshots across separate animation frames', () => {
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    for (const tile of tiles.slice(0, 4)) tile.hidden = false;
    const deferredFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrames.push(callback);
      return deferredFrames.length;
    });

    clearTiledRenderer(false);
    const tileBytes = 100 * 100 * 4;
    let previousBytes = 0;
    let captureFrames = 0;
    while (tiledHistoryDebug().patchBytes < tileBytes * 4) {
      deferredFrames.shift()?.(0);
      const bytes = tiledHistoryDebug().patchBytes;
      expect(bytes - previousBytes).toBeLessThanOrEqual(tileBytes);
      if (bytes > previousBytes) captureFrames++;
      previousBytes = bytes;
    }
    expect(captureFrames).toBe(4);
  });

  it('hides and invalidates an open crayon pass before the tile is reused', () => {
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => true,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const crayonLayers = [
      ...host.querySelectorAll<HTMLCanvasElement>('[data-live-crayon-bottom]'),
      ...host.querySelectorAll<HTMLCanvasElement>('[data-live-crayon-top]'),
    ];
    const crayonDot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
      crayon: true,
      seed: 1,
    };
    const deferredFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrames.push(callback);
      return deferredFrames.length;
    });

    beginTiledCommand(true);
    renderTiledOp(crayonDot);
    recordTiledOp(crayonDot);
    expect(crayonLayers.filter((layer) => !layer.hidden)).toHaveLength(2);

    clearTiledRenderer(true);
    expect(crayonLayers.every((layer) => layer.hidden)).toBe(true);

    renderTiledOp(crayonDot);
    recordTiledOp(crayonDot);
    expect(crayonLayers.filter((layer) => !layer.hidden)).toHaveLength(2);
    expect(
      crayonLayers.some(
        (layer) => vi.mocked(layer.getContext('2d')!.clearRect).mock.calls.length > 0
      )
    ).toBe(true);

    const crayonFlush: StrokeOp = { kind: 'crayonFlush' };
    renderTiledOp(crayonFlush);
    recordTiledOp(crayonFlush);
    commitTiledCommand();
    deferredFrames.shift()?.(0);
    deferredFrames.shift()?.(16);
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
    undoTiledCommand(1);
    undoTiledCommand(1);
  });

  it('migrates blank backings across frames without rebuilding stale undo patches', () => {
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 800, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    const dot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
    };
    beginTiledCommand(true);
    renderTiledOp(dot);
    recordTiledOp(dot);
    commitTiledCommand();
    const deferredFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrames.push(callback);
      return deferredFrames.length;
    });
    clearTiledRenderer(false);
    const patchBytesBeforeResize = tiledHistoryDebug().patchBytes;

    resizeTiledRenderer(800, 400, 1, true);
    const patchBytesAfterResize = tiledHistoryDebug().patchBytes;
    applyTiledView(IDENTITY_PAPER_VIEW);
    expect(tiles.some((tile) => tile.width !== 200 || tile.height !== 100)).toBe(true);
    while (deferredFrames.length) deferredFrames.shift()!(0);

    expect(tiles.every((tile) => tile.width === 200 && tile.height === 100)).toBe(true);
    expect(patchBytesAfterResize).toBeGreaterThan(patchBytesBeforeResize);
    expect(tiledHistoryDebug().patchBytes).toBe(patchBytesAfterResize);
    expect(undoTiledCommand(1)).toMatchObject({ empty: false, canUndo: true });
    expect(tiledHistoryDebug().patchBytes).toBeLessThan(patchBytesAfterResize);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
  });

  it('does not capture while a pointer is active', () => {
    const { canvas } = rendererElements();
    const createBitmap = vi.fn();
    vi.stubGlobal('createImageBitmap', createBitmap);
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => true,
    });
    resizeTiledRenderer(400, 400, 1);

    expect(captureTiledCanvasSnapshot()).toBeNull();
    expect(createBitmap).not.toHaveBeenCalled();
  });

  it('keeps blank folded history tiles out of the compositor tree', () => {
    vi.useFakeTimers();
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const dot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
    };
    for (let index = 0; index < 21; index++) {
      beginTiledCommand(index === 0);
      renderTiledOp(dot);
      recordTiledOp(dot);
      commitTiledCommand();
    }

    vi.advanceTimersByTime(1_500);
    repaintTiledRenderer(false);

    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
  });
});
