import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  isNative: vi.fn(() => false),
  saveBlobToFolder: vi.fn(),
  playScreenshotFeedback: vi.fn(),
  playScreenshotSuppressedFeedback: vi.fn(),
  createPolaroidPreviewRequest: vi.fn(),
  triggerDownload: vi.fn(),
  perfMarks: false,
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('$lib/platform', () => ({ getPlatform: vi.fn(), isNative: mocks.isNative }));
vi.mock('./folderSave', () => ({ saveBlobToFolder: mocks.saveBlobToFolder }));
vi.mock('./screenshotFeedback', () => ({
  playScreenshotFeedback: mocks.playScreenshotFeedback,
  playScreenshotSuppressedFeedback: mocks.playScreenshotSuppressedFeedback,
}));
vi.mock('./polaroidAnimation', () => ({
  createPolaroidPreviewRequest: mocks.createPolaroidPreviewRequest,
}));
vi.mock('$lib/saveNaming', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/saveNaming')>()),
  triggerDownload: mocks.triggerDownload,
}));
vi.mock('./screenshotTiming', () => ({ SCREENSHOT_COOLDOWN_MS: 4_000 }));
vi.mock('./perf', () => ({
  get PERF_MARKS() {
    return mocks.perfMarks;
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.perfMarks = false;
  mocks.isNative.mockReturnValue(false);
  mocks.createPolaroidPreviewRequest.mockReturnValue(null);
  delete window.__screenshotSaveSink;
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:polaroid');
});

describe('saveScreenshot', () => {
  it('starts lightweight capture feedback before the PNG export settles', async () => {
    const exported = Promise.withResolvers<Blob | null>();
    mocks.exportCanvasBlob.mockReturnValue(exported.promise);
    const { saveScreenshot } = await import('./screenshot');

    const save = saveScreenshot();

    expect(mocks.playScreenshotFeedback).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledWith();
    expect(mocks.saveBlobToFolder).not.toHaveBeenCalled();
    expect(mocks.createPolaroidPreviewRequest).toHaveBeenCalledOnce();

    exported.resolve(null);
    await save;

    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['retry']));
    mocks.saveBlobToFolder.mockResolvedValue(true);
    await saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledTimes(2);
    expect(mocks.createPolaroidPreviewRequest).toHaveBeenCalledTimes(2);
    expect(mocks.playScreenshotSuppressedFeedback).not.toHaveBeenCalled();
  });

  it('requests the worker preview alongside the settled export snapshot', async () => {
    const preview = { width: 640, onReady: vi.fn() };
    mocks.createPolaroidPreviewRequest.mockReturnValue(preview);
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { saveScreenshot } = await import('./screenshot');

    await saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledWith({
      preview: { width: preview.width, onReady: expect.any(Function) },
    });
  });

  it('starts export at press time and defers feedback until activation', async () => {
    const exported = Promise.withResolvers<Blob | null>();
    const onReady = vi.fn();
    const preview = { width: 640, onReady };
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    mocks.createPolaroidPreviewRequest.mockReturnValue(preview);
    mocks.exportCanvasBlob.mockReturnValue(exported.promise);
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { prepareScreenshot, saveScreenshot } = await import('./screenshot');

    prepareScreenshot();
    const deferredPreview = mocks.exportCanvasBlob.mock.calls[0][0]?.preview;
    deferredPreview?.onReady(bitmap);

    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotFeedback).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();

    const save = saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledOnce();
    expect(onReady).toHaveBeenCalledWith(bitmap);
    exported.resolve(new Blob(['drawing']));
    await save;
  });

  it('completes a synchronously captured engine export instead of recapturing at activation', async () => {
    const blob = new Blob(['drawing']);
    const complete = vi.fn(async () => blob);
    const cancel = vi.fn();
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { prepareScreenshot, saveScreenshot } = await import('./screenshot');

    prepareScreenshot(() => ({ complete, cancel }));
    await saveScreenshot();

    expect(complete).toHaveBeenCalledOnce();
    expect(mocks.exportCanvasBlob).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not capture a preparation while a save is in flight', async () => {
    const exported = Promise.withResolvers<Blob | null>();
    const prepareExport = vi.fn();
    mocks.exportCanvasBlob.mockReturnValue(exported.promise);
    const { prepareScreenshot, saveScreenshot } = await import('./screenshot');

    const save = saveScreenshot();
    prepareScreenshot(prepareExport);

    expect(prepareExport).not.toHaveBeenCalled();
    exported.resolve(null);
    await save;
  });

  it('does not capture a preparation during the post-save cooldown', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const prepareExport = vi.fn();
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { prepareScreenshot, saveScreenshot } = await import('./screenshot');

    await saveScreenshot();
    now.mockReturnValue(4_999);
    prepareScreenshot(prepareExport);

    expect(prepareExport).not.toHaveBeenCalled();
  });

  it('discards a cancelled press preview and exports again on activation', async () => {
    const firstExport = Promise.withResolvers<Blob | null>();
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;
    mocks.createPolaroidPreviewRequest.mockReturnValue({ width: 640, onReady: vi.fn() });
    mocks.exportCanvasBlob
      .mockReturnValueOnce(firstExport.promise)
      .mockResolvedValueOnce(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { cancelScreenshotPreparation, prepareScreenshot, saveScreenshot } =
      await import('./screenshot');

    prepareScreenshot();
    mocks.exportCanvasBlob.mock.calls[0][0]?.preview?.onReady(bitmap);
    cancelScreenshotPreparation();
    await saveScreenshot();

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(mocks.exportCanvasBlob).toHaveBeenCalledTimes(2);
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledOnce();
    firstExport.resolve(null);
  });

  it('coalesces overlapping saves and permits a later save after persistence settles', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const save = Promise.withResolvers<boolean>();
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockReturnValueOnce(save.promise).mockResolvedValueOnce(true);
    const { saveScreenshot } = await import('./screenshot');

    const first = saveScreenshot();
    const second = saveScreenshot();

    expect(second).toBe(first);
    await vi.waitFor(() => expect(mocks.saveBlobToFolder).toHaveBeenCalledOnce());
    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotSuppressedFeedback).toHaveBeenCalledOnce();

    now.mockReturnValue(3_000);
    save.resolve(true);
    await first;
    now.mockReturnValue(6_999);
    await saveScreenshot();
    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    now.mockReturnValue(7_000);
    await saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledTimes(2);
    expect(mocks.saveBlobToFolder).toHaveBeenCalledTimes(2);
  });

  it('suppresses duplicate saves during the post-save cooldown', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { saveScreenshot } = await import('./screenshot');

    await saveScreenshot();
    now.mockReturnValue(4_999);
    await saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotSuppressedFeedback).toHaveBeenCalledOnce();

    now.mockReturnValue(5_000);
    await saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledTimes(2);
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledTimes(2);
  });

  it('clears the active save after a rejection', async () => {
    const error = new Error('export failed');
    mocks.exportCanvasBlob
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { saveScreenshot } = await import('./screenshot');

    await expect(saveScreenshot()).rejects.toThrow(error);
    await saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledTimes(2);
  });
});

