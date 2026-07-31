import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface WorkerMessage {
  id: number;
  kind: 'canvas' | 'tiles';
  bitmap?: ImageBitmap;
  tiles?: Array<{ bitmap: ImageBitmap; x: number; y: number }>;
}

class ControllableWorker {
  static instances: ControllableWorker[] = [];

  readonly messageListeners: Array<(event: MessageEvent<{ id: number; blob: Blob }>) => void> = [];
  readonly errorListeners: Array<(event: ErrorEvent) => void> = [];
  readonly posted: Array<{ message: WorkerMessage; transfer: Transferable[] }> = [];
  terminated = false;

  constructor() {
    ControllableWorker.instances.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (type === 'message') {
      this.messageListeners.push(
        listener as (event: MessageEvent<{ id: number; blob: Blob }>) => void
      );
    } else if (type === 'error') {
      this.errorListeners.push(listener as (event: ErrorEvent) => void);
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
}

beforeEach(() => {
  vi.resetModules();
  ControllableWorker.instances.length = 0;
});

afterEach(() => {
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
});
