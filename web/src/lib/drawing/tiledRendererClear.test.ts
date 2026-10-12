import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import { LIVE_TILE_COLUMNS, LIVE_TILE_ROWS } from './liveTiles';
import type { StrokeOp } from './strokeOps';
import {
  installTiledRendererTestHarness,
  loadFreshTiledRenderer,
  rendererElements,
  type TiledRendererModule,
} from './tiledRendererTestHarness';

vi.mock('./crayonBrush', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./crayonBrush')>()),
  crayonPatternFor: () => ({}) as CanvasPattern,
}));

// These cases assert absolute undo-patch bytes, so each test draws on a
// renderer of its own rather than on whatever the test before it left in the
// shared module's history.
let renderer: TiledRendererModule;

installTiledRendererTestHarness(() => renderer);

beforeEach(async () => {
  renderer = await loadFreshTiledRenderer();
});

const TEST_PAPER_PX = 400;
const TEST_TILE_WIDTH_PX = TEST_PAPER_PX / LIVE_TILE_COLUMNS;
const TEST_TILE_HEIGHT_PX = TEST_PAPER_PX / LIVE_TILE_ROWS;

describe('clearing the tiled canvas', () => {
  it('drops pre-clear work from a command that continues after clear', () => {
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn(() => 1)
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const { canvas } = rendererElements();
    renderer.adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => true,
    });
    renderer.resizeTiledRenderer(400, 400, 1);
    renderer.applyTiledView(IDENTITY_PAPER_VIEW);
    const dot: StrokeOp = {
      kind: 'dot',
      x: 50,
      y: 50,
      radius: 5,
      color: '#ff0000',
      erase: false,
    };
    renderer.beginTiledCommand(true);
    renderer.renderTiledOp(dot);
    renderer.recordTiledOp(dot);

    renderer.clearTiledRenderer(false);
    renderer.renderTiledOp(dot);
    renderer.recordTiledOp(dot);
    renderer.commitTiledCommand();

    expect(renderer.tiledWorkDebug()).toMatchObject({
      lastCommand: { inputOps: 1, rasterizedOps: 1, maxSurfaceVisitsPerOp: 1 },
    });
    renderer.undoTiledCommand(1);
    renderer.undoTiledCommand(1);
  });

  it('spreads clear snapshots across separate animation frames', () => {
    const { host, canvas } = rendererElements();
    renderer.adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => false,
    });
    renderer.resizeTiledRenderer(400, 400, 1);
    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    for (const tile of tiles.slice(0, 4)) tile.hidden = false;
    const deferredFrames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      deferredFrames.push(callback);
      return deferredFrames.length;
    });

    renderer.clearTiledRenderer(false);
    const tileBytes = TEST_TILE_WIDTH_PX * TEST_TILE_HEIGHT_PX * 4;
    let previousBytes = 0;
    let captureFrames = 0;
    while (renderer.tiledHistoryDebug().patchBytes < tileBytes * 4) {
      deferredFrames.shift()?.(0);
      const bytes = renderer.tiledHistoryDebug().patchBytes;
      expect(bytes - previousBytes).toBeLessThanOrEqual(tileBytes);
      if (bytes > previousBytes) captureFrames++;
      previousBytes = bytes;
    }
    expect(captureFrames).toBe(4);
  });

  it('drops an open crayon pass when the paper is cleared', () => {
    const { host, canvas } = rendererElements();
    renderer.adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => true,
    });
    renderer.resizeTiledRenderer(400, 400, 1);
    renderer.applyTiledView(IDENTITY_PAPER_VIEW);
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

    renderer.beginTiledCommand(true);
    renderer.renderTiledOp(crayonDot);
    renderer.recordTiledOp(crayonDot);
    // Wax lands on the normal tile; the vestigial preview planes stay hidden.
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
    expect(crayonLayers.every((layer) => layer.hidden)).toBe(true);

    renderer.clearTiledRenderer(true);
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      0
    );

    // A redraw after the clear opens a fresh pass rather than resurrecting
    // the dropped one.
    renderer.renderTiledOp(crayonDot);
    renderer.recordTiledOp(crayonDot);
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
    expect(crayonLayers.every((layer) => layer.hidden)).toBe(true);

    const crayonFlush: StrokeOp = { kind: 'crayonFlush' };
    renderer.renderTiledOp(crayonFlush);
    renderer.recordTiledOp(crayonFlush);
    renderer.commitTiledCommand();
    deferredFrames.shift()?.(0);
    deferredFrames.shift()?.(16);
    expect(host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]:not([hidden])')).toHaveLength(
      1
    );
    renderer.undoTiledCommand(1);
    renderer.undoTiledCommand(1);
  });
});
