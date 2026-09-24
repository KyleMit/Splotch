import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  async function mountedWorkerBrush(repaint = vi.fn()) {
    const magic = await import('./magicBrush');
    magic.initMagicBrush({
      paperSize: () => ({ width: 400, height: 300 }),
      sheetBounds: () => ({ x: 0, y: 0, width: 400, height: 300 }),
      hasRetainedOps: () => false,
      magicActive: () => false,
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
