import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface WorkerMessage {
  id: number;
  kind: 'canvas' | 'tiles';
  bitmap?: ImageBitmap;
  tiles?: Array<{ bitmap: ImageBitmap; x: number; y: number }>;
  previewWidth?: number;
}

type WorkerResponse =
  | { id: number; blob: Blob }
  | { id: number; preview: ImageBitmap }
  | { id: number; error: string; code?: 'canvas-context-recovery-failed' };

class ControllableWorker {
  static instances: ControllableWorker[] = [];

  readonly messageListeners: Array<(event: MessageEvent<WorkerResponse>) => void> = [];
  readonly errorListeners: Array<(event: ErrorEvent) => void> = [];
  readonly messageErrorListeners: Array<(event: MessageEvent) => void> = [];
  readonly posted: Array<{ message: WorkerMessage; transfer: Transferable[] }> = [];
  terminated = false;

  constructor() {
    ControllableWorker.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (type === 'message') {
      this.messageListeners.push(listener as (event: MessageEvent<WorkerResponse>) => void);
    } else if (type === 'error') {
      this.errorListeners.push(listener as (event: ErrorEvent) => void);
    } else if (type === 'messageerror') {
      this.messageErrorListeners.push(listener as (event: MessageEvent) => void);
    }
  }

  postMessage(message: WorkerMessage, transfer: Transferable[]) {
    this.posted.push({ message, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  resolve(blob: Blob) {
    const id = this.posted.at(-1)!.message.id;
    for (const listener of this.messageListeners) {
      listener(new MessageEvent('message', { data: { id, blob } }));
    }
  }

  sendPreview(preview: ImageBitmap) {
    const id = this.posted.at(-1)!.message.id;
    for (const listener of this.messageListeners) {
      listener(new MessageEvent('message', { data: { id, preview } }));
    }
  }

  send(data: WorkerResponse) {
    for (const listener of this.messageListeners) {
      listener(new MessageEvent('message', { data }));
    }
  }

  failDecode() {
    for (const listener of this.messageErrorListeners) {
      listener(new MessageEvent('messageerror'));
    }
  }
}

beforeEach(() => {
  vi.resetModules();
  ControllableWorker.instances.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('encodeCanvasPng', () => {
  it('uses the HTML canvas encoder when workers are unavailable', async () => {
    const expected = new Blob(['fallback'], { type: 'image/png' });
    const canvas = document.createElement('canvas');
    const toBlob = vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(expected));
    vi.stubGlobal('Worker', undefined);
    const { encodeCanvasPng } = await import('./pngEncoder');

    await expect(encodeCanvasPng(canvas)).resolves.toBe(expected);

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
  });

  it('uses the OffscreenCanvas encoder when workers are unavailable', async () => {
    const expected = new Blob(['fallback'], { type: 'image/png' });
    const convertToBlob = vi.fn(async () => expected);
    class TestOffscreenCanvas {
      convertToBlob = convertToBlob;
    }
    vi.stubGlobal('Worker', undefined);
    vi.stubGlobal('OffscreenCanvas', TestOffscreenCanvas);
    const canvas = new TestOffscreenCanvas() as unknown as OffscreenCanvas;
    const { encodeCanvasPng } = await import('./pngEncoder');

    await expect(encodeCanvasPng(canvas)).resolves.toBe(expected);

    expect(convertToBlob).toHaveBeenCalledWith({ type: 'image/png' });
  });

  it('transfers a bitmap to a cached worker and returns its lossless PNG', async () => {
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const expected = new Blob(['worker'], { type: 'image/png' });
    const createBitmap = vi.fn(async () => bitmap);
    vi.stubGlobal('Worker', ControllableWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('createImageBitmap', createBitmap);
    const canvas = document.createElement('canvas');
    const toBlob = vi.spyOn(canvas, 'toBlob');
    const { encodeCanvasPng } = await import('./pngEncoder');

    const first = encodeCanvasPng(canvas);
    await vi.waitFor(() => expect(ControllableWorker.instances).toHaveLength(1));
    const worker = ControllableWorker.instances[0];
    expect(worker.posted[0].transfer).toEqual([bitmap]);
    worker.resolve(expected);
    await expect(first).resolves.toBe(expected);

    const second = encodeCanvasPng(canvas);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));
    worker.resolve(expected);
    await expect(second).resolves.toBe(expected);

    expect(ControllableWorker.instances).toHaveLength(1);
    expect(toBlob).not.toHaveBeenCalled();
  });

  it('terminates a silent worker and falls back to the main-thread encoder', async () => {
    vi.useFakeTimers();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    const fallback = new Blob(['fallback'], { type: 'image/png' });
    vi.stubGlobal('Worker', ControllableWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap)
    );
    const canvas = document.createElement('canvas');
    vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(fallback));
    const { encodeCanvasPng } = await import('./pngEncoder');

    const encoded = encodeCanvasPng(canvas);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(15_000);

    await expect(encoded).resolves.toBe(fallback);
    expect(ControllableWorker.instances[0].terminated).toBe(true);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('settles every request and replaces a worker whose response cannot be decoded', async () => {
    const bitmaps = [
      { close: vi.fn() } as unknown as ImageBitmap,
      { close: vi.fn() } as unknown as ImageBitmap,
      { close: vi.fn() } as unknown as ImageBitmap,
    ];
    const fallbacks = [
      new Blob(['first'], { type: 'image/png' }),
      new Blob(['second'], { type: 'image/png' }),
      new Blob(['third'], { type: 'image/png' }),
    ];
    vi.stubGlobal('Worker', ControllableWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmaps.shift()!)
    );
    const canvases = fallbacks.map((fallback) => {
      const canvas = document.createElement('canvas');
      vi.spyOn(canvas, 'toBlob').mockImplementation((callback) => callback(fallback));
      return canvas;
    });
    const { encodeCanvasPng } = await import('./pngEncoder');

    const first = encodeCanvasPng(canvases[0]);
    const second = encodeCanvasPng(canvases[1]);
    await vi.waitFor(() => expect(ControllableWorker.instances[0].posted).toHaveLength(2));
    ControllableWorker.instances[0].failDecode();

    await expect(Promise.all([first, second])).resolves.toEqual(fallbacks.slice(0, 2));
    expect(ControllableWorker.instances[0].terminated).toBe(true);

    const third = encodeCanvasPng(canvases[2]);
    await vi.waitFor(() => expect(ControllableWorker.instances).toHaveLength(2));
    ControllableWorker.instances[1].resolve(fallbacks[2]);
    await expect(third).resolves.toBe(fallbacks[2]);
  });

  it('transfers settled drawing tiles and composition layers together', async () => {
    const tile = { close: vi.fn() } as unknown as ImageBitmap;
    const texture = { close: vi.fn() } as unknown as ImageBitmap;
    const overlay = { close: vi.fn() } as unknown as ImageBitmap;
    const expected = new Blob(['worker'], { type: 'image/png' });
    vi.stubGlobal('Worker', ControllableWorker);
    const { encodeTiledCanvasPng } = await import('./pngEncoder');

    const encoded = encodeTiledCanvasPng({
      sourceWidth: 400,
      sourceHeight: 300,
      sourceScale: 2,
      exportScale: 2,
      tiles: [{ bitmap: tile, x: 10, y: 20 }],
      texture,
      overlay,
      paperColor: '#fff',
    });
    const worker = ControllableWorker.instances[0];

    expect(worker.posted[0].message).toMatchObject({
      kind: 'tiles',
      sourceWidth: 400,
      sourceHeight: 300,
      tiles: [{ bitmap: tile, x: 10, y: 20 }],
    });
    expect(worker.posted[0].transfer).toEqual([tile, texture, overlay]);
    worker.resolve(expected);
    await expect(encoded).resolves.toBe(expected);
  });

  it('delivers a transferred preview without settling the PNG request', async () => {
    const tile = { close: vi.fn() } as unknown as ImageBitmap;
    const preview = { close: vi.fn() } as unknown as ImageBitmap;
    const onPreview = vi.fn();
    const expected = new Blob(['worker'], { type: 'image/png' });
    vi.stubGlobal('Worker', ControllableWorker);
    const { encodeTiledCanvasPng } = await import('./pngEncoder');

    const encoded = encodeTiledCanvasPng(
      {
        sourceWidth: 400,
        sourceHeight: 300,
        sourceScale: 2,
        exportScale: 2,
        tiles: [{ bitmap: tile, x: 10, y: 20 }],
        texture: null,
        overlay: null,
        paperColor: '#fff',
        previewWidth: 640,
      },
      onPreview
    );
    const worker = ControllableWorker.instances[0];

    expect(worker.posted[0].message.previewWidth).toBe(640);
    worker.sendPreview(preview);
    expect(onPreview).toHaveBeenCalledWith(preview);
    expect(preview.close).not.toHaveBeenCalled();

    worker.resolve(expected);
    await expect(encoded).resolves.toBe(expected);
  });

  it('settles every tiled request and replaces the worker after repeated context loss', async () => {
    const firstTile = { close: vi.fn() } as unknown as ImageBitmap;
    const secondTile = { close: vi.fn() } as unknown as ImageBitmap;
    const thirdTile = { close: vi.fn() } as unknown as ImageBitmap;
    const expected = new Blob(['worker'], { type: 'image/png' });
    vi.stubGlobal('Worker', ControllableWorker);
    const { encodeTiledCanvasPng } = await import('./pngEncoder');

    const first = encodeTiledCanvasPng({
      sourceWidth: 400,
      sourceHeight: 300,
      sourceScale: 2,
      exportScale: 2,
      tiles: [{ bitmap: firstTile, x: 0, y: 0 }],
      texture: null,
      overlay: null,
      paperColor: '#fff',
    });
    const second = encodeTiledCanvasPng({
      sourceWidth: 400,
      sourceHeight: 300,
      sourceScale: 2,
      exportScale: 2,
      tiles: [{ bitmap: secondTile, x: 0, y: 0 }],
      texture: null,
      overlay: null,
      paperColor: '#fff',
    });
    const failedWorker = ControllableWorker.instances[0];
    failedWorker.send({
      id: failedWorker.posted[0].message.id,
      error: 'CanvasContextRecoveryError: Canvas 2D context recovery failed after one retry',
      code: 'canvas-context-recovery-failed',
    });

    await expect(Promise.all([first, second])).resolves.toEqual([null, null]);
    expect(failedWorker.terminated).toBe(true);
    expect(firstTile.close).toHaveBeenCalledOnce();
    expect(secondTile.close).toHaveBeenCalledOnce();

    const third = encodeTiledCanvasPng({
      sourceWidth: 400,
      sourceHeight: 300,
      sourceScale: 2,
      exportScale: 2,
      tiles: [{ bitmap: thirdTile, x: 0, y: 0 }],
      texture: null,
      overlay: null,
      paperColor: '#fff',
    });
    expect(ControllableWorker.instances).toHaveLength(2);
    ControllableWorker.instances[1].resolve(expected);
    await expect(third).resolves.toBe(expected);
  });
});
