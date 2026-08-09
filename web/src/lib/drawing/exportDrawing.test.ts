import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appearanceMock = vi.hoisted(() => ({
  resolvedTheme: vi.fn<() => 'light' | 'dark'>(),
}));
const pngMock = vi.hoisted(() => ({
  encodeTiledCanvasPng: vi.fn(),
}));

vi.mock('../state/appearance.svelte', () => appearanceMock);
vi.mock('./pngEncoder', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pngEncoder')>()),
  encodeTiledCanvasPng: pngMock.encodeTiledCanvasPng,
}));

const requested: ControllableImage[] = [];

class ControllableImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  naturalWidth = 100;
  naturalHeight = 50;

  constructor() {
    requested.push(this);
  }
}

beforeEach(() => {
  vi.resetModules();
  requested.length = 0;
  appearanceMock.resolvedTheme.mockReturnValue('light');
  pngMock.encodeTiledCanvasPng.mockReset();
  vi.stubGlobal('Image', ControllableImage);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

type OverlayDraw = {
  source: CanvasImageSource;
  compositeOperation: GlobalCompositeOperation;
};

type CanvasContextStub = {
  globalCompositeOperation: GlobalCompositeOperation;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: ImageSmoothingQuality;
  fillStyle: string;
  scale: (x: number, y: number) => void;
  setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
  resetTransform: () => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  createPattern: () => null;
  drawImage: (source: CanvasImageSource) => void;
};

function asCanvasContext(context: CanvasContextStub): CanvasRenderingContext2D {
  return context as unknown as CanvasRenderingContext2D;
}

function createOverlayImage(): HTMLImageElement {
  const overlay = document.createElement('img');
  Object.defineProperties(overlay, {
    naturalWidth: { value: 100 },
    naturalHeight: { value: 50 },
  });
  return overlay;
}

function createOverlaySource(decodedCanonicalImage: HTMLImageElement | null) {
  return {
    canonicalUrl: `${location.origin}/coloring/farm/cat-tall.overlay.webp`,
    decodedCanonicalImage,
  };
}

function createSnapshot(): HTMLCanvasElement {
  const snapshot = document.createElement('canvas');
  snapshot.width = 200;
  snapshot.height = 100;
  return snapshot;
}

function setupExportContexts(inversionContext: CanvasRenderingContext2D | null) {
  const draws: OverlayDraw[] = [];
  const outputContext: CanvasContextStub = {
    globalCompositeOperation: 'source-over',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    fillStyle: '',
    scale: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    fillRect: vi.fn(),
    createPattern: vi.fn(() => null),
    drawImage: vi.fn((source: CanvasImageSource) => {
      draws.push({ source, compositeOperation: outputContext.globalCompositeOperation });
    }),
  };
  let requestingOutputContext = true;

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => {
    if (requestingOutputContext) {
      requestingOutputContext = false;
      return asCanvasContext(outputContext);
    }
    return inversionContext;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
    callback(new Blob());
  });

  return { draws, outputContext };
}

describe('warmPaperTexture', () => {
  it('retries a failed load and caches the successful retry', async () => {
    const { warmPaperTexture } = await import('./exportDrawing');

    warmPaperTexture();
    warmPaperTexture();
    expect(requested).toHaveLength(1);

    requested[0].onerror!();
    warmPaperTexture();
    expect(requested).toHaveLength(2);

    requested[1].onload!();
    warmPaperTexture();
    expect(requested).toHaveLength(2);
  });
});

describe('composeExportPng overlay', () => {
  it('sends settled live tiles directly to the worker compositor', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const expected = new Blob(['tiles'], { type: 'image/png' });
    pngMock.encodeTiledCanvasPng.mockResolvedValue(expected);
    const { composeExportPng } = await import('./exportDrawing');

    await expect(
      composeExportPng(
        {
          source: {
            width: 400,
            height: 300,
            tiles: [{ bitmap: Promise.resolve(bitmap), x: 100, y: 75 }],
          },
          sourceScale: 2,
        },
        2,
        null,
        { includePaperTexture: false }
      )
    ).resolves.toBe(expected);

    expect(pngMock.encodeTiledCanvasPng).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceWidth: 400,
        sourceHeight: 300,
        sourceScale: 2,
        exportScale: 2,
        tiles: [{ bitmap, x: 100, y: 75 }],
        texture: null,
        overlay: null,
      }),
      undefined
    );
  });

  it('forwards a low-resolution preview request to the tiled worker encoder', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const onReady = vi.fn();
    pngMock.encodeTiledCanvasPng.mockResolvedValue(new Blob(['tiles'], { type: 'image/png' }));
    const { composeExportPng } = await import('./exportDrawing');

    await composeExportPng(
      {
        source: {
          width: 400,
          height: 300,
          tiles: [{ bitmap: Promise.resolve(bitmap), x: 0, y: 0 }],
        },
        sourceScale: 2,
      },
      2,
      null,
      { includePaperTexture: false, preview: { width: 640, onReady } }
    );

    expect(pngMock.encodeTiledCanvasPng).toHaveBeenCalledWith(
      expect.objectContaining({ previewWidth: 640 }),
      onReady
    );
  });

  it('closes fulfilled bitmaps when another tiled bitmap rejects', async () => {
    const fulfilled = { close: vi.fn() } as unknown as ImageBitmap;
    const failure = new Error('bitmap failed');
    const { composeExportPng } = await import('./exportDrawing');

    await expect(
      composeExportPng(
        {
          source: {
            width: 400,
            height: 300,
            tiles: [
              { bitmap: Promise.resolve(fulfilled), x: 0, y: 0 },
              { bitmap: Promise.reject(failure), x: 200, y: 0 },
            ],
          },
          sourceScale: 2,
        },
        2,
        null,
        { includePaperTexture: false }
      )
    ).rejects.toBe(failure);

    expect(fulfilled.close).toHaveBeenCalledOnce();
    expect(pngMock.encodeTiledCanvasPng).not.toHaveBeenCalled();
  });

  it('loads the canonical overlay on demand for a responsive tiled export', async () => {
    const tileBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const overlayBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const createBitmap = vi.fn(async () => overlayBitmap);
    vi.stubGlobal('createImageBitmap', createBitmap);
    pngMock.encodeTiledCanvasPng.mockResolvedValue(new Blob(['tiles'], { type: 'image/png' }));
    const { composeExportPng } = await import('./exportDrawing');

    const exported = composeExportPng(
      {
        source: {
          width: 400,
          height: 300,
          tiles: [{ bitmap: Promise.resolve(tileBitmap), x: 0, y: 0 }],
        },
        sourceScale: 2,
      },
      2,
      createOverlaySource(null),
      { includePaperTexture: false }
    );

    await vi.waitFor(() => expect(requested).toHaveLength(1));
    expect(requested[0].src).toBe(`${location.origin}/coloring/farm/cat-tall.overlay.webp`);
    requested[0].onload!();
    await exported;

    expect(createBitmap).toHaveBeenCalledWith(requested[0]);
    expect(pngMock.encodeTiledCanvasPng).toHaveBeenCalledWith(
      expect.objectContaining({ overlay: overlayBitmap }),
      undefined
    );
  });

  it('rejects a failed canonical overlay load and closes settled tiled bitmaps', async () => {
    const tileBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const { composeExportPng } = await import('./exportDrawing');

    const exported = composeExportPng(
      {
        source: {
          width: 400,
          height: 300,
          tiles: [{ bitmap: Promise.resolve(tileBitmap), x: 0, y: 0 }],
        },
        sourceScale: 2,
      },
      2,
      createOverlaySource(null),
      { includePaperTexture: false }
    );
    await vi.waitFor(() => expect(requested).toHaveLength(1));
    requested[0].onerror!();

    await expect(exported).rejects.toThrow('Failed to load canonical coloring overlay');
    expect(tileBitmap.close).toHaveBeenCalledOnce();
    expect(pngMock.encodeTiledCanvasPng).not.toHaveBeenCalled();
  });

  it('returns null when the output canvas cannot allocate a context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const { composeExportPng } = await import('./exportDrawing');

    await expect(composeExportPng(createSnapshot(), 1)).resolves.toBeNull();

    expect(toBlob).not.toHaveBeenCalled();
  });

  it('delivers a bounded live-tile preview for a compatibility export', async () => {
    setupExportContexts(null);
    const tileBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const previewBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const onReady = vi.fn();
    const previewContext = {
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillStyle: '',
      setTransform: vi.fn(),
      resetTransform: vi.fn(),
      fillRect: vi.fn(),
      createPattern: vi.fn(() => null),
      drawImage: vi.fn(),
    } as unknown as OffscreenCanvasRenderingContext2D;
    const previewCanvases: Array<{ width: number; height: number }> = [];
    class PreviewCanvas {
      constructor(
        public width: number,
        public height: number
      ) {
        previewCanvases.push(this);
      }

      getContext() {
        return previewContext;
      }

      transferToImageBitmap() {
        return previewBitmap;
      }
    }
    vi.stubGlobal('OffscreenCanvas', PreviewCanvas);
    const { composeExportPng } = await import('./exportDrawing');

    await composeExportPng(createSnapshot(), 2, null, {
      includePaperTexture: false,
      preview: {
        width: 100,
        onReady,
        source: {
          source: {
            width: 200,
            height: 100,
            tiles: [{ bitmap: Promise.resolve(tileBitmap), x: 0, y: 0 }],
          },
          sourceScale: 1,
        },
      },
    });

    expect(previewCanvases).toEqual([{ width: 100, height: 50 }]);
    expect(previewContext.imageSmoothingEnabled).toBe(true);
    expect(previewContext.imageSmoothingQuality).toBe('high');
    expect(previewContext.drawImage).toHaveBeenCalledWith(tileBitmap, 0, 0);
    expect(onReady).toHaveBeenCalledWith(previewBitmap);
    expect(tileBitmap.close).toHaveBeenCalledOnce();
    expect(previewBitmap.close).not.toHaveBeenCalled();
  });

  it('continues the compatibility export when a preview tile stalls', async () => {
    vi.useFakeTimers();
    setupExportContexts(null);
    const settledBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const lateBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    let resolveLate!: (bitmap: ImageBitmap) => void;
    const lateTile = new Promise<ImageBitmap>((resolve) => {
      resolveLate = resolve;
    });
    const onReady = vi.fn();
    const { composeExportPng } = await import('./exportDrawing');

    const exported = composeExportPng(createSnapshot(), 2, null, {
      includePaperTexture: false,
      preview: {
        width: 100,
        onReady,
        source: {
          source: {
            width: 200,
            height: 100,
            tiles: [
              { bitmap: Promise.resolve(settledBitmap), x: 0, y: 0 },
              { bitmap: lateTile, x: 100, y: 0 },
            ],
          },
          sourceScale: 1,
        },
      },
    });

    await vi.runAllTimersAsync();
    await expect(exported).resolves.toBeInstanceOf(Blob);
    expect(onReady).not.toHaveBeenCalled();
    expect(settledBitmap.close).toHaveBeenCalledOnce();

    resolveLate(lateBitmap);
    await vi.waitFor(() => expect(lateBitmap.close).toHaveBeenCalledOnce());
  });

  it('closes preview tiles when bounded canvas allocation throws', async () => {
    setupExportContexts(null);
    const tileBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const onReady = vi.fn();
    class FailingPreviewCanvas {
      constructor() {
        throw new Error('preview allocation failed');
      }
    }
    vi.stubGlobal('OffscreenCanvas', FailingPreviewCanvas);
    const { composeExportPng } = await import('./exportDrawing');

    await expect(
      composeExportPng(createSnapshot(), 2, null, {
        includePaperTexture: false,
        preview: {
          width: 100,
          onReady,
          source: {
            source: {
              width: 200,
              height: 100,
              tiles: [{ bitmap: Promise.resolve(tileBitmap), x: 0, y: 0 }],
            },
            sourceScale: 1,
          },
        },
      })
    ).resolves.toBeInstanceOf(Blob);

    expect(onReady).not.toHaveBeenCalled();
    expect(tileBitmap.close).toHaveBeenCalledOnce();
  });

  it('draws the transparent light overlay source-over', async () => {
    const contexts = setupExportContexts(null);
    const overlay = createOverlayImage();
    const { composeExportPng } = await import('./exportDrawing');

    await composeExportPng(createSnapshot(), 1, createOverlaySource(overlay), {
      includePaperTexture: false,
    });

    expect(contexts.draws[0]).toMatchObject({
      source: overlay,
      compositeOperation: 'source-over',
    });
    expect(contexts.outputContext.globalCompositeOperation).toBe('source-over');
  });

  it('draws the transparent dark overlay source-over without another canvas', async () => {
    appearanceMock.resolvedTheme.mockReturnValue('dark');
    const contexts = setupExportContexts(null);
    const { composeExportPng } = await import('./exportDrawing');
    const overlay = createOverlayImage();

    await composeExportPng(createSnapshot(), 1, createOverlaySource(overlay), {
      includePaperTexture: false,
    });

    expect(contexts.draws[0]).toMatchObject({
      source: overlay,
      compositeOperation: 'source-over',
    });
    expect(contexts.outputContext.globalCompositeOperation).toBe('source-over');
  });

  it('rejects instead of exporting without an unavailable canonical overlay', async () => {
    const contexts = setupExportContexts(null);
    const previewTile = { close: vi.fn() } as unknown as ImageBitmap;
    const { composeExportPng } = await import('./exportDrawing');

    const exported = composeExportPng(createSnapshot(), 1, createOverlaySource(null), {
      includePaperTexture: false,
      preview: {
        width: 100,
        onReady: vi.fn(),
        source: {
          source: {
            width: 200,
            height: 100,
            tiles: [{ bitmap: Promise.resolve(previewTile), x: 0, y: 0 }],
          },
          sourceScale: 1,
        },
      },
    });
    requested[0].onerror!();

    await expect(exported).rejects.toThrow('Failed to load canonical coloring overlay');
    expect(contexts.outputContext.fillRect).not.toHaveBeenCalled();
    expect(previewTile.close).toHaveBeenCalledOnce();
  });
});
