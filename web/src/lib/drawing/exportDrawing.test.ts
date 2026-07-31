import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const appearanceMock = vi.hoisted(() => ({
  resolvedTheme: vi.fn<() => 'light' | 'dark'>(),
}));

vi.mock('../state/appearance.svelte', () => appearanceMock);

const requested: ControllableImage[] = [];

class ControllableImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';

  constructor() {
    requested.push(this);
  }
}

beforeEach(() => {
  vi.resetModules();
  requested.length = 0;
  appearanceMock.resolvedTheme.mockReturnValue('light');
  vi.stubGlobal('Image', ControllableImage);
});

afterEach(() => {
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
  it('returns null when the output canvas cannot allocate a context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    const { composeExportPng } = await import('./exportDrawing');

    await expect(composeExportPng(createSnapshot(), 1)).resolves.toBeNull();

    expect(toBlob).not.toHaveBeenCalled();
  });

  it('multiplies the original overlay in light mode', async () => {
    const contexts = setupExportContexts(null);
    const overlay = createOverlayImage();
    const { composeExportPng } = await import('./exportDrawing');

    await composeExportPng(createSnapshot(), 1, overlay, { includePaperTexture: false });

    expect(contexts.draws[0]).toMatchObject({
      source: overlay,
      compositeOperation: 'multiply',
    });
    expect(contexts.outputContext.globalCompositeOperation).toBe('source-over');
  });

  it('screens the inverted overlay in dark mode', async () => {
    appearanceMock.resolvedTheme.mockReturnValue('dark');
    const inversionContext = asCanvasContext({
      globalCompositeOperation: 'source-over',
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
      fillStyle: '',
      scale: vi.fn(),
      setTransform: vi.fn(),
      fillRect: vi.fn(),
      createPattern: vi.fn(() => null),
      drawImage: vi.fn(),
    });
    const contexts = setupExportContexts(inversionContext);
    const { composeExportPng } = await import('./exportDrawing');
    const overlay = createOverlayImage();

    await composeExportPng(createSnapshot(), 1, overlay, { includePaperTexture: false });

    expect(contexts.draws[0].source).toBeInstanceOf(HTMLCanvasElement);
    expect(contexts.draws[0].source).not.toBe(overlay);
    expect(contexts.draws[0].compositeOperation).toBe('screen');
    expect(contexts.outputContext.globalCompositeOperation).toBe('source-over');
  });

  it('skips the overlay when inversion cannot allocate a context', async () => {
    appearanceMock.resolvedTheme.mockReturnValue('dark');
    const contexts = setupExportContexts(null);
    contexts.outputContext.globalCompositeOperation = 'screen';
    const { composeExportPng } = await import('./exportDrawing');

    await composeExportPng(createSnapshot(), 1, createOverlayImage(), {
      includePaperTexture: false,
    });

    expect(contexts.draws).toHaveLength(0);
    expect(contexts.outputContext.globalCompositeOperation).toBe('source-over');
  });
});
