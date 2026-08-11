import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { LIVE_TILE_COUNT } from './liveTiles';
import { IDENTITY_PAPER_VIEW } from './paperView';
import type { StrokeOp } from './strokeOps';
import {
  adoptTiledRenderer,
  applyTiledView,
  beginTiledCommand,
  commitTiledCommand,
  detachTiledRenderer,
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
});

function rendererElements() {
  const host = document.createElement('div');
  const canvas = document.createElement('canvas');
  host.append(canvas);
  for (let index = 0; index < LIVE_TILE_COUNT; index++) {
    for (const attribute of ['liveTile', 'liveCrayonBottom', 'liveCrayonTop'] as const) {
      const tile = document.createElement('canvas');
      tile.dataset[attribute] = '';
      tile.hidden = true;
      host.append(tile);
    }
  }
  return canvas;
}

describe('tiled renderer contract', () => {
  it('rejects an input canvas without the template-owned live surfaces', () => {
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.append(canvas);

    expect(() =>
      adoptTiledRenderer(canvas, {
        paperSize: () => ({ width: 400, height: 400 }),
        hasActivePointers: () => false,
      })
    ).toThrow('Drawing engine live surface markup is missing or incomplete');
  });

  it('rebases an active command when undo removes the paper beneath it', () => {
    const canvas = rendererElements();
    let pointerActive = false;
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 400, height: 400 }),
      hasActivePointers: () => pointerActive,
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

    pointerActive = true;
    beginTiledCommand(false);
    renderTiledOp(dot);
    recordTiledOp(dot);
    undoTiledCommand(1);

    pointerActive = false;
    commitTiledCommand();
    expect(undoTiledCommand(1)).toMatchObject({ empty: true });
  });
});
