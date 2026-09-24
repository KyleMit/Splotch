import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SaveResult } from '$lib/saveNaming';

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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// The upload is a WebP transcode of the drawing (issue #345) — smaller payload
// for the buffered generate-image function — while the pristine PNG is what we
// preview and hand to the gallery auto-save.
describe('generateAiImage upload format', () => {
  function stubWebpEncoder() {
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp,probe');
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
  function uploadedImage(callIndex = 0): Blob {
    const init = vi.mocked(fetch).mock.calls[callIndex][1] as RequestInit;
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

  it('skips the transcode entirely when the platform cannot encode WebP', async () => {
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    // Safari's canvas answers an unsupported toDataURL type with the
    // spec-mandated PNG fallback; the capability gate reads that as "no WebP
    // encoder" and must skip without ever decoding the export — on an iPad the
    // decode + discarded re-encode costs ~105 ms of blocked main thread.
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    await generateAiImage();

    expect(uploadedImage().type).toBe('image/png');
    expect(decode).not.toHaveBeenCalled();
  });

  it('probes WebP encode support once across generations', async () => {
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['P'.repeat(200)], { type: 'image/png' }));
    stubWebpEncoder();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(okResponse(new Blob(['result']))))
    );

    const { generateAiImage } = await import('./aiImage');
    const { aiGenerationState } = await import('$lib/state/aiGeneration.svelte');
    await generateAiImage();
    await generateAiImage();

    expect(uploadedImage().type).toBe('image/webp');
    expect(uploadedImage(1).type).toBe('image/webp');
    expect(HTMLCanvasElement.prototype.toDataURL).toHaveBeenCalledTimes(1);
    expect(aiGenerationState.phase.kind).not.toBe('error');
  });

  it('uses the installation pseudonym instead of a credential for a free generation', async () => {
    mocks.settings.aiAccessToken = '';
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['result']), {
          status: 200,
          headers: { 'X-Free-Generations-Remaining': '9' },
        })
      )
    );

    const { generateAiImage } = await import('./aiImage');
    const { freeGenerationsState } = await import('$lib/state/freeGenerations.svelte');
    await generateAiImage();

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers['X-Installation-Id']).toMatch(/^[a-f0-9]{64}$/);
    expect(headers['X-Access-Token']).toBeUndefined();
    expect(freeGenerationsState.remaining).toBe(9);
  });

  it('does not interpret an absent free-balance response header as zero', async () => {
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    const { freeGenerationsState } = await import('$lib/state/freeGenerations.svelte');
    await generateAiImage();

    expect(freeGenerationsState.remaining).toBe(10);
    expect(freeGenerationsState.available).toBe(false);
  });
});
