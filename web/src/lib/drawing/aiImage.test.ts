import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  saveImageBlob: vi.fn(async (_blob: Blob, _tag: string) => {}),
  settings: {
    aiUserApiKey: '',
    aiAccessToken: 'test-token',
    autoSaveAiEnabled: false,
  },
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('./overlay', () => ({ getActiveOverlayImage: vi.fn(() => null) }));
vi.mock('./screenshot', () => ({
  saveImageBlob: mocks.saveImageBlob,
  AI_IMAGE_BASENAME: 'splotch-ai',
  DRAWING_BASENAME: 'splotch',
}));
vi.mock('$lib/state/settings.svelte', () => ({ settings: mocks.settings }));

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function okResponse(blob: Blob): Response {
  return new Response(blob, { status: 200 });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.settings.autoSaveAiEnabled = false;

  let objectUrlId = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++objectUrlId}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generateAiImage request ownership', () => {
  it('turns a rejected canvas export into an error instead of leaving the spinner stuck', async () => {
    const exportError = new Error('export failed');
    mocks.exportCanvasBlob.mockRejectedValueOnce(exportError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateAiImage } = await import('./aiImage');
    const { ui } = await import('$lib/state/ui.svelte');

    await generateAiImage();

    expect(ui.aiGenerating).toBe(false);
    expect(ui.aiError).toBe(true);
    expect(console.error).toHaveBeenCalledWith(exportError);
  });

  it('lets only the replacement run commit when the first request finishes late', async () => {
    const requestA = deferred<Response>();
    const requestB = deferred<Response>();
    const drawingA = new Blob(['drawing-a']);
    const drawingB = new Blob(['drawing-b']);
    mocks.exportCanvasBlob.mockResolvedValueOnce(drawingA).mockResolvedValueOnce(drawingB);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise)
    );

    const { generateAiImage } = await import('./aiImage');
    const { closeAiResult, ui } = await import('$lib/state/ui.svelte');

    const runA = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const requestASignal = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal;
    closeAiResult();
    expect(requestASignal?.aborted).toBe(true);
    const runB = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    requestA.resolve(okResponse(new Blob(['result-a'])));
    await runA;

    expect(ui.aiGenerating).toBe(true);
    expect(ui.aiResultUrl).toBeNull();

    requestB.resolve(okResponse(new Blob(['result-b'])));
    await runB;

    expect(ui.aiGenerating).toBe(false);
    expect(ui.aiResultUrl).toBe('blob:test-4');
  });

  it('keeps the replacement result when it finishes before the stale request', async () => {
    const requestA = deferred<Response>();
    const requestB = deferred<Response>();
    mocks.exportCanvasBlob
      .mockResolvedValueOnce(new Blob(['drawing-a']))
      .mockResolvedValueOnce(new Blob(['drawing-b']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise)
    );

    const { generateAiImage } = await import('./aiImage');
    const { closeAiResult, ui } = await import('$lib/state/ui.svelte');

    const runA = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    closeAiResult();
    const runB = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    requestB.resolve(okResponse(new Blob(['result-b'])));
    await runB;
    expect(ui.aiResultUrl).toBe('blob:test-3');

    requestA.resolve(okResponse(new Blob(['result-a'])));
    await runA;
    expect(ui.aiResultUrl).toBe('blob:test-3');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-4');
  });

  it('drops a closed run whose canvas export finishes after its replacement starts', async () => {
    const exportA = deferred<Blob | null>();
    const exportB = deferred<Blob | null>();
    const requestB = deferred<Response>();
    mocks.exportCanvasBlob
      .mockReturnValueOnce(exportA.promise)
      .mockReturnValueOnce(exportB.promise);
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(requestB.promise));

    const { generateAiImage } = await import('./aiImage');
    const { closeAiResult, ui } = await import('$lib/state/ui.svelte');

    const runA = generateAiImage();
    closeAiResult();
    const runB = generateAiImage();
    exportB.resolve(new Blob(['drawing-b']));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    exportA.resolve(new Blob(['drawing-a']));
    await runA;
    expect(fetch).toHaveBeenCalledOnce();
    expect(ui.aiGenerating).toBe(true);

    requestB.resolve(okResponse(new Blob(['result-b'])));
    await runB;
    expect(ui.aiResultUrl).toBe('blob:test-2');
  });

  it('never auto-saves a stale run after close and restart', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    const requestA = deferred<Response>();
    const requestB = deferred<Response>();
    mocks.exportCanvasBlob
      .mockResolvedValueOnce(new Blob(['drawing-a']))
      .mockResolvedValueOnce(new Blob(['drawing-b']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise)
    );

    const { generateAiImage } = await import('./aiImage');
    const { closeAiResult } = await import('$lib/state/ui.svelte');

    const runA = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    closeAiResult();
    const runB = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    requestA.resolve(okResponse(new Blob(['result-a'])));
    await runA;
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();

    requestB.resolve(okResponse(new Blob(['result-b'])));
    await runB;
    expect(mocks.saveImageBlob).toHaveBeenCalledTimes(2);
  });
});

