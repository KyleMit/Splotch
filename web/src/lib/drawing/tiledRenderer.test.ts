import { describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import { LIVE_TILE_COLUMNS, LIVE_TILE_COUNT, LIVE_TILE_ROWS } from './liveTiles';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  captureTiledCanvasSnapshot,
  clearTiledRenderer,
  commitTiledCommand,
  recordTiledOp,
  recoverTiledRendererIfNeeded,
  repaintTiledRenderer,
  renderTiledOp,
  resizeTiledRenderer,
  tiledHistoryDebug,
  tiledSurfaceTopologyDebug,
  tiledWorkDebug,
  undoTiledCommand,
} from './tiledRenderer';
import { installTiledRendererTestHarness, rendererElements } from './tiledRendererTestHarness';

vi.mock('./crayonBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crayonBrush')>()),
  crayonPatternFor: () => ({}) as CanvasPattern,
}));

installTiledRendererTestHarness();

const TEST_PAPER_PX = 400;
const TEST_TILE_WIDTH_PX = TEST_PAPER_PX / LIVE_TILE_COLUMNS;
const TEST_TILE_HEIGHT_PX = TEST_PAPER_PX / LIVE_TILE_ROWS;

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
      Array.from({ length: LIVE_TILE_COUNT }, () => ({
        width: TEST_TILE_WIDTH_PX,
        height: TEST_TILE_HEIGHT_PX,
      }))
    );
    expect(tiledWorkDebug()).toMatchObject({
      backingMigrationPending: false,
      liveSurfaceElements: 60,
      realizedNormalBackings: LIVE_TILE_COUNT,
      realizedCrayonBackings: 0,
      maxLiveBackingBytes: 32_000,
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
    expect(tiledHistoryDebug().patchBytes - patchBytesBeforeClear).toBe(
      TEST_TILE_WIDTH_PX * TEST_TILE_HEIGHT_PX * 4
    );

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
  });

  it('counts seam overdraw with no crayon plane backings realized', () => {
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
      y: 80,
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

    // The restamp renderer deposits wax on the normal tiles; the vestigial
    // preview planes never realize a backing (crayonPassBuffer.ts).
    expect(tiledWorkDebug()).toMatchObject({
      realizedCrayonBackings: 0,
      totalLiveBackingBytes: 640_000,
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

  it('rebinds reset live contexts and rebuilds their pixels from retained history', () => {
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
    beginTiledCommand(true);
    renderTiledOp(dot);
    recordTiledOp(dot);
    commitTiledCommand();

    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    for (const tile of tiles) {
      const context = tile.getContext('2d')!;
      context.lineCap = 'butt';
      context.lineJoin = 'miter';
      context.setTransform(1, 0, 0, 1, 0, 0);
      tile.hidden = true;
    }
    const crayonBottom = host.querySelector<HTMLCanvasElement>('[data-live-crayon-bottom]')!;
    crayonBottom.getContext('2d')!.lineCap = 'butt';

    expect(recoverTiledRendererIfNeeded()).toBe(true);
    expect(tiles[0].hidden).toBe(false);
    expect(tiles[5].getContext('2d')!.getTransform()).toMatchObject({ e: -100, f: -80 });
    expect(tiles.every((tile) => tile.getContext('2d')!.lineCap === 'round')).toBe(true);
    expect(crayonBottom.getContext('2d')!.lineCap).toBe('round');
    expect(recoverTiledRendererIfNeeded()).toBe(false);
  });

  it('waits until every reported live context is restored before rebuilding', () => {
    const deferredFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrames.push(callback);
      return deferredFrames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { host, canvas } = rendererElements();
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 1);
    applyTiledView(IDENTITY_PAPER_VIEW);
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    let firstLost = true;
    let secondLost = true;
    Object.assign(tiles[0].getContext('2d')!, { isContextLost: () => firstLost });
    Object.assign(tiles[1].getContext('2d')!, { isContextLost: () => secondLost });
    for (const tile of tiles.slice(0, 2)) {
      tile.getContext('2d')!.lineCap = 'butt';
      tile.dispatchEvent(new Event('contextlost'));
    }

    firstLost = false;
    tiles[0].dispatchEvent(new Event('contextrestored'));
    deferredFrames.shift()?.(0);
    expect(tiles[0].getContext('2d')!.lineCap).toBe('butt');

    secondLost = false;
    tiles[1].dispatchEvent(new Event('contextrestored'));
    deferredFrames.shift()?.(16);
    expect(tiles[0].getContext('2d')!.lineCap).toBe('round');
    expect(tiles[1].getContext('2d')!.getTransform()).toMatchObject({ e: -100, f: 0 });
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
    expect(snapshot?.tiles[1]).toMatchObject({ x: 100, y: 80 });
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
    const tileBytes = TEST_TILE_WIDTH_PX * TEST_TILE_HEIGHT_PX * 4;
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

  it('drops an open crayon pass when the paper is cleared', () => {
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
    // Wax lands on the normal tile; the vestigial preview planes stay hidden.
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
    expect(crayonLayers.every((layer) => layer.hidden)).toBe(true);

    clearTiledRenderer(true);
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      0
    );

    // A redraw after the clear opens a fresh pass rather than resurrecting
    // the dropped one.
    renderTiledOp(crayonDot);
    recordTiledOp(crayonDot);
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
    expect(crayonLayers.every((layer) => layer.hidden)).toBe(true);

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
    expect(tiles.some((tile) => tile.width !== 200 || tile.height !== 80)).toBe(true);
    while (deferredFrames.length) deferredFrames.shift()!(0);

    expect(tiles.every((tile) => tile.width === 200 && tile.height === 80)).toBe(true);
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
