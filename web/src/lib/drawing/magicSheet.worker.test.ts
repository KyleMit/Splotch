import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MagicSheetWorkerRequest, MagicSheetWorkerResponse } from './magicSheet.worker';

// The worker installs its handler on `self` at import, so each test stubs the worker scope, fetch,
// and the OffscreenCanvas it draws on, then drives that handler directly.
interface WorkerScope {
  onmessage: ((event: MessageEvent<MagicSheetWorkerRequest>) => Promise<void>) | null;
  postMessage: ReturnType<
    typeof vi.fn<(message: MagicSheetWorkerResponse, transfer: Transferable[]) => void>
  >;
}

let scope: WorkerScope;
let contextLost: boolean;
let context: ReturnType<typeof context2d>;
const sheet = { close: vi.fn() } as unknown as ImageBitmap;
const decodedImage = { close: vi.fn() } as unknown as ImageBitmap;

function context2d() {
  return {
    fillStyle: '' as unknown,
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    isContextLost: () => contextLost,
  };
}

class StubOffscreenCanvas {
  getContext() {
    return context;
  }
  addEventListener() {}
  removeEventListener() {}
  transferToImageBitmap = vi.fn(() => sheet);
}

const imageRequest = {
  id: 5,
  width: 400,
  height: 300,
  imageUrl: '/coloring/page.light.webp',
  fit: { x: 10, y: 0, width: 380, height: 300 },
  edgeFills: [{ sx: 0, sy: 0, sw: 1, sh: 300, dx: 0, dy: 0, dw: 10, dh: 300 }],
} satisfies MagicSheetWorkerRequest;

async function handle(request: MagicSheetWorkerRequest) {
  await scope.onmessage!(new MessageEvent('message', { data: request }));
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  contextLost = false;
  context = context2d();
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('OffscreenCanvas', StubOffscreenCanvas);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('image'))
  );
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => decodedImage)
  );
  await import('./magicSheet.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('magic sheet worker', () => {
  it('draws the fetched page and its edge fills, transfers the sheet, and closes the page', async () => {
    await handle(imageRequest);

    expect(fetch).toHaveBeenCalledWith('/coloring/page.light.webp');
    expect(context.drawImage.mock.calls).toEqual([
      [decodedImage, 10, 0, 380, 300],
      [decodedImage, 0, 0, 1, 300, 0, 0, 10, 300],
    ]);
    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({ id: 5, bitmap: sheet }, [sheet]);
    expect(decodedImage.close).toHaveBeenCalledOnce();
  });

  it('paints a rainbow request without fetching', async () => {
    await handle({
      id: 6,
      width: 400,
      height: 300,
      gradient: { angle: 0, stops: [{ offset: 0, color: 'red' }] },
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 400, 300);
    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({ id: 6, bitmap: sheet }, [sheet]);
  });

  // magicSheetRasterClient.ts retires the worker only for a coded reply: a missing page is one
  // request's failure, so it falls back on the main thread and keeps the worker.
  it('replies to a failed page fetch with a plain error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('missing', { status: 404 }));

    await handle(imageRequest);

    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith(
      { id: 5, error: 'Error: Magic sheet worker could not load /coloring/page.light.webp' },
      []
    );
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('codes an unrecoverable canvas context and still closes the page', async () => {
    contextLost = true;

    await handle(imageRequest);

    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith(
      {
        id: 5,
        error: expect.stringContaining('CanvasContextRecoveryError'),
        code: 'canvas-context-recovery-failed',
      },
      []
    );
    expect(decodedImage.close).toHaveBeenCalledOnce();
  });
});
