import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeTiledPng } from './tiledPngCompositor';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('encodeTiledPng', () => {
  it('executes the shared paper and overlay compositor around the live tiles', async () => {
    const expected = new Blob(['png'], { type: 'image/png' });
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
      encodeTiledPng({
        sourceWidth: 400,
        sourceHeight: 300,
        sourceScale: 2,
        exportScale: 2,
        tiles: [{ bitmap: tile, x: 10, y: 20 }],
        texture,
        overlay,
        paperColor: '#fffaf0',
      })
    ).resolves.toBe(expected);

    expect(canvases).toHaveLength(1);
    expect(canvases[0]).toMatchObject({ width: 400, height: 300 });
    expect(setTransform).toHaveBeenNthCalledWith(1, 2, 0, 0, 2, 0, 0);
    expect(setTransform).toHaveBeenNthCalledWith(2, 1, 0, 0, 1, 0, 0);
    expect(setTransform).toHaveBeenNthCalledWith(3, 2, 0, 0, 2, 0, 0);
    expect(drawImage).toHaveBeenNthCalledWith(1, tile, 10, 20);
    expect(drawImage).toHaveBeenNthCalledWith(2, overlay, 62.5, 0, 75, 150);
    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' });
  });
});
