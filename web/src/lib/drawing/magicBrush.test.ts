import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { edgeMargins } from './magicBrush';
import { createRainbowGradient, MAGIC_GRADIENT_COUNT } from './magicSheetGradient';

// A deterministic pseudo-random sequence so gradient generation is reproducible
// in the test (the module defaults to Math.random in the app).
function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('rainbow gradient generation', () => {
  it('produces a distinct rainbow for each of MAGIC_GRADIENT_COUNT seeds', () => {
    const gradients = Array.from({ length: MAGIC_GRADIENT_COUNT }, (_, i) =>
      createRainbowGradient(seededRand(i + 1))
    );
    const serialized = new Set(gradients.map((g) => JSON.stringify(g)));
    expect(serialized.size).toBe(MAGIC_GRADIENT_COUNT);
  });

  it('produces a rainbow of ascending hsl stops from 0 to 1', () => {
    const g = createRainbowGradient(seededRand(1));
    expect(g.stops.length).toBeGreaterThanOrEqual(2);
    expect(g.stops[0].offset).toBe(0);
    expect(g.stops[g.stops.length - 1].offset).toBe(1);
    for (let i = 1; i < g.stops.length; i++) {
      expect(g.stops[i].offset).toBeGreaterThan(g.stops[i - 1].offset);
    }
    for (const s of g.stops) {
      const m = /^hsl\((\d+(?:\.\d+)?), \d/.exec(s.color);
      expect(m).not.toBeNull();
      const hue = Number(m![1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('varies between seeds so the pool is a set of distinct rainbows', () => {
    const a = createRainbowGradient(seededRand(1));
    const b = createRainbowGradient(seededRand(99));
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('magic sheet fill-load failure', () => {
  // happy-dom neither loads images nor has a real 2D context, so the fill decode is
  // driven by hand through a stubbed Image and the sheet rasterizes into a fake
  // context. The module is re-imported after vi.resetModules() so each case gets
  // its own fill/gradient/sheet state instead of inheriting the previous one's.
  const REAL_GET_CONTEXT = HTMLCanvasElement.prototype.getContext;
  const PAGE_URL = '/coloring/first.light.webp';
  const OTHER_PAGE_URL = '/coloring/second.light.webp';

  const requested: FakeImage[] = [];

  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    src = '';
    constructor() {
      requested.push(this);
    }
  }

  beforeEach(() => {
    vi.resetModules();
    requested.length = 0;
    vi.stubGlobal('Image', FakeImage);
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({
        clearRect() {},
        drawImage() {},
        fillRect() {},
        createLinearGradient: () => ({ addColorStop() {} }),
        fillStyle: '',
      }) as unknown as CanvasRenderingContext2D;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    HTMLCanvasElement.prototype.getContext = REAL_GET_CONTEXT;
  });

  const PAPER = { width: 400, height: 300 };

  async function mountedMagicBrush() {
    const magic = await import('./magicBrush');
    magic.initMagicBrush({
      paperSize: () => PAPER,
      sheetBounds: () => ({ x: 0, y: 0, ...PAPER }),
      hasRetainedOps: () => false,
      magicActive: () => false,
      repaint: () => {},
    });
    return magic;
  }

  function lastRequest(): FakeImage {
    return requested[requested.length - 1];
  }

  it('recovers from a failed fill with no further user action', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    expect(magic.captureMagicSheet()).toBeNull();

    lastRequest().onerror!();

    // A page session holds no gradient, so the error handler has to take one over
    // itself without the child toggling brushes or clearing the canvas.
    expect(magic.captureMagicSheet()).not.toBeNull();
  });

  it('recovers with a rainbow that was already held before the page', async () => {
    const magic = await mountedMagicBrush();

    magic.ensureMagicSheet();
    magic.setColorSheet(PAGE_URL);

    lastRequest().onerror!();

    // The held rainbow is kept, but the sheet still carries the (never-drawn) fill
    // source, so recovery has to re-rasterize rather than assume a gradient handoff.
    expect(magic.captureMagicSheet()).not.toBeNull();
  });

  it('keeps a captured sheet immutable when the active source changes', async () => {
    const magic = await mountedMagicBrush();

    magic.ensureMagicSheet();
    const first = magic.captureMagicSheet();
    magic.clearMagicGradient();
    magic.ensureMagicSheet();
    const second = magic.captureMagicSheet();

    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(second!.canvas).not.toBe(first!.canvas);

    const sources: CanvasImageSource[] = [];
    const target = {
      createPattern: (source: CanvasImageSource) => {
        sources.push(source);
        return { setTransform() {} };
      },
    } as unknown as CanvasRenderingContext2D;
    expect(magic.sheetPatternFor(target, first)).not.toBeNull();
    expect(sources).toEqual([first!.canvas]);
  });

  it('defers a resized inactive sheet until the brush is selected again', async () => {
    const magic = await mountedMagicBrush();

    magic.ensureMagicSheet();
    const beforeResize = magic.captureMagicSheet();
    magic.resizeMagicSheet(false);

    expect(magic.captureMagicSheet()).toBe(beforeResize);

    magic.ensureMagicSheet();
    expect(magic.captureMagicSheet()).not.toBe(beforeResize);
  });

  it('re-attempts the load when the same page is applied again', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    expect(requested).toHaveLength(1);

    lastRequest().onerror!();

    magic.setColorSheet(PAGE_URL);
    expect(requested).toHaveLength(2);
    expect(lastRequest().src).toBe(PAGE_URL);
  });

  it('defers an incoming fill without exposing the outgoing page to new strokes', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    lastRequest().naturalWidth = 200;
    lastRequest().naturalHeight = 100;
    lastRequest().onload!();
    const outgoing = magic.captureMagicSheet();

    magic.deferColorSheet(OTHER_PAGE_URL);
    magic.ensureMagicSheet();

    expect(outgoing).not.toBeNull();
    expect(magic.captureMagicSheet()).toBeNull();
    expect(requested).toHaveLength(1);

    magic.setColorSheet(OTHER_PAGE_URL);
    expect(requested).toHaveLength(2);
    expect(lastRequest().src).toBe(OTHER_PAGE_URL);
  });

  it('starts a deferred fill when the overlay decode never settles', async () => {
    vi.useFakeTimers();
    const magic = await mountedMagicBrush();

    magic.deferColorSheet(PAGE_URL);
    expect(requested).toHaveLength(0);

    await vi.runOnlyPendingTimersAsync();

    expect(requested).toHaveLength(1);
    expect(lastRequest().src).toBe(PAGE_URL);
  });

  it('ignores a superseded error so it cannot clobber a newer page', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    const superseded = lastRequest();

    magic.setColorSheet(OTHER_PAGE_URL);
    const current = lastRequest();
    current.naturalWidth = 200;
    current.naturalHeight = 100;
    current.onload!();
    expect(magic.captureMagicSheet()).not.toBeNull();

    superseded.onerror!();

    expect(magic.captureMagicSheet()).not.toBeNull();
    // The newer page is still attached, so re-applying it stays a no-op.
    magic.setColorSheet(OTHER_PAGE_URL);
    expect(requested).toHaveLength(2);
  });

  // A theme switch cycles the sheet through the night fill and back
  // (DrawingCanvas's resolvedTheme effect), so the current page's URL can equal an
  // abandoned load's — only load identity separates them.
  it('ignores a superseded error from an earlier load of the page now current again', async () => {
    const magic = await mountedMagicBrush();

    magic.setColorSheet(PAGE_URL);
    const abandoned = lastRequest();
    magic.setColorSheet(OTHER_PAGE_URL);
    magic.setColorSheet(PAGE_URL);
    const current = lastRequest();

    abandoned.onerror!();

    current.naturalWidth = 200;
    current.naturalHeight = 100;
    current.onload!();
    expect(magic.captureMagicSheet()).not.toBeNull();

    // The page is still attached — had the stale error detached it, this would
    // start a fourth load instead of no-oping (and the captured sheet above would
    // have come from a fallback rainbow rather than the page's own fill).
    magic.setColorSheet(PAGE_URL);
    expect(requested).toHaveLength(3);
  });
});

describe('magic sheet worker raster', () => {
  const REAL_GET_CONTEXT = HTMLCanvasElement.prototype.getContext;
  const requestedImages: WorkerImage[] = [];
  const workers: WorkerStub[] = [];
  let workerConstructError: Error | null = null;
  let workerPostError: Error | null = null;

  class WorkerImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 200;
    naturalHeight = 100;
    src = '';

    constructor() {
      requestedImages.push(this);
    }
  }

  class WorkerStub {
    messageListeners: Array<(event: MessageEvent) => void> = [];
    messageErrorListeners: Array<(event: MessageEvent) => void> = [];
    errorListeners: Array<(event: ErrorEvent) => void> = [];
    posted: Array<{ id: number; imageUrl?: string; gradient?: unknown }> = [];
    terminate = vi.fn();
    postError = workerPostError;

    constructor() {
      if (workerConstructError) throw workerConstructError;
      workers.push(this);
    }

    addEventListener(type: string, listener: EventListener) {
      if (type === 'message') this.messageListeners.push(listener as (event: MessageEvent) => void);
      if (type === 'messageerror') {
        this.messageErrorListeners.push(listener as (event: MessageEvent) => void);
      }
      if (type === 'error') this.errorListeners.push(listener as (event: ErrorEvent) => void);
    }

    postMessage(message: { id: number; imageUrl?: string; gradient?: unknown }) {
      if (this.postError) throw this.postError;
      this.posted.push(message);
    }

    respond(data: unknown) {
      for (const listener of this.messageListeners) {
        listener(new MessageEvent('message', { data }));
      }
    }

    fail(message: string) {
      for (const listener of this.errorListeners) {
        listener(new ErrorEvent('error', { message }));
      }
    }

    failDecode() {
      for (const listener of this.messageErrorListeners) {
        listener(new MessageEvent('messageerror'));
      }
    }
  }

  class WorkerOffscreenCanvas {
    transferToImageBitmap() {}
  }

  beforeEach(() => {
    vi.resetModules();
    requestedImages.length = 0;
    workers.length = 0;
    workerConstructError = null;
    workerPostError = null;
    vi.stubGlobal('Image', WorkerImage);
    vi.stubGlobal('Worker', WorkerStub);
    vi.stubGlobal('OffscreenCanvas', WorkerOffscreenCanvas);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    HTMLCanvasElement.prototype.getContext = REAL_GET_CONTEXT;
  });

  async function mountedWorkerBrush(
    repaint = vi.fn(),
    hasRetainedOps = () => false,
    magicActive = () => false
  ) {
    const magic = await import('./magicBrush');
    magic.initMagicBrush({
      paperSize: () => ({ width: 400, height: 300 }),
      sheetBounds: () => ({ x: 0, y: 0, width: 400, height: 300 }),
      hasRetainedOps,
      magicActive,
      repaint,
    });
    return { magic, repaint };
  }

  it('publishes the transferred bitmap only after the worker finishes', async () => {
    const { magic, repaint } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    requestedImages[0].onload!();

    expect(magic.captureMagicSheet()).toBeNull();
    expect(workers[0].posted[0]).toMatchObject({ imageUrl: '/coloring/page.light.webp' });

    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[0].id, bitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(bitmap));

    expect(bitmap.close).not.toHaveBeenCalled();
    expect(repaint).toHaveBeenCalledOnce();
  });

  it('rasterizes a blank-page rainbow in the worker', async () => {
    const { magic, repaint } = await mountedWorkerBrush();

    magic.ensureMagicSheet();

    expect(magic.captureMagicSheet()).toBeNull();
    expect(workers[0].posted[0]).toMatchObject({
      gradient: { angle: expect.any(Number), stops: expect.any(Array) },
    });
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[0].id, bitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(bitmap));

    expect(repaint).toHaveBeenCalledOnce();
  });

  it('releases an unretained worker sheet when its source changes', async () => {
    const { magic } = await mountedWorkerBrush();
    magic.ensureMagicSheet();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[0].id, bitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(bitmap));

    magic.setColorSheet('/coloring/page.light.webp');

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(magic.captureMagicSheet()).toBeNull();
  });

  it('preserves a worker sheet referenced by retained Magic ops', async () => {
    const { magic } = await mountedWorkerBrush(vi.fn(), () => true);
    magic.ensureMagicSheet();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[0].id, bitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(bitmap));

    magic.setColorSheet('/coloring/page.light.webp');

    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it('defers the fallback rainbow when a page clears under an inactive brush', async () => {
    const { magic } = await mountedWorkerBrush();
    magic.ensureMagicSheet();
    const gradientBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[0].id, bitmap: gradientBitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(gradientBitmap));
    magic.setColorSheet('/coloring/page.light.webp');

    magic.setColorSheet(null);

    expect(workers[0].posted).toHaveLength(1);
    expect(magic.captureMagicSheet()).toBeNull();
  });

  it('rebuilds the fallback rainbow when a page clears under the Magic brush', async () => {
    const { magic } = await mountedWorkerBrush(
      vi.fn(),
      () => false,
      () => true
    );
    magic.ensureMagicSheet();
    const gradientBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[0].id, bitmap: gradientBitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(gradientBitmap));
    magic.setColorSheet('/coloring/page.light.webp');

    magic.setColorSheet(null);

    expect(workers[0].posted).toHaveLength(2);
  });

  it('closes a superseded rainbow bitmap', async () => {
    const { magic } = await mountedWorkerBrush();
    magic.ensureMagicSheet();
    const firstRequest = workers[0].posted[0];
    magic.clearMagicGradient();
    magic.ensureMagicSheet();

    const staleBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: firstRequest.id, bitmap: staleBitmap });
    await vi.waitFor(() => expect(staleBitmap.close).toHaveBeenCalledOnce());
    expect(magic.captureMagicSheet()).toBeNull();

    const currentBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[1].id, bitmap: currentBitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(currentBitmap));
  });

  it('closes a superseded bitmap without replacing the current sheet', async () => {
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/first.light.webp');
    requestedImages[0].onload!();
    magic.setColorSheet('/coloring/second.light.webp');
    requestedImages[1].onload!();

    const firstBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[0].id, bitmap: firstBitmap });
    await vi.waitFor(() => expect(firstBitmap.close).toHaveBeenCalledOnce());
    expect(magic.captureMagicSheet()).toBeNull();

    const secondBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: workers[0].posted[1].id, bitmap: secondBitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(secondBitmap));
  });

  it('falls back to main-thread rasterization when the worker fails', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic, repaint } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    requestedImages[0].onload!();

    workers[0].fail('worker unavailable');
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());

    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(magic.captureMagicSheet()?.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(repaint).toHaveBeenCalledOnce();
  });

  it('falls back and retires the worker when a response cannot be decoded', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    requestedImages[0].onload!();

    workers[0].failDecode();
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());

    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it('settles pending rasters and replaces the worker after repeated context loss', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/first.light.webp');
    requestedImages[0].onload!();
    magic.setColorSheet('/coloring/second.light.webp');
    requestedImages[1].onload!();
    const failedWorker = workers[0];
    const firstRequestId = failedWorker.posted[0].id;
    const secondRequestId = failedWorker.posted[1].id;

    failedWorker.respond({
      id: firstRequestId,
      error: 'CanvasContextRecoveryError: Canvas 2D context recovery failed after one retry',
      code: 'canvas-context-recovery-failed',
    });
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());

    expect(failedWorker.terminate).toHaveBeenCalledOnce();
    const lateBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    failedWorker.respond({ id: secondRequestId, bitmap: lateBitmap });
    expect(lateBitmap.close).toHaveBeenCalledOnce();

    magic.setColorSheet('/coloring/third.light.webp');
    requestedImages[2].onload!();
    expect(workers).toHaveLength(2);
  });

  it('falls back when posting the raster request throws', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    workerPostError = new Error('post failed');

    requestedImages[0].onload!();
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());
  });

  it('falls back when constructing the raster worker throws', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    workerConstructError = new Error('construction failed');

    requestedImages[0].onload!();
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());

    expect(workers).toHaveLength(0);
    expect(magic.captureMagicSheet()?.canvas).toBeInstanceOf(HTMLCanvasElement);
  });

  it('falls back when the worker does not answer before the deadline', async () => {
    vi.useFakeTimers();
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    requestedImages[0].onload!();

    await vi.advanceTimersByTimeAsync(15_000);

    expect(magic.captureMagicSheet()).not.toBeNull();
    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it('redispatches a newer raster with its remaining budget when an older request times out', async () => {
    vi.useFakeTimers();
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/first.light.webp');
    requestedImages[0].onload!();
    await vi.advanceTimersByTimeAsync(14_000);

    magic.setColorSheet('/coloring/second.light.webp');
    requestedImages[1].onload!();
    const secondRequestId = workers[0].posted[1].id;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(workers[0].terminate).toHaveBeenCalledOnce();
    expect(workers).toHaveLength(2);
    expect(workers[1].posted).toEqual([
      expect.objectContaining({
        id: secondRequestId,
        imageUrl: '/coloring/second.light.webp',
      }),
    ]);
    expect(magic.captureMagicSheet()).toBeNull();

    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[1].respond({ id: secondRequestId, bitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(bitmap));
  });
});

describe('letterbox edge extension geometry', () => {
  // A tall fill contain-fit into a taller viewport → top + bottom margins only.
  it('fills top and bottom margins for a top/bottom letterbox', () => {
    const fills = edgeMargins(400, 1000, 0, 200, 400, 600); // box fills width, 200px bands
    expect(fills).toHaveLength(2);
    const top = fills.find((f) => f.dy === 0)!;
    const bottom = fills.find((f) => f.dy === 800)!;
    // Each destination spans the full picture width and the whole margin height.
    expect(top).toMatchObject({ dx: 0, dy: 0, dw: 400, dh: 200 });
    expect(bottom).toMatchObject({ dx: 0, dy: 800, dw: 400, dh: 200 });
    // Sources are 1px-thin rows sampled just inside the picture, not on the border.
    expect(top.sh).toBe(1);
    expect(top.sy).toBeGreaterThan(0);
    expect(bottom.sh).toBe(1);
    expect(bottom.sy).toBeLessThan(600);
  });

  // A wide fill contain-fit into a wider viewport → left + right margins only.
  it('fills left and right margins for a left/right letterbox, preserving the edge column', () => {
    const fills = edgeMargins(1000, 400, 200, 0, 600, 400);
    expect(fills).toHaveLength(2);
    const left = fills.find((f) => f.dx === 0)!;
    const right = fills.find((f) => f.dx === 800)!;
    expect(left).toMatchObject({ dx: 0, dy: 0, dw: 200, dh: 400 });
    expect(right).toMatchObject({ dx: 800, dy: 0, dw: 200, dh: 400 });
    // 1px-thin columns spanning the full picture height, so the stretched column
    // keeps its along-edge variation (sky at top, grass at bottom).
    expect(left).toMatchObject({ sw: 1, sh: 400 });
    expect(left.sx).toBeGreaterThan(0);
    expect(right).toMatchObject({ sw: 1, sh: 400 });
    expect(right.sx).toBeLessThan(600);
  });

  // A fill whose aspect matches the sheet exactly fills it — no margins to extend.
  it('returns no fills when the picture already fills the sheet', () => {
    expect(edgeMargins(400, 600, 0, 0, 400, 600)).toEqual([]);
  });

  // Under a rotation lock the sheet is larger than the paper on the other axis too,
  // so a centered picture can be inset on all four sides (with corners).
  it('fills all four sides and corners for a doubly-inset picture', () => {
    const fills = edgeMargins(1000, 1000, 200, 300, 600, 400); // 200px L/R, 300px T/B
    expect(fills).toHaveLength(8);
    const top = fills.find((f) => f.dy === 0 && f.dh === 300)!;
    const bottom = fills.find((f) => f.dy === 700)!;
    expect(top).toMatchObject({ dx: 200, dw: 600, sh: 1 });
    expect(bottom).toMatchObject({ dx: 200, dw: 600, dh: 300, sh: 1 });
    const left = fills.find((f) => f.dx === 0 && f.dy === 300)!;
    const right = fills.find((f) => f.dx === 800 && f.dy === 300)!;
    expect(left).toMatchObject({ sy: 0, sh: 400, dw: 200, dh: 400 });
    expect(right).toMatchObject({ sy: 0, sh: 400, dw: 200, dh: 400 });
    const corners = fills.filter((f) => f.dw === 200 && f.dh === 300);
    expect(corners).toHaveLength(4);
    expect(corners).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dx: 0, dy: 0 }),
        expect.objectContaining({ dx: 800, dy: 0 }),
        expect.objectContaining({ dx: 0, dy: 700 }),
        expect.objectContaining({ dx: 800, dy: 700 }),
      ])
    );
  });
});
