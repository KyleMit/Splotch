import { describe, expect, it, vi } from 'vitest';
import {
  drawExportOverlay,
  paintExportPaper,
  paintTiledExportLayers,
  type ExportContext,
} from './exportCompositor';

function createContext() {
  const fills: Array<{
    fillStyle: string | CanvasGradient | CanvasPattern;
    compositeOperation: GlobalCompositeOperation;
  }> = [];
  const context = {
    globalCompositeOperation: 'source-over' as GlobalCompositeOperation,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low' as ImageSmoothingQuality,
    fillStyle: '',
    setTransform: vi.fn(),
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
    drawImage: vi.fn(),
  };
  return { context, fills };
}

describe('export compositor', () => {
  it('smooths the texture before painting it over the paper color', () => {
    const { context, fills } = createContext();
    const texture = {} as CanvasImageSource;

    paintExportPaper(context as unknown as ExportContext, {
      width: 200,
      height: 100,
      scale: 2,
      paperColor: '#fffaf0',
      texture,
    });

    expect(context.createPattern).toHaveBeenCalledWith(texture, 'repeat');
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.fillRect).toHaveBeenNthCalledWith(1, 0, 0, 200, 100);
    expect(context.fillRect).toHaveBeenNthCalledWith(2, 0, 0, 200, 100);
    expect(fills).toEqual([
      { fillStyle: expect.any(Object), compositeOperation: 'destination-over' },
      { fillStyle: '#fffaf0', compositeOperation: 'destination-over' },
    ]);
    expect(context.globalCompositeOperation).toBe('source-over');
    expect(context.resetTransform).toHaveBeenCalledOnce();
  });

  it('uses the shared contain-fit geometry for an overlay', () => {
    const { context } = createContext();
    const overlay = {} as CanvasImageSource;

    drawExportOverlay(
      context as unknown as ExportContext,
      { source: overlay, width: 100, height: 200 },
      { width: 200, height: 100, scale: 2 }
    );

    expect(context.drawImage).toHaveBeenCalledWith(overlay, 75, 0, 50, 100);
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.resetTransform).toHaveBeenCalledOnce();
  });

  it('stacks the paper under the tiles at output-over-source scale and the overlay on top', () => {
    const { context, fills } = createContext();
    const tile = {} as CanvasImageSource;
    const overlay = {} as CanvasImageSource;

    paintTiledExportLayers(context as unknown as ExportContext, {
      tiles: [{ bitmap: tile, x: 10, y: 20 }],
      sourceScale: 2,
      width: 200,
      height: 100,
      scale: 1,
      paperColor: '#fffaf0',
      texture: null,
      overlay: { source: overlay, width: 100, height: 200 },
    });

    expect(fills).toEqual([{ fillStyle: '#fffaf0', compositeOperation: 'destination-over' }]);
    expect(context.setTransform.mock.calls).toEqual([
      [1, 0, 0, 1, 0, 0],
      [0.5, 0, 0, 0.5, 0, 0],
      [1, 0, 0, 1, 0, 0],
    ]);
    expect(context.drawImage.mock.calls).toEqual([
      [tile, 10, 20],
      [overlay, 75, 0, 50, 100],
    ]);
    expect(context.globalCompositeOperation).toBe('source-over');
  });
});
