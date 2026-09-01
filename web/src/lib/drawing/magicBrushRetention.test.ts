import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const workers: WorkerStub[] = [];

class WorkerImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 200;
  naturalHeight = 100;
  src = '';
}

class WorkerStub {
  messageListeners: Array<(event: MessageEvent) => void> = [];
  posted: Array<{ id: number; imageUrl?: string; gradient?: unknown }> = [];

  constructor() {
    workers.push(this);
  }

  addEventListener(type: string, listener: EventListener) {
    if (type === 'message') this.messageListeners.push(listener as (event: MessageEvent) => void);
  }

  postMessage(message: { id: number; imageUrl?: string; gradient?: unknown }) {
    this.posted.push(message);
  }

  terminate() {}

  respond(data: unknown) {
    for (const listener of this.messageListeners) {
      listener(new MessageEvent('message', { data }));
    }
  }
}

class WorkerOffscreenCanvas {
  transferToImageBitmap() {}
}

async function mountedWorkerBrush(hasRetainedOps = () => false, magicActive = () => false) {
  const magic = await import('./magicBrush');
  magic.initMagicBrush({
    paperSize: () => ({ width: 400, height: 300 }),
    sheetBounds: () => ({ x: 0, y: 0, width: 400, height: 300 }),
    hasRetainedOps,
    magicActive,
    repaint: vi.fn(),
  });
  return magic;
}

async function resolveFallbackSheet(magic: Awaited<ReturnType<typeof mountedWorkerBrush>>) {
  magic.ensureMagicSheet();
  const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
  workers[0].respond({ id: workers[0].posted[0].id, bitmap });
  await vi.waitFor(() => expect(magic.captureMagicSheet()?.canvas).toBe(bitmap));
  return bitmap;
}

describe('Magic sheet retention', () => {
  beforeEach(() => {
    vi.resetModules();
    workers.length = 0;
    vi.stubGlobal('Image', WorkerImage);
    vi.stubGlobal('Worker', WorkerStub);
    vi.stubGlobal('OffscreenCanvas', WorkerOffscreenCanvas);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('releases an unretained worker sheet when its source changes', async () => {
    const magic = await mountedWorkerBrush();
    const bitmap = await resolveFallbackSheet(magic);

    magic.setColorSheet('/coloring/page.light.webp');

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(magic.captureMagicSheet()).toBeNull();
  });

  it('preserves a worker sheet referenced by retained Magic ops', async () => {
    const magic = await mountedWorkerBrush(() => true);
    const bitmap = await resolveFallbackSheet(magic);

    magic.setColorSheet('/coloring/page.light.webp');

    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it('defers the fallback rainbow when a page clears under an inactive brush', async () => {
    const magic = await mountedWorkerBrush();
    await resolveFallbackSheet(magic);
    magic.setColorSheet('/coloring/page.light.webp');

    magic.setColorSheet(null);

    expect(workers[0].posted).toHaveLength(1);
    expect(magic.captureMagicSheet()).toBeNull();
  });

  it('rebuilds the fallback rainbow when a page clears under the Magic brush', async () => {
    const magic = await mountedWorkerBrush(
      () => false,
      () => true
    );
    await resolveFallbackSheet(magic);
    magic.setColorSheet('/coloring/page.light.webp');

    magic.setColorSheet(null);

    expect(workers[0].posted).toHaveLength(2);
  });
});
