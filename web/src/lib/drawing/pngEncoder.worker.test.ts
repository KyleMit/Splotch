import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EncodePngRequest, EncodePngResponse } from './pngEncoderProtocol';

// The worker installs its handler on `self` at import, so each test stubs the worker scope and the
// OffscreenCanvas it draws on, then drives that handler directly.
interface WorkerScope {
  onmessage: ((event: MessageEvent<EncodePngRequest>) => Promise<void>) | null;
  postMessage: ReturnType<
    typeof vi.fn<(message: EncodePngResponse, transfer?: Transferable[]) => void>
  >;
}

const PREVIEW_WIDTH = 64;

let scope: WorkerScope;
let contextLost: boolean;
let previewContextAvailable: boolean;
let surfaceContextAvailable: boolean;
const encoded = new Blob(['png'], { type: 'image/png' });
const previewBitmap = { close: vi.fn() } as unknown as ImageBitmap;

function context2d() {
  return {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    globalCompositeOperation: 'source-over',
    fillStyle: '',
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    fillRect: vi.fn(),
    createPattern: vi.fn(() => ({})),
    drawImage: vi.fn(),
    isContextLost: () => contextLost,
  };
}

class StubOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
  getContext() {
    const available =
      this.width === PREVIEW_WIDTH ? previewContextAvailable : surfaceContextAvailable;
    return available ? context2d() : null;
  }
  addEventListener() {}
  removeEventListener() {}
  convertToBlob = vi.fn(async () => encoded);
  transferToImageBitmap = vi.fn(() => previewBitmap);
}

function bitmap(width = 10, height = 10) {
  return { width, height, close: vi.fn() } as unknown as ImageBitmap;
}

function tilesRequest(previewWidth?: number) {
  return {
    id: 7,
    kind: 'tiles',
    sourceWidth: 200,
    sourceHeight: 100,
    sourceScale: 2,
    exportScale: 2,
    tiles: [{ bitmap: bitmap(), x: 0, y: 0 }],
    texture: bitmap(),
    overlay: bitmap(),
    paperColor: '#fff',
    previewWidth,
  } satisfies EncodePngRequest;
}

async function handle(request: EncodePngRequest) {
  await scope.onmessage!(new MessageEvent('message', { data: request }));
}

function closedInputs(request: ReturnType<typeof tilesRequest>) {
  return [...request.tiles.map((tile) => tile.bitmap), request.texture, request.overlay].map(
    (input) => vi.mocked(input.close).mock.calls.length
  );
}

beforeEach(async () => {
  vi.resetModules();
  contextLost = false;
  previewContextAvailable = true;
  surfaceContextAvailable = true;
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('OffscreenCanvas', StubOffscreenCanvas);
  await import('./pngEncoder.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PNG encoder worker', () => {
  it('posts the preview before the PNG and closes every transferred input', async () => {
    const request = tilesRequest(PREVIEW_WIDTH);

    await handle(request);

    expect(scope.postMessage.mock.calls).toEqual([
      [{ id: 7, preview: previewBitmap }, [previewBitmap]],
      [{ id: 7, blob: encoded }],
    ]);
    expect(closedInputs(request)).toEqual([1, 1, 1]);
  });

  it('still posts the PNG and closes its inputs when the optional preview fails', async () => {
    previewContextAvailable = false;
    const request = tilesRequest(PREVIEW_WIDTH);

    await handle(request);

    expect(scope.postMessage.mock.calls).toEqual([[{ id: 7, blob: encoded }]]);
    expect(closedInputs(request)).toEqual([1, 1, 1]);
  });

  it('encodes a canvas bitmap and closes it', async () => {
    const source = bitmap(40, 30);

    await handle({ id: 3, kind: 'canvas', bitmap: source });

    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({ id: 3, blob: encoded });
    expect(source.close).toHaveBeenCalledOnce();
  });

  // pngEncoder.ts retires the whole worker only for a coded reply; a plain error settles one request.
  it('codes an unrecoverable canvas context so the client retires the worker', async () => {
    contextLost = true;
    const request = tilesRequest();

    await handle(request);

    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 7,
      error: expect.stringContaining('CanvasContextRecoveryError'),
      code: 'canvas-context-recovery-failed',
    });
    expect(closedInputs(request)).toEqual([1, 1, 1]);
  });

  it('replies to any other failure with a plain error and closes its input', async () => {
    surfaceContextAvailable = false;
    const source = bitmap();

    await handle({ id: 4, kind: 'canvas', bitmap: source });

    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 4,
      error: 'Error: PNG encoder could not allocate a 2D context',
    });
    expect(source.close).toHaveBeenCalledOnce();
  });
});
