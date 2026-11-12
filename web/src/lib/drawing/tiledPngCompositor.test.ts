import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createTiledPngPreview,
  createTiledPngSurface,
  paintTiledPngSurface,
  readTilesOnce,
} from './tiledPngCompositor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tiled PNG composition', () => {
  it('executes the shared paper and overlay compositor around the live tiles', async () => {
    const expected = new Blob(['png'], { type: 'image/png' });
    const drawImage = vi.fn();
    const setTransform = vi.fn();
    const fills: Array<{
      fillStyle: string | CanvasGradient | CanvasPattern;
      compositeOperation: GlobalCompositeOperation;
    }> = [];
    const context = {
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      fillStyle: '',
      setTransform,
      resetTransform: vi.fn(),
      fillRect: vi.fn(() => {
        fills.push({
          fillStyle: context.fillStyle,
          compositeOperation: context.globalCompositeOperation,
        });
      }),
      createPattern: vi.fn(() => {
        expect(context.imageSmoothingEnabled).toBe(true);
        expect(context.imageSmoothingQuality).toBe('high');
        return {} as CanvasPattern;
      }),
      drawImage,
    };
    const convertToBlob = vi.fn(async () => expected);
    const getContext = vi.fn(() => context);
    const canvases: Array<{ width: number; height: number }> = [];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          readonly width: number,
          readonly height: number
        ) {
          canvases.push(this);
        }
        getContext = getContext;
        convertToBlob = convertToBlob;
      }
    );
    const tile = { width: 50, height: 50 } as ImageBitmap;
    const texture = { width: 32, height: 32 } as ImageBitmap;
    const overlay = { width: 100, height: 200 } as ImageBitmap;

    const input = {
      sourceWidth: 400,
      sourceHeight: 300,
      sourceScale: 2,
      exportScale: 2,
      tiles: [{ bitmap: tile, x: 10, y: 20 }],
      texture,
      overlay,
      paperColor: '#fffaf0',
    };
    const surface = createTiledPngSurface(input);
    paintTiledPngSurface(surface, input);

    await expect(surface.canvas.convertToBlob({ type: 'image/png' })).resolves.toBe(expected);

    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toMatchObject({ width: 400, height: 300 });
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(setTransform).toHaveBeenNthCalledWith(1, 2, 0, 0, 2, 0, 0);
    expect(setTransform).toHaveBeenNthCalledWith(2, 1, 0, 0, 1, 0, 0);
    expect(setTransform).toHaveBeenNthCalledWith(3, 2, 0, 0, 2, 0, 0);
    expect(drawImage).toHaveBeenNthCalledWith(1, tile, 10, 20);
    expect(drawImage).toHaveBeenNthCalledWith(2, overlay, 62.5, 0, 75, 150);
    expect(fills).toEqual([
      { fillStyle: expect.any(Object), compositeOperation: 'destination-over' },
      { fillStyle: '#fffaf0', compositeOperation: 'destination-over' },
    ]);
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' });
  });

  it('paints the preview from the tile layers at its own size on a CPU surface', () => {
    const bitmap = {} as ImageBitmap;
    const drawImage = vi.fn();
    const setTransform = vi.fn();
    const context = {
      globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      fillStyle: '',
      setTransform,
      resetTransform: vi.fn(),
      fillRect: vi.fn(),
      createPattern: vi.fn(() => ({}) as CanvasPattern),
      drawImage,
    };
    const transferToImageBitmap = vi.fn(() => bitmap);
    const getContext = vi.fn(() => context);
    const canvases: Array<{ width: number; height: number }> = [];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          readonly width: number,
          readonly height: number
        ) {
          canvases.push(this);
        }
        getContext = getContext;
        transferToImageBitmap = transferToImageBitmap;
      }
    );
    const tile = { width: 50, height: 50 } as ImageBitmap;

    const preview = createTiledPngPreview(
      {
        sourceWidth: 400,
        sourceHeight: 300,
        sourceScale: 2,
        tiles: [{ bitmap: tile, x: 10, y: 20 }],
        texture: null,
        overlay: null,
        paperColor: '#fffaf0',
      },
      100
    );

    expect(preview).toBe(bitmap);
    expect(canvases).toEqual([expect.objectContaining({ width: 100, height: 75 })]);
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(setTransform).toHaveBeenNthCalledWith(2, 0.25, 0, 0, 0.25, 0, 0);
    expect(drawImage).toHaveBeenCalledWith(tile, 10, 20);
    expect(transferToImageBitmap).toHaveBeenCalledOnce();
  });

  it('reads each tile back once onto a CPU surface the preview and the page then share', () => {
    const drawImage = vi.fn();
    const getContext = vi.fn(() => ({ drawImage }));
    const copies: Array<{ width: number; height: number }> = [];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          readonly width: number,
          readonly height: number
        ) {
          copies.push(this);
        }
        getContext = getContext;
      }
    );
    const tile = { width: 256, height: 128 } as ImageBitmap;

    const read = readTilesOnce([{ bitmap: tile, x: 512, y: 0 }]);

    expect(copies).toEqual([expect.objectContaining({ width: 256, height: 128 })]);
    expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true });
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(tile, 0, 0);
    expect(read).toEqual([{ bitmap: copies[0], x: 512, y: 0 }]);
  });
});
