import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CRAYON_DEFAULTS } from './crayonBrush';
import type { EncodePngResponse, EncodeReplayPngRequest } from './pngEncoderProtocol';

const paint = vi.hoisted(() => ({
  configureReplayCrayon: vi.fn(),
  paintReplayExport: vi.fn(),
}));
vi.mock('./exportReplayPaint', () => paint);

// The worker installs its handler on `self` at import, so each test stubs the worker scope and the
// OffscreenCanvas it draws on, then drives that handler directly.
interface WorkerScope {
  onmessage: ((event: MessageEvent<EncodeReplayPngRequest>) => Promise<void>) | null;
  postMessage: ReturnType<
    typeof vi.fn<(message: EncodePngResponse, transfer?: Transferable[]) => void>
  >;
}

const PREVIEW_WIDTH = 64;
const encoded = new Blob(['png'], { type: 'image/png' });
const previewBitmap = { close: vi.fn() } as unknown as ImageBitmap;

let scope: WorkerScope;
let contextLost: boolean;
let order: string[];
const contextSettings: unknown[] = [];

class StubOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number
  ) {}
  getContext(_kind: string, settings?: unknown) {
    contextSettings.push(settings);
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
  addEventListener() {}
  removeEventListener() {}
  convertToBlob = vi.fn(async () => {
    order.push('blob');
    return encoded;
  });
  transferToImageBitmap = vi.fn(() => {
    order.push('preview');
    return previewBitmap;
  });
}

function bitmap() {
  return { width: 10, height: 10, close: vi.fn() } as unknown as ImageBitmap;
}

function replayRequest(withPreview: boolean): EncodeReplayPngRequest {
  return {
    id: 9,
    kind: 'replay',
    width: 300,
    height: 150,
    replayScale: 1.5,
    exportScale: 3,
    paper: { width: 200, height: 100 },
    base: [{ bitmap: bitmap(), x: 0, y: 0 }],
    commands: [[{ kind: 'dot', x: 1, y: 1, radius: 2, color: '#f00', erase: false }]],
    sheets: [{ bitmap: bitmap(), originX: 0, originY: 0, sourceUrl: null }],
    crayon: { options: CRAYON_DEFAULTS, deposition: 'glaze-direct' },
    texture: bitmap(),
    overlay: bitmap(),
    paperColor: '#fff',
    preview: withPreview
      ? {
          width: PREVIEW_WIDTH,
          sourceWidth: 200,
          sourceHeight: 100,
          sourceScale: 2,
          tiles: [{ bitmap: bitmap(), x: 0, y: 0 }],
        }
      : null,
  };
}

function closeCounts(request: EncodeReplayPngRequest) {
  return [
    ...request.base.map((tile) => tile.bitmap),
    ...request.sheets.map((sheet) => sheet.bitmap),
    request.texture,
    request.overlay,
    ...(request.preview?.tiles.map((tile) => tile.bitmap) ?? []),
  ].map((input) => vi.mocked(input!.close).mock.calls.length);
}

async function handle(request: EncodeReplayPngRequest) {
  await scope.onmessage!(new MessageEvent('message', { data: request }));
}

beforeEach(async () => {
  vi.resetModules();
  contextLost = false;
  order = [];
  contextSettings.length = 0;
  paint.configureReplayCrayon.mockReset().mockImplementation(() => order.push('configure'));
  paint.paintReplayExport.mockReset().mockImplementation(() => order.push('paint'));
  scope = { onmessage: null, postMessage: vi.fn() };
  vi.stubGlobal('self', scope);
  vi.stubGlobal('OffscreenCanvas', StubOffscreenCanvas);
  await import('./exportReplay.worker');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('export replay worker', () => {
  it('posts the preview before replaying, then the PNG, and closes every transferred input', async () => {
    const request = replayRequest(true);

    await handle(request);

    expect(order).toEqual(['preview', 'configure', 'paint', 'blob']);
    expect(scope.postMessage.mock.calls).toEqual([
      [{ id: 9, preview: previewBitmap }, [previewBitmap]],
      [{ id: 9, blob: encoded }],
    ]);
    expect(paint.configureReplayCrayon).toHaveBeenCalledWith(request.crayon);
    expect(closeCounts(request)).toEqual([1, 1, 1, 1, 1]);
  });

  it('rasters the replay and the preview on CPU surfaces', async () => {
    await handle(replayRequest(true));

    expect(contextSettings).toEqual([{ willReadFrequently: true }, { willReadFrequently: true }]);
  });

  it('codes an unrecoverable canvas context so the client retires the worker', async () => {
    contextLost = true;
    const request = replayRequest(false);

    await handle(request);

    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 9,
      error: expect.stringContaining('CanvasContextRecoveryError'),
      code: 'canvas-context-recovery-failed',
    });
    expect(paint.paintReplayExport).not.toHaveBeenCalled();
    expect(closeCounts(request)).toEqual([1, 1, 1, 1]);
  });

  it('replies to a replay that throws with a plain error and closes its inputs', async () => {
    paint.paintReplayExport.mockImplementation(() => {
      throw new Error('replay failed');
    });
    const request = replayRequest(false);

    await handle(request);

    expect(scope.postMessage).toHaveBeenCalledExactlyOnceWith({
      id: 9,
      error: 'Error: replay failed',
    });
    expect(closeCounts(request)).toEqual([1, 1, 1, 1]);
  });
});
