import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import { LIVE_TILE_COUNT } from './liveTiles';
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
  scanTiledRendererIsEmpty,
  tiledHistoryDebug,
  tiledSurfaceTopologyDebug,
  tiledWorkDebug,
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
  vi.useRealTimers();
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
      Array.from({ length: LIVE_TILE_COUNT }, () => ({ width: 100, height: 100 }))
    );
    expect(tiledWorkDebug()).toMatchObject({
      backingMigrationPending: false,
      liveSurfaceElements: 48,
      realizedNormalBackings: LIVE_TILE_COUNT,
      realizedCrayonBackings: 0,
      maxLiveBackingBytes: 40_000,
      totalLiveBackingBytes: 640_000,
      lastCommand: null,
    });
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

    expect(tiledWorkDebug()).toMatchObject({
      lastCommand: { inputOps: 1, rasterizedOps: 1, maxSurfaceVisitsPerOp: 1 },
    });

    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
    expect(resizeTiledRenderer(400, 400, 1)).toBe(false);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
    expect(tiledHistoryDebug().patchBytes).toBe(0);

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

    const clearCallsBeforeBlankUndo = tiles.reduce(
      (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
      0
    );
    expect(undoTiledCommand(1)).toEqual({ empty: true, canUndo: false });
    expect(tiles.every((tile) => tile.hidden)).toBe(true);
    expect(
      tiles.reduce(
        (calls, tile) => calls + vi.mocked(tile.getContext('2d')!.clearRect).mock.calls.length,
        0
      )
    ).toBe(clearCallsBeforeBlankUndo);

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

  it('restores a blank state after clear without replaying retained history', () => {
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
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
    const widePath: StrokeOp = {
      kind: 'path',
      pid: 1,
      startX: 25,
      startY: 50,
      segs: [{ cx: 200, cy: 50, x: 375, y: 50 }],
      color: '#ff0000',
      lineWidth: 10,
      erase: false,
    };
    const draw = (op: StrokeOp, wasEmpty: boolean) => {
      beginTiledCommand(wasEmpty);
      renderTiledOp(op);
      recordTiledOp(op);
      commitTiledCommand();
    };
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];

    draw(dot, true);
    clearTiledRenderer(false);
    draw(widePath, true);
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
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const widePath: StrokeOp = {
      kind: 'path',
      pid: 1,
      startX: 25,
      startY: 50,
      segs: [{ cx: 200, cy: 50, x: 375, y: 50 }],
      color: '#ff0000',
      lineWidth: 10,
      erase: false,
    };
    const eraser: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#000000',
      erase: true,
    };
    const pen: StrokeOp = { ...eraser, color: '#ff0000', erase: false };
    const draw = (op: StrokeOp, wasEmpty: boolean) => {
      beginTiledCommand(wasEmpty);
      renderTiledOp(op);
      recordTiledOp(op);
      commitTiledCommand();
    };
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];

    draw(widePath, true);
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

  it('counts seam overdraw and lazily realized crayon backings', () => {
    const { canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const crayonDot: StrokeOp = {
      kind: 'dot',
      x: 100,
      y: 100,
      radius: 5,
      color: '#ff0000',
      erase: false,
      crayon: true,
      seed: 1,
    };
    beginTiledCommand(true);
    renderTiledOp(crayonDot);
    recordTiledOp(crayonDot);
    commitTiledCommand();

    expect(tiledWorkDebug()).toMatchObject({
      realizedCrayonBackings: 8,
      totalLiveBackingBytes: 960_000,
      lastCommand: { inputOps: 1, rasterizedOps: 4, maxSurfaceVisitsPerOp: 4 },
    });
    undoTiledCommand(1);
  });

  it('recounts an active command from scratch when repaint replays it', () => {
    const { canvas } = rendererElements();
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
    beginTiledCommand(true);
    renderTiledOp(dot);
    recordTiledOp(dot);

    repaintTiledRenderer();
    commitTiledCommand();

    expect(tiledWorkDebug()).toMatchObject({
      lastCommand: { inputOps: 1, rasterizedOps: 1, maxSurfaceVisitsPerOp: 1 },
    });
    undoTiledCommand(1);
  });

  it('drops pre-clear work from a command that continues after clear', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => true,
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
    beginTiledCommand(true);
    renderTiledOp(dot);
    recordTiledOp(dot);

    clearTiledRenderer(false);
    renderTiledOp(dot);
    recordTiledOp(dot);
    commitTiledCommand();

    expect(tiledWorkDebug()).toMatchObject({
      lastCommand: { inputOps: 1, rasterizedOps: 1, maxSurfaceVisitsPerOp: 1 },
    });
    undoTiledCommand(1);
    undoTiledCommand(1);
  });

  it('captures visible settled tiles before an asynchronous export continues', async () => {
    const { host, canvas } = rendererElements();
    const bitmaps = Array.from(
      { length: LIVE_TILE_COUNT },
      (_, index) => ({ index }) as unknown as ImageBitmap
    );
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

  it('waits for paper geometry before folding and keeps blank base tiles hidden', () => {
    vi.useFakeTimers();
    const { host, canvas } = rendererElements();
    let paperReady = true;
    adoptTiledRenderer(canvas, {
      paperSize: () => (paperReady ? { width: 400, height: 400 } : { width: 0, height: 0 }),
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
    const initialHistoryLength = tiledHistoryDebug().historyLength ?? 0;
    for (let index = 0; index < 21; index++) {
      beginTiledCommand(index === 0);
      renderTiledOp(dot);
      recordTiledOp(dot);
      commitTiledCommand();
    }

    paperReady = false;
    vi.advanceTimersByTime(1_500);
    expect(tiledHistoryDebug()).toMatchObject({
      baseRasters: 0,
      historyLength: initialHistoryLength + 21,
    });

    paperReady = true;
    vi.advanceTimersByTime(1_500);
    expect(tiledHistoryDebug()).toMatchObject({
      baseRasters: LIVE_TILE_COUNT,
      historyLength: initialHistoryLength + 20,
    });
    repaintTiledRenderer(false);

    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
  });
});
