import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { compositeVisibleLiveTiles } from './liveTileComposite';
import { LIVE_TILE_COLUMNS, LIVE_TILE_COUNT, LIVE_TILE_ROWS } from './liveTiles';
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
  vi.unstubAllGlobals();
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
  return { host, canvas };
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

  // The renderer publishes each tile's intended backing size and
  // compositeVisibleLiveTiles builds its grid from it, but that reader is
  // serialized into the page by Playwright and so can share no constant with
  // the writer. Bind the two sides empirically instead: drive a real resize and
  // read the real composite while the deferred backings still trail it. The
  // shape of the case is what makes it a guard — at renderScale 2 backing
  // pixels part company with CSS pixels, and a width the grid cannot divide
  // evenly separates per-tile geometry from one span published grid-wide.
  it('composites the intended grid while the tile backings still trail it', () => {
    const { host, canvas } = rendererElements();
    vi.stubGlobal('devicePixelRatio', 2);
    adoptTiledRenderer(canvas, {
      paperSize: () => ({ width: 801, height: 400 }),
      hasActivePointers: () => false,
    });
    resizeTiledRenderer(400, 400, 2);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    resizeTiledRenderer(801, 400, 2, true);

    const tiles = [...host.querySelectorAll<HTMLCanvasElement>('[data-live-tile]')];
    expect(
      tiles.every(
        (tile) =>
          tile.width === Math.floor(400 / LIVE_TILE_COLUMNS) &&
          tile.height === Math.floor(400 / LIVE_TILE_ROWS)
      )
    ).toBe(true);

    const rendered = compositeVisibleLiveTiles(host);

    expect([rendered.width, rendered.height]).toEqual([801, 400]);
  });

  it('rebases an active command when undo removes the paper beneath it', () => {
    const { canvas } = rendererElements();
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
