import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACCESS_TOKEN_HEADER, API_KEY_HEADER, INSTALLATION_ID_HEADER } from '$lib/apiHeaders';
import type { SaveResult } from '$lib/saveNaming';
import type { SettingsState } from '$lib/state/settings.svelte';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  encodeWebpUpload: vi.fn(async (_png: Blob): Promise<Blob | null> => null),
  saveImageBlob: vi.fn(async (_blob: Blob, _tag: string): Promise<SaveResult> => ({
    status: 'downloads',
  })),
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('./aiUploadEncoding', () => ({ encodeWebpUpload: mocks.encodeWebpUpload }));
vi.mock('./imageSave', () => ({
  saveImageBlob: mocks.saveImageBlob,
}));

// The real store, re-imported after each vi.resetModules() so it is the
// instance the test's freshly imported aiImage reads.
let settings: SettingsState;

const TEST_ACCESS_TOKEN = 'test-token';

function okResponse(blob: Blob): Response {
  return new Response(blob, { status: 200 });
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  ({ settingsState: settings } = await import('$lib/state/settings.svelte'));
  // The fresh store rereads localStorage, where an earlier test's auto-save
  // choice persists; the access code is an in-memory mirror and starts empty.
  settings.setAutoSaveAi(false);
  settings.mirrorAiAccessToken(TEST_ACCESS_TOKEN);

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
// preview and hand to the gallery auto-save. When the transcode happens at all
// is aiUploadEncoding.test.ts's concern.
describe('generateAiImage upload format', () => {
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
    settings.setAutoSaveAi(true);
    const png = new Blob(['png'], { type: 'image/png' });
    mocks.exportCanvasBlob.mockResolvedValueOnce(png);
    mocks.encodeWebpUpload.mockResolvedValueOnce(new Blob(['webp'], { type: 'image/webp' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    await generateAiImage();

    expect(mocks.encodeWebpUpload).toHaveBeenCalledExactlyOnceWith(png);
    // The server dispatches on the request Content-Type (the blob's MIME type).
    expect(uploadedImage().type).toBe('image/webp');

    // The child's own drawing is still saved to the gallery as the lossless PNG.
    const drawingSave = mocks.saveImageBlob.mock.calls.find((call) => call[1] === 'splotch');
    expect(drawingSave?.[0]).toBe(png);
  });

  it('uploads the PNG itself when the encoder declines', async () => {
    const png = new Blob(['png'], { type: 'image/png' });
    mocks.exportCanvasBlob.mockResolvedValueOnce(png);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    await generateAiImage();

    expect(uploadedImage()).toBe(png);
  });

  it('sends the stored access code as the request credential', async () => {
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    await generateAiImage();

    const headers = vi.mocked(fetch).mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers[ACCESS_TOKEN_HEADER]).toBe(TEST_ACCESS_TOKEN);
    expect(headers[API_KEY_HEADER]).toBeUndefined();
    expect(headers[INSTALLATION_ID_HEADER]).toBeUndefined();
  });

  it('uses the installation pseudonym instead of a credential for a free generation', async () => {
    settings.mirrorAiAccessToken('');
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
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
    expect(headers[INSTALLATION_ID_HEADER]).toMatch(/^[a-f0-9]{64}$/);
    expect(headers[ACCESS_TOKEN_HEADER]).toBeUndefined();
    expect(freeGenerationsState.grant).toEqual({ status: 'available', remaining: 9 });
  });

  it('does not interpret an absent free-balance response header as zero', async () => {
    mocks.exportCanvasBlob.mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okResponse(new Blob(['result']))));

    const { generateAiImage } = await import('./aiImage');
    const { freeGenerationsState } = await import('$lib/state/freeGenerations.svelte');
    await generateAiImage();

    expect(freeGenerationsState.lastGrantRemaining).toBeNull();
    expect(freeGenerationsState.grant.status).not.toBe('available');
  });
});
