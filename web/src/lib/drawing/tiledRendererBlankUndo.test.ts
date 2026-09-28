import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
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

// The last case here drives undo down to an empty history, which is only
// reachable on a renderer no earlier test has drawn on, so every test takes a
// module instance of its own.
let renderer: TiledRendererModule;
let adoptTiledRenderer: TiledRendererModule['adoptTiledRenderer'];
let applyTiledView: TiledRendererModule['applyTiledView'];
let beginTiledCommand: TiledRendererModule['beginTiledCommand'];
let clearTiledRenderer: TiledRendererModule['clearTiledRenderer'];
let commitTiledCommand: TiledRendererModule['commitTiledCommand'];
let peekTiledUndoPaper: TiledRendererModule['peekTiledUndoPaper'];
let recordTiledOp: TiledRendererModule['recordTiledOp'];
let renderTiledOp: TiledRendererModule['renderTiledOp'];
let resizeTiledRenderer: TiledRendererModule['resizeTiledRenderer'];
let scanTiledRendererIsEmpty: TiledRendererModule['scanTiledRendererIsEmpty'];
let tiledHistoryDebug: TiledRendererModule['tiledHistoryDebug'];
let undoTiledCommand: TiledRendererModule['undoTiledCommand'];

// A canvas holds ink once a test marks it or a drawImage copies an inked
// source onto it; clearRect blanks it. getImageData reports ink as one opaque
// pixel, which is all the renderer's emptiness scan looks for.
const inkedCanvases = new WeakSet<CanvasImageSource>();

installTiledRendererTestHarness(
  () => renderer,
  (canvas) => ({
    clearRect: vi.fn(() => {
      inkedCanvases.delete(canvas);
    }),
    drawImage: vi.fn((source: CanvasImageSource) => {
      if (inkedCanvases.has(source)) inkedCanvases.add(canvas);
      else inkedCanvases.delete(canvas);
    }),
    getImageData(_x: number, _y: number, width: number, height: number) {
      const data = new Uint8ClampedArray(width * height * 4);
      if (inkedCanvases.has(canvas)) data[3] = 255;
      return { data };
    },
  })
);

beforeEach(async () => {
  renderer = await loadFreshTiledRenderer();
  ({
    adoptTiledRenderer,
    applyTiledView,
    beginTiledCommand,
    clearTiledRenderer,
    commitTiledCommand,
    peekTiledUndoPaper,
    recordTiledOp,
    renderTiledOp,
    resizeTiledRenderer,
    scanTiledRendererIsEmpty,
    tiledHistoryDebug,
    undoTiledCommand,
  } = renderer);
});

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

    for (const tile of tiles.slice(1, 4)) inkedCanvases.add(tile);
    draw(eraser, true);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);
    expect(scanTiledRendererIsEmpty(1)).toBe(true);

    draw(pen, true);
    expect(undoTiledCommand(1)).toEqual({ empty: true, canUndo: true });
    expect(tiles.every((tile) => tile.hidden)).toBe(true);
  });
});