describe('generateAiImage response handling', () => {
  it('shows child-facing safety guidance without auto-saving a refusal', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('blocked', { status: 422 })));

    const { generateAiImage } = await import('./aiImage');
    const { ui } = await import('$lib/state/ui.svelte');

    await generateAiImage();

    expect(ui.aiGenerating).toBe(false);
    expect(ui.aiError).toBe(true);
    expect(ui.aiErrorKind).toBe('safety');
    expect(ui.aiErrorMessage).toBe("Let's try drawing something else!");
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();
  });

  it('shows retry state and logs throttling detail without auto-saving', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('Please wait', {
          status: 429,
          headers: { 'Retry-After': '12' },
        })
      )
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateAiImage } = await import('./aiImage');
    const { ui } = await import('$lib/state/ui.svelte');

    await generateAiImage();

    expect(ui.aiGenerating).toBe(false);
    expect(ui.aiError).toBe(true);
    expect(ui.aiErrorKind).toBe('retry');
    expect(ui.aiErrorMessage).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      'AI image request throttled (retry after 12s): Please wait'
    );
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();
  });

  it('shows the retry state on a 5xx (transient upstream/timeout) without auto-saving', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Upstream unavailable', { status: 502 }))
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateAiImage } = await import('./aiImage');
    const { ui } = await import('$lib/state/ui.svelte');

    await generateAiImage();

    expect(ui.aiGenerating).toBe(false);
    expect(ui.aiError).toBe(true);
    expect(ui.aiErrorKind).toBe('retry');
    expect(ui.aiErrorMessage).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      'AI image request failed (502): Upstream unavailable'
    );
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();
  });

  it('shows the generic state on a 4xx (client-side) response', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('Image is too large', { status: 413 }))
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateAiImage } = await import('./aiImage');
    const { ui } = await import('$lib/state/ui.svelte');

    await generateAiImage();

    expect(ui.aiErrorKind).toBe('generic');
    expect(console.error).toHaveBeenCalledWith('AI image request failed (413): Image is too large');
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();
  });

  it('saves the child drawing once across re-rolls of the same unchanged drawing', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    // Same drawing bytes on every roll → the signature matches, so the drawing
    // copy dedupes while each fresh AI image still saves.
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['same-drawing']));
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(okResponse(new Blob(['result-1'])))
        .mockResolvedValueOnce(okResponse(new Blob(['result-2'])))
    );

    const { generateAiImage } = await import('./aiImage');

    await generateAiImage();
    await generateAiImage();

    const tags = mocks.saveImageBlob.mock.calls.map((call) => call[1]);
    expect(tags.filter((tag) => tag === 'splotch-ai')).toHaveLength(2);
    expect(tags.filter((tag) => tag === 'splotch')).toHaveLength(1);
  });

  it('commits and auto-saves only an image response', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    const { ui } = await import('$lib/state/ui.svelte');

    await generateAiImage();

    expect(ui.aiGenerating).toBe(false);
    expect(ui.aiError).toBe(false);
    expect(ui.aiResultUrl).toBe('blob:test-2');
    expect(mocks.saveImageBlob).toHaveBeenCalledTimes(2);
  });
});

// The upload is a WebP transcode of the drawing (issue #345) — smaller payload
// for the buffered generate-image function — while the pristine PNG is what we
// preview and hand to the gallery auto-save.
describe('generateAiImage upload format', () => {
  function stubWebpEncoder() {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 8, height: 8, close: vi.fn() }))
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      cb: BlobCallback,
      type?: string
    ) {
      cb(new Blob(['webp'], { type: type ?? 'image/png' }));
    });
  }

  // The raw-body contract (ADR-0064) sends the image bytes as the request body,
  // so the uploaded blob is the body itself and its MIME type is the request's
  // Content-Type header — assert the two agree.
  function uploadedImage(): Blob {
    const init = vi.mocked(fetch).mock.calls[0][1] as RequestInit;
    const body = init.body as Blob;
    const contentType = (init.headers as Record<string, string>)['Content-Type'];
    expect(contentType).toBe(body.type);
    return body;
  }

  it('uploads a WebP copy while keeping the PNG for the preview and gallery', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    // A roomy PNG so the tiny stubbed WebP is genuinely smaller and gets used.
    mocks.exportCanvasBlob.mockResolvedValueOnce(
      new Blob(['P'.repeat(200)], { type: 'image/png' })
    );
    stubWebpEncoder();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    await generateAiImage();

    // The server dispatches on the request Content-Type (the blob's MIME type).
    expect(uploadedImage().type).toBe('image/webp');

    // The child's own drawing is still saved to the gallery as the lossless PNG.
    const drawingSave = mocks.saveImageBlob.mock.calls.find((call) => call[1] === 'splotch');
    expect(drawingSave?.[0].type).toBe('image/png');
  });

  it('falls back to the PNG upload when the platform cannot encode WebP', async () => {
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    // No WebP encoder stubbed: createImageBitmap is absent, so encodeWebpUpload
    // throws and we upload the original PNG.
    vi.stubGlobal('createImageBitmap', undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    await generateAiImage();

    expect(uploadedImage().type).toBe('image/png');
  });
});

describe('createDrawingDeduper', () => {
  it('dedupes a repeated signature but not against a fresh instance', async () => {
    const { createDrawingDeduper } = await import('./aiImage');
    const deduper = createDrawingDeduper();
    expect(deduper.isDuplicate('sig-a')).toBe(false);
    deduper.record('sig-a');
    expect(deduper.isDuplicate('sig-a')).toBe(true);
    expect(deduper.isDuplicate('sig-b')).toBe(false);

    expect(createDrawingDeduper().isDuplicate('sig-a')).toBe(false);
  });
});
