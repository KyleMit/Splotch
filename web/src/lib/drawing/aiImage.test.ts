import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_REQUEST_TIMEOUT_MS } from '$lib/ai/limits';
import { REPORT_TOKEN_HEADER } from '$lib/apiHeaders';
import type { SaveResult } from '$lib/saveNaming';
import type { AiResultState } from '$lib/state/aiGeneration.svelte';

// The run's phase as one assertion: the discriminant plus the fields that matter.
function expectPhase(
  state: AiResultState,
  phase: { kind: AiResultState['phase']['kind'] } & Record<string, unknown>
) {
  expect(state.phase).toMatchObject(phase);
}

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  saveImageBlob: vi.fn(async (_blob: Blob, _tag: string): Promise<SaveResult> => ({
    status: 'downloads',
  })),
  settings: {
    aiUserApiKey: '',
    aiAccessToken: 'test-token',
    autoSaveAiEnabled: false,
  },
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('./screenshot', () => ({
  saveImageBlob: mocks.saveImageBlob,
}));
vi.mock('$lib/state/settings.svelte', () => ({ settingsState: mocks.settings }));

const CONTENDED_HOST_TEST_TIMEOUT_MS = 20_000;

// Vitest aborts only the test wrapper on timeout. Every timeout-sensitive test
// checks the context signal after each await so its continuation cannot
// run against globals installed by the next test.

