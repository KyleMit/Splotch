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
  renderTiledOp,
  resizeTiledRenderer,
  undoTiledCommand,
} from './tiledRenderer';

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
      clearRect() {},
      drawImage() {},
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

    clearTiledRenderer(false);
    expect(tiles.every((tile) => tile.hidden)).toBe(true);

    undoTiledCommand(1);
    expect(tiles.filter((tile) => !tile.hidden)).toHaveLength(1);

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

  it('captures every settled live tile before an asynchronous export continues', async () => {
    const { canvas } = rendererElements();
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

    const snapshot = captureTiledCanvasSnapshot();

    expect(snapshot).toMatchObject({ width: 400, height: 400 });
    expect(snapshot?.tiles).toHaveLength(16);
    expect(createBitmap).toHaveBeenCalledTimes(16);
    await expect(Promise.all(snapshot!.tiles.map((tile) => tile.bitmap))).resolves.toEqual(bitmaps);
    expect(snapshot?.tiles[0]).toMatchObject({ x: 0, y: 0 });
    expect(snapshot?.tiles.at(-1)).toMatchObject({ x: 300, y: 300 });
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
});
