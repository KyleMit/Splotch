import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  getActiveOverlayImage: vi.fn(() => null),
  isNative: vi.fn(() => false),
  saveBlobToFolder: vi.fn(),
  playScreenshotFeedback: vi.fn(),
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('./overlay', () => ({ getActiveOverlayImage: mocks.getActiveOverlayImage }));
vi.mock('$lib/platform', () => ({ getPlatform: vi.fn(), isNative: mocks.isNative }));
vi.mock('./folderSave', () => ({ saveBlobToFolder: mocks.saveBlobToFolder }));
vi.mock('./screenshotFeedback', () => ({
  playScreenshotFeedback: mocks.playScreenshotFeedback,
}));
vi.mock('./screenshotTiming', () => ({ SCREENSHOT_COOLDOWN_MS: 4_000 }));

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

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:polaroid');
});

describe('saveScreenshot', () => {
  it('starts lightweight capture feedback before the PNG export settles', async () => {
    const exported = deferred<Blob | null>();
    mocks.exportCanvasBlob.mockReturnValue(exported.promise);
    const { saveScreenshot } = await import('./screenshot');

    const save = saveScreenshot();

    expect(mocks.playScreenshotFeedback).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledWith();
    expect(mocks.saveBlobToFolder).not.toHaveBeenCalled();

    exported.resolve(null);
    await save;
  });

  it('coalesces overlapping saves and permits a later save after persistence settles', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
    const save = deferred<boolean>();
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockReturnValueOnce(save.promise).mockResolvedValueOnce(true);
    const { saveScreenshot } = await import('./screenshot');

    const first = saveScreenshot();
    const second = saveScreenshot();

    expect(second).toBe(first);
    await vi.waitFor(() => expect(mocks.saveBlobToFolder).toHaveBeenCalledOnce());
    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    expect(mocks.playScreenshotFeedback).toHaveBeenCalledOnce();

    save.resolve(true);
    await first;
    now.mockReturnValue(5_000);
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
  it('uses the blob MIME type for web filenames', async () => {
    mocks.saveBlobToFolder.mockResolvedValue(true);
    const { saveImageBlob } = await import('./screenshot');

    await saveImageBlob(new Blob(['image'], { type: 'image/webp' }), 'splotch-ai');

    expect(mocks.saveBlobToFolder).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^splotch-ai-.+\.webp$/),
      undefined
    );
  });
});