// Response bodies are single-use. Tests that make multiple requests call this
// from the fetch implementation so each invocation receives a fresh body.
function okResponse(blob: Blob): Response {
  return new Response(blob, { status: 200 });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.settings.autoSaveAiEnabled = false;
  mocks.settings.aiUserApiKey = '';
  mocks.settings.aiAccessToken = 'test-token';

  let objectUrlId = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++objectUrlId}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('generateAiImage request ownership', () => {
  it(
    'starts the request timeout after canvas export and transcoding finish',
    async ({ signal }) => {
      vi.useFakeTimers();
      const canvasExport = Promise.withResolvers<Blob | null>();
      const webpEncoding = Promise.withResolvers<Blob | null>();
      const request = Promise.withResolvers<Response>();
      mocks.exportCanvasBlob.mockReturnValueOnce(canvasExport.promise);
      // The capability gate must report a WebP encoder or the deferred toBlob
      // stub below is skipped and never awaited.
      vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp,probe');
      vi.stubGlobal(
        'createImageBitmap',
        vi.fn(async () => ({ width: 8, height: 8, close: vi.fn() }))
      );
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
        void webpEncoding.promise.then(callback);
      });
      vi.stubGlobal('fetch', vi.fn().mockReturnValue(request.promise));

      const { generateAiImage } = await import('./aiImage');
      signal.throwIfAborted();

      const generation = generateAiImage();
      await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_TIMEOUT_MS + 1);
      signal.throwIfAborted();
      expect(fetch).not.toHaveBeenCalled();

      canvasExport.resolve(new Blob(['P'.repeat(200)], { type: 'image/png' }));
      await vi.advanceTimersByTimeAsync(0);
      signal.throwIfAborted();
      await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_TIMEOUT_MS + 1);
      signal.throwIfAborted();
      expect(fetch).not.toHaveBeenCalled();

      webpEncoding.resolve(new Blob(['webp'], { type: 'image/webp' }));
      await vi.advanceTimersByTimeAsync(0);
      signal.throwIfAborted();
      expect(fetch).toHaveBeenCalledOnce();
      const requestSignal = (vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal;
      expect(requestSignal?.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(CLIENT_REQUEST_TIMEOUT_MS);
      signal.throwIfAborted();
      expect(requestSignal?.aborted).toBe(true);

      request.resolve(okResponse(new Blob(['result'])));
      await generation;
      signal.throwIfAborted();
    },
    CONTENDED_HOST_TEST_TIMEOUT_MS
  );

  it('turns a rejected canvas export into an error instead of leaving the spinner stuck', async () => {
    const exportError = new Error('export failed');
    mocks.exportCanvasBlob.mockRejectedValueOnce(exportError);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { generateAiImage } = await import('./aiImage');
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

    await generateAiImage();

    expect(aiGenerationState.phase.kind).toBe('error');
    expect(console.error).toHaveBeenCalledWith(exportError);
  });

  it('drops a closed run whose canvas export finishes after its replacement starts', async ({
    signal,
  }) => {
    const exportA = Promise.withResolvers<Blob | null>();
    const exportB = Promise.withResolvers<Blob | null>();
    const requestB = Promise.withResolvers<Response>();
    mocks.exportCanvasBlob
      .mockReturnValueOnce(exportA.promise)
      .mockReturnValueOnce(exportB.promise);
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(requestB.promise));

    const { generateAiImage } = await import('./aiImage');
    signal.throwIfAborted();
    const { aiGenerationState, closeAiResult } = await import('$lib/state/aiGeneration.svelte');
    signal.throwIfAborted();

    const runA = generateAiImage();
    closeAiResult();
    const runB = generateAiImage();
    exportB.resolve(new Blob(['drawing-b']));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    signal.throwIfAborted();

    exportA.resolve(new Blob(['drawing-a']));
    await runA;
    signal.throwIfAborted();
    expect(fetch).toHaveBeenCalledOnce();
    expect(aiGenerationState.phase.kind).toBe('generating');

    requestB.resolve(okResponse(new Blob(['result-b'])));
    await runB;
    signal.throwIfAborted();
    expectPhase(aiGenerationState, { kind: 'result', url: 'blob:test-2', autoSave: null });
  });

  it('never auto-saves a stale run after close and restart', async ({ signal }) => {
    mocks.settings.autoSaveAiEnabled = true;
    const requestA = Promise.withResolvers<Response>();
    const requestB = Promise.withResolvers<Response>();
    mocks.exportCanvasBlob
      .mockResolvedValueOnce(new Blob(['drawing-a']))
      .mockResolvedValueOnce(new Blob(['drawing-b']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise)
    );

    const { generateAiImage } = await import('./aiImage');
    signal.throwIfAborted();
    const { closeAiResult } = await import('$lib/state/aiGeneration.svelte');
    signal.throwIfAborted();

    const runA = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    signal.throwIfAborted();
    closeAiResult();
    const runB = generateAiImage();
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    signal.throwIfAborted();

    requestA.resolve(okResponse(new Blob(['result-a'])));
    await runA;
    signal.throwIfAborted();
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();

    requestB.resolve(okResponse(new Blob(['result-b'])));
    await runB;
    signal.throwIfAborted();
    expect(mocks.saveImageBlob).toHaveBeenCalledTimes(2);
  });
});

