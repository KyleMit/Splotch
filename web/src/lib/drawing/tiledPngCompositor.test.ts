import { afterEach, describe, expect, it, vi } from 'vitest';
import { composeTiledPngCanvas, createTiledPngPreview } from './tiledPngCompositor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('composeTiledPngCanvas', () => {
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
        getContext() {
          return context;
        }
        convertToBlob = convertToBlob;
      }
    );
    const tile = { width: 50, height: 50 } as ImageBitmap;
    const texture = { width: 32, height: 32 } as ImageBitmap;
    const overlay = { width: 100, height: 200 } as ImageBitmap;

    await expect(
      composeTiledPngCanvas({
        sourceWidth: 400,
        sourceHeight: 300,
        sourceScale: 2,
        exportScale: 2,
        tiles: [{ bitmap: tile, x: 10, y: 20 }],
        texture,
        overlay,
        paperColor: '#fffaf0',
      }).convertToBlob({ type: 'image/png' })
    ).resolves.toBe(expected);

    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toMatchObject({ width: 400, height: 300 });
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

  it('downscales the composed export into a transferable preview bitmap', () => {
    const source = { width: 400, height: 300 } as OffscreenCanvas;
    const bitmap = {} as ImageBitmap;
    const context = {
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low' as ImageSmoothingQuality,
      drawImage: vi.fn(),
    };
    const transferToImageBitmap = vi.fn(() => bitmap);
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        constructor(
          readonly width: number,
          readonly height: number
        ) {}
        getContext() {
          return context;
        }
        transferToImageBitmap = transferToImageBitmap;
      }
    );

    expect(createTiledPngPreview(source, 200)).toBe(bitmap);

    expect(context.imageSmoothingEnabled).toBe(true);
    expect(context.imageSmoothingQuality).toBe('high');
    expect(context.drawImage).toHaveBeenCalledWith(source, 0, 0, 200, 150);
    expect(transferToImageBitmap).toHaveBeenCalledOnce();
  });
});