describe('saveImageBlob', () => {
  it('uses the instrumented native persistence sink without reaching the media plugin', async () => {
    const sink = vi.fn();
    mocks.perfMarks = true;
    mocks.isNative.mockReturnValue(true);
    window.__screenshotSaveSink = sink;
    const blob = new Blob(['image'], { type: 'image/png' });
    const { saveImageBlob } = await import('./screenshot');

    await saveImageBlob(blob, 'splotch-test');

    expect(sink).toHaveBeenCalledWith(blob, 'splotch-test');
    expect(mocks.saveBlobToFolder).not.toHaveBeenCalled();
  });

  it('uses the blob MIME type for web filenames', async () => {
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { saveImageBlob } = await import('./screenshot');

    await saveImageBlob(new Blob(['image'], { type: 'image/webp' }), 'splotch-ai');

    expect(mocks.saveBlobToFolder).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^splotch-ai-.+\.webp$/),
      undefined
    );
    expect(mocks.triggerDownload).not.toHaveBeenCalled();
  });

  it('falls back to a download and revokes the object URL when no folder takes the blob', async () => {
    mocks.saveBlobToFolder.mockResolvedValue(false);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { saveImageBlob } = await import('./screenshot');

    const saved = await saveImageBlob(new Blob(['image'], { type: 'image/png' }));

    expect(saved).toBe(true);
    expect(mocks.triggerDownload).toHaveBeenCalledWith(
      'blob:polaroid',
      expect.stringMatching(/^splotch-.+\.png$/)
    );
    expect(revoke).toHaveBeenCalledWith('blob:polaroid');
  });
});