describe('generateAiImage response handling', () => {
  it('shows child-facing safety guidance without auto-saving a refusal', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('blocked', {
          status: 422,
          headers: { [REPORT_TOKEN_HEADER]: 'signed-refusal-token' },
        })
      )
    );

    const { generateAiImage } = await import('./aiImage');
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

    await generateAiImage();

    expectPhase(aiGenerationState, {
      kind: 'error',
      errorKind: 'safety',
      message: "Let's try drawing something else!",
      reportToken: 'signed-refusal-token',
    });
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
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

    await generateAiImage();

    expectPhase(aiGenerationState, { kind: 'error', errorKind: 'retry', message: null });
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
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

    await generateAiImage();

    expectPhase(aiGenerationState, { kind: 'error', errorKind: 'retry', message: null });
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
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

    await generateAiImage();

    expectPhase(aiGenerationState, { kind: 'error', errorKind: 'generic' });
    expect(console.error).toHaveBeenCalledWith('AI image request failed (413): Image is too large');
    expect(mocks.saveImageBlob).not.toHaveBeenCalled();
  });

  it('routes an exhausted daily free limit to BYOK setup without marking the grant spent', async () => {
    mocks.settings.aiAccessToken = '';
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json(
          {
            ok: false,
            code: 'FREE_DAILY_LIMIT_EXHAUSTED',
            error: 'Free creations are unavailable today.',
          },
          { status: 503 }
        )
      )
    );

    const { generateAiImage } = await import('./aiImage');
    const { freeGenerationsState } = await import('$lib/state/freeGenerations.svelte');
    const { settingsModal, uiState } = await import('$lib/state/ui.svelte');

    await generateAiImage();

    expect(freeGenerationsState).toMatchObject({ available: false, remaining: 10 });
    expect(uiState.requestedSettingsSection).toBe('ai');
    expect(settingsModal.open).toBe(true);
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
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(okResponse(new Blob(['result'], { type: 'image/webp' })))
    );

    const { generateAiImage } = await import('./aiImage');
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

    await generateAiImage();

    expectPhase(aiGenerationState, { kind: 'result', url: 'blob:test-2', type: 'image/webp' });
    expect(mocks.saveImageBlob).toHaveBeenCalledTimes(2);
  });

  it('reports saving until the AI picture save settles, then the folder it landed in', async () => {
    mocks.settings.autoSaveAiEnabled = true;
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
    const aiSave = Promise.withResolvers<SaveResult>();
    mocks.saveImageBlob.mockReturnValueOnce(aiSave.promise);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

    const run = generateAiImage();
    await vi.waitFor(() => expect(mocks.saveImageBlob).toHaveBeenCalledOnce());
    expectPhase(aiGenerationState, { kind: 'result', autoSave: { status: 'saving' } });

    aiSave.resolve({ status: 'chosenFolder', folderName: 'Drawings' });
    await run;

    expectPhase(aiGenerationState, {
      kind: 'result',
      autoSave: { status: 'chosenFolder', folderName: 'Drawings' },
    });
  });

  it.each([
    ['returns failed', () => Promise.resolve<SaveResult>({ status: 'failed' })],
    ['throws', () => Promise.reject(new Error('download blocked'))],
  ])(
    'keeps the picture and reports failed when the AI picture save %s',
    async (_label, failingSave) => {
      mocks.settings.autoSaveAiEnabled = true;
      mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['drawing']));
      mocks.saveImageBlob
        .mockImplementationOnce(failingSave)
        .mockResolvedValueOnce({ status: 'photos' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const { generateAiImage } = await import('./aiImage');
      const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');

      await generateAiImage();

      expect(mocks.saveImageBlob).toHaveBeenCalledTimes(2);
      expectPhase(aiGenerationState, { kind: 'result', autoSave: { status: 'failed' } });
    }
  );
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

describe('retryAiImage', () => {
  it('reuses the original drawing and style and stops after a second failure', async () => {
    const drawing = new Blob(['original drawing'], { type: 'image/png' });
    mocks.exportCanvasBlob.mockResolvedValue(drawing);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"Server unavailable"}', { status: 503 }))
    );
    const { generateAiImage, retryAiImage } = await import('./aiImage');
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');
    await generateAiImage({ style: 'Crayon' });
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['newer drawing']));
    await retryAiImage();
    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1]).toEqual([
      '/api/generate-image?style=Crayon',
      expect.objectContaining({ body: drawing }),
    ]);
    expect(aiGenerationState.consecutiveFailures).toBe(2);
    expectPhase(aiGenerationState, {
      kind: 'error',
      details: { status: 503, endpoint: '/api/generate-image', message: 'Server unavailable' },
    });
    await retryAiImage();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('records the polling endpoint without its job identifier', async () => {
    vi.useFakeTimers();
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing'], { type: 'image/png' }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response('{"jobId":"private-job-id","pollAfterMs":0}', { status: 202 })
        )
        .mockResolvedValueOnce(new Response('{"error":"Provider failed"}', { status: 502 }))
    );
    const { generateAiImage } = await import('./aiImage');
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');
    const running = generateAiImage();
    await vi.runAllTimersAsync();
    await running;
    expectPhase(aiGenerationState, {
      kind: 'error',
      details: { status: 502, endpoint: '/api/generation-result', message: 'Provider failed' },
    });
  });
});
