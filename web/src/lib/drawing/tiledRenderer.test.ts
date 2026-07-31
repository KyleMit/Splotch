import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
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
    resizeTiledRenderer(1);
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
});
