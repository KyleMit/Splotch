import { afterEach, beforeEach, vi } from 'vitest';

import { LIVE_TILE_COUNT } from './liveTiles';
import { detachTiledRenderer } from './tiledRenderer';

export function installTiledRendererTestHarness() {
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
        createPattern: () => ({}) as CanvasPattern,
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
}

export function rendererElements() {
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
