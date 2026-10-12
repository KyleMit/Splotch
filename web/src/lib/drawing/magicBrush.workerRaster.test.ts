import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./perf', () => ({ PERF_MARKS: true }));

describe('magic sheet worker raster', () => {
  const REAL_GET_CONTEXT = HTMLCanvasElement.prototype.getContext;
  const requestedImages: WorkerImage[] = [];
  const workers: WorkerStub[] = [];
  let workerConstructError: Error | null = null;
  let workerPostError: Error | null = null;
  let workerListenerError: Error | null = null;

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
      if (workerListenerError) throw workerListenerError;
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
    workerListenerError = null;
    vi.stubGlobal('Image', WorkerImage);
    vi.stubGlobal('Worker', WorkerStub);
    vi.stubGlobal('OffscreenCanvas', WorkerOffscreenCanvas);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    HTMLCanvasElement.prototype.getContext = REAL_GET_CONTEXT;
  });

  async function workCounts() {
    const { magicWorkCounters } = await import('./magicWorkDebug');
    if (!magicWorkCounters) throw new Error('The counter fixture requires PERF_MARKS');
    return magicWorkCounters.snapshot();
  }

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
    expect(await workCounts()).toMatchObject({
      magicWorkerRequests: 1,
      magicWorkerConstructed: 1,
      magicInitialPosts: 1,
      magicResolvedRequests: 1,
      magicWorkerPublications: 1,
      magicMainAttempts: 0,
    });
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

    magic.ensureMagicSheet();
    expect(await workCounts()).toMatchObject({
      magicPoolBuilds: 1,
      magicGradientSelections: 1,
      magicWorkerRequests: 1,
      magicEnsureOutcomes: { prepare: 1, ready: 1 },
    });
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
    expect(await workCounts()).toMatchObject({
      magicResolvedRequests: 1,
      magicSupersededDisposals: 1,
      magicOrphanedReplyDisposals: 0,
    });
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
    expect(await workCounts()).toMatchObject({
      magicResolvedRequests: 1,
      magicSupersededDisposals: 1,
      magicOrphanedReplyDisposals: 0,
    });
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
    expect(await workCounts()).toMatchObject({
      magicWorkerRetirements: 1,
      magicRejectedRequests: 1,
      magicMainPaints: 1,
      magicWorkerFailures: { 'error-event': 1 },
      magicMainCauses: { 'worker-failed': 1, unsupported: 0 },
    });
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
    expect(await workCounts()).toMatchObject({
      magicWorkerFailures: { messageerror: 1 },
      magicRejectedRequests: 1,
      magicWorkerRetirements: 1,
    });

    expect(workers[0].terminate).toHaveBeenCalledOnce();
  });

  it('falls back for a plain error reply and keeps the worker for the next raster', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/missing.light.webp');
    requestedImages[0].onload!();

    workers[0].respond({
      id: workers[0].posted[0].id,
      error: 'Error: Magic sheet worker could not load /coloring/missing.light.webp',
    });
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());

    expect(workers[0].terminate).not.toHaveBeenCalled();
    magic.setColorSheet('/coloring/page.light.webp');
    requestedImages[1].onload!();
    expect(workers).toHaveLength(1);
    expect(workers[0].posted).toHaveLength(2);
    expect(await workCounts()).toMatchObject({
      magicWorkerFailures: { reply: 1 },
      magicRejectedRequests: 1,
      magicWorkerRetirements: 0,
      magicWorkerConstructed: 1,
      magicInitialPosts: 2,
    });
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
    expect(await workCounts()).toMatchObject({
      magicWorkerFailures: { 'coded-reply': 1 },
      magicRejectedRequests: 2,
      magicWorkerRetirements: 1,
      magicResolvedRequests: 0,
      magicSupersededDisposals: 0,
      magicOrphanedReplyDisposals: 1,
    });

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
    expect(await workCounts()).toMatchObject({
      magicWorkerFailures: { 'initial-post': 1 },
      magicInitialPosts: 1,
      magicRejectedRequests: 1,
      magicWorkerRetirements: 1,
    });
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
    expect(await workCounts()).toMatchObject({
      magicWorkerConstructionAttempts: 1,
      magicWorkerConstructed: 0,
      magicInitialPosts: 0,
      magicRejectedRequests: 1,
      magicWorkerFailures: { constructor: 1 },
      magicMainCauses: { 'worker-failed': 1, unsupported: 0 },
    });
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
    expect(await workCounts()).toMatchObject({
      magicWorkerFailures: { timeout: 1 },
      magicRejectedRequests: 1,
      magicWorkerRetirements: 1,
    });
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
    const lateBitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[0].respond({ id: secondRequestId, bitmap: lateBitmap });
    expect(lateBitmap.close).toHaveBeenCalledOnce();
    expect(await workCounts()).toMatchObject({
      magicOrphanedReplyDisposals: 1,
      magicSupersededDisposals: 0,
      magicResolvedRequests: 0,
      magicWorkerRequests: 2,
      magicWorkerConstructed: 2,
      magicInitialPosts: 2,
      magicRetryPosts: 1,
      magicRejectedRequests: 1,
      magicWorkerFailures: { timeout: 1 },
    });

    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    workers[1].respond({ id: secondRequestId, bitmap });
    await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(bitmap));
  });
  it('does not prepare a source, acquire a worker or mutate counters when read', async () => {
    const { magic } = await mountedWorkerBrush();
    const client = await import('./magicSheetRasterClient');
    const before = await workCounts();
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Reader selected a gradient');
    });
    const first = magic.getMagicBrushState();
    Reflect.set(first!, 'magicSheetReady', true);
    Reflect.set(first!.magicPaperSize!, 'width', 999);
    expect(magic.getMagicBrushState()).toMatchObject({
      magicPoolExists: false,
      magicSheetReady: false,
      magicPaperSize: { width: 400 },
    });
    expect(client.getMagicWorkerState()).toMatchObject({
      magicWorkerExists: false,
      magicWorkerPending: 0,
      magicWorkerNextRequestId: 0,
    });
    expect(await workCounts()).toEqual(before);
    expect(workers).toHaveLength(0);
    expect(requestedImages).toHaveLength(0);
    expect(random).not.toHaveBeenCalled();
  });

  it('reads a pending request without posting or settling it again', async () => {
    const { magic } = await mountedWorkerBrush();
    magic.ensureMagicSheet();
    const client = await import('./magicSheetRasterClient');
    const before = await workCounts();
    magic.getMagicBrushState();
    expect(client.getMagicWorkerState()).toMatchObject({
      magicWorkerExists: true,
      magicWorkerPending: 1,
      magicWorkerNextRequestId: 1,
    });
    expect(await workCounts()).toEqual(before);
    expect(workers[0].posted).toHaveLength(1);
    expect(magic.captureMagicSheet()).toBeNull();
    magic.ensureMagicSheet();
    expect((await workCounts()).magicEnsureOutcomes.pending).toBe(1);
  });

  it('records a stale decoded fill ensure as intentional main rasterization', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    requestedImages[0].onload!();
    workers[0].respond({ id: workers[0].posted[0].id, bitmap: { close() {} } });
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());
    magic.initMagicBrush({
      paperSize: () => ({ width: 500, height: 350 }),
      sheetBounds: () => ({ x: -10, y: -5, width: 520, height: 360 }),
      hasRetainedOps: () => true,
      magicActive: () => true,
      repaint: vi.fn(),
    });
    magic.resizeMagicSheet(false);
    magic.ensureMagicSheet();
    expect(magic.captureMagicSheet()).toMatchObject({
      sourceUrl: '/coloring/page.light.webp',
      originX: -10,
      originY: -5,
    });
    expect(magic.captureMagicSheet()?.canvas).toBeInstanceOf(HTMLCanvasElement);
    expect(workers[0].posted).toHaveLength(1);
    expect(await workCounts()).toMatchObject({
      magicMainAttempts: 1,
      magicMainPaints: 1,
      magicMainStaleAttempts: 1,
      magicMainCauses: { 'fill-direct': 1, 'worker-failed': 0 },
      magicMainOrigins: { ensure: 1 },
      magicWorkerFailures: { timeout: 0 },
    });
  });

  it('records eager resize of a decoded fill separately from ensure', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    requestedImages[0].onload!();
    workers[0].respond({ id: workers[0].posted[0].id, bitmap: { close() {} } });
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());
    magic.resizeMagicSheet(true);
    expect(await workCounts()).toMatchObject({
      magicMainPaints: 1,
      magicMainCauses: { 'fill-direct': 1, 'worker-failed': 0 },
      magicMainOrigins: { 'eager-resize': 1 },
    });
    expect(workers[0].posted).toHaveLength(1);
  });

  it('does not label missing supported gradient bounds as paint or worker failure', async () => {
    const { magic } = await mountedWorkerBrush();
    magic.initMagicBrush({
      paperSize: () => null,
      sheetBounds: () => null,
      hasRetainedOps: () => false,
      magicActive: () => true,
      repaint: vi.fn(),
    });
    magic.ensureMagicSheet();
    expect(await workCounts()).toMatchObject({
      magicMainAttempts: 1,
      magicMainPaints: 0,
      magicMainCauses: { 'no-bounds': 1, 'worker-failed': 0 },
      magicMainOutcomes: { 'no-bounds': 1 },
      magicWorkerConstructionAttempts: 0,
      magicInitialPosts: 0,
    });
    expect(workers).toHaveLength(0);
    expect(magic.captureMagicSheet()).toBeNull();
  });

  it('distinguishes an unavailable source and an absent raster context from painted work', async () => {
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/pending.light.webp');
    magic.ensureMagicSheet();
    expect(await workCounts()).toMatchObject({
      magicMainPaints: 0,
      magicMainCauses: { 'source-unavailable': 1 },
      magicMainOutcomes: { 'no-source': 1 },
    });
    vi.stubGlobal('OffscreenCanvas', undefined);
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () => null;
    requestedImages[0].onload!();
    expect(await workCounts()).toMatchObject({
      magicMainAttempts: 2,
      magicMainPaints: 0,
      magicMainCauses: { unsupported: 1 },
      magicMainOutcomes: { 'no-context': 1 },
    });
    expect(workers).toHaveLength(0);
  });

  it('does not count a returned constructor as an installed worker when listeners throw', async () => {
    (HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = () =>
      ({ clearRect() {}, drawImage() {} }) as unknown as CanvasRenderingContext2D;
    const { magic } = await mountedWorkerBrush();
    magic.setColorSheet('/coloring/page.light.webp');
    workerListenerError = new Error('Listener setup failed');
    requestedImages[0].onload!();
    await vi.waitFor(() => expect(magic.captureMagicSheet()).not.toBeNull());
    expect(workers).toHaveLength(1);
    expect(await workCounts()).toMatchObject({
      magicWorkerConstructionAttempts: 1,
      magicWorkerConstructed: 0,
      magicInitialPosts: 0,
      magicWorkerFailures: { listeners: 1, constructor: 0 },
    });
  });
});
