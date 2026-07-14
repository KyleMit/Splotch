import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  saveImageBlob: vi.fn(async () => {}),
  settings: {
    aiUserApiKey: '',
    aiAccessToken: 'test-token',
    autoSaveAiEnabled: false,
  },
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('./overlay', () => ({ getActiveOverlayImage: vi.fn(() => null) }));
vi.mock('./screenshot', () => ({ saveImageBlob: mocks.saveImageBlob }));
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

  it('shows generic state and logs a generic response error without auto-saving', async () => {
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
    expect(ui.aiErrorKind).toBe('generic');
    expect(ui.aiErrorMessage).toBeNull();
    expect(console.error).toHaveBeenCalledOnce();
    const logged = vi.mocked(console.error).mock.calls[0][0];
    expect(logged).toBeInstanceOf(Error);
    expect((logged as Error).message).toBe('AI image request failed (502): Upstream unavailable');
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();
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
