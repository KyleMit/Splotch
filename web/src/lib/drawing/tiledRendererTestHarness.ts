import { afterEach, beforeEach, vi } from 'vitest';

import { LIVE_TILE_COUNT } from './liveTiles';
import * as sharedRenderer from './tiledRenderer';

export type TiledRendererModule = typeof sharedRenderer;

// The renderer keeps its drawing history in module state that
// detachTiledRenderer leaves standing on purpose: engine.ts's teardown spells
// out that tiled history outlives a mount, so a remount keeps the ink, and
// nothing in the product ever discards it. A test that asserts an absolute
// history depth or undo-patch budget therefore has to run against a renderer
// that has never drawn, which only a module instance of its own can give it.
export async function loadFreshTiledRenderer(): Promise<TiledRendererModule> {
  vi.resetModules();
  return import('./tiledRenderer');
}

// The renderer to tear down defaults to the module every test in the file
// shares; a file whose tests each load their own passes a getter for the one
// the running test is using.
export function installTiledRendererTestHarness(
  currentRenderer: () => Pick<TiledRendererModule, 'detachTiledRenderer'> = () => sharedRenderer
) {
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
    currentRenderer().detachTiledRenderer();
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
