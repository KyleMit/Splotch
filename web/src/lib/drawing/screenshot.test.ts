import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exportCanvasBlob: vi.fn(),
  getActiveOverlayImage: vi.fn(() => null),
  isNative: vi.fn(() => false),
  saveBlobToFolder: vi.fn(),
  playPolaroidAnimation: vi.fn(),
}));

vi.mock('./engine', () => ({ exportCanvasBlob: mocks.exportCanvasBlob }));
vi.mock('./overlay', () => ({ getActiveOverlayImage: mocks.getActiveOverlayImage }));
vi.mock('$lib/platform', () => ({ getPlatform: vi.fn(), isNative: mocks.isNative }));
vi.mock('./folderSave', () => ({ saveBlobToFolder: mocks.saveBlobToFolder }));
vi.mock('./polaroidAnimation', () => ({ playPolaroidAnimation: mocks.playPolaroidAnimation }));

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
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:polaroid');
});

const appCssPath = '../../app.css';
const polaroidSourcePath = './polaroidAnimation.ts';

describe('polaroid animation', () => {
  it('keeps the CSS animation duration aligned with overlay teardown', () => {
    const css = readFileSync(new URL(appCssPath, import.meta.url), 'utf8');
    const polaroidSource = readFileSync(new URL(polaroidSourcePath, import.meta.url), 'utf8');
    const animation = css.match(
      /\.polaroid-frame\s*\{[^}]*\banimation:\s*polaroid-show\s+(\d+(?:\.\d+)?)s\b/
    );
    const teardownDuration = polaroidSource.match(/\bconst POLAROID_DURATION_MS = (\d+);/);

    expect(animation, '.polaroid-frame declares the polaroid-show animation').not.toBeNull();
    expect(teardownDuration, 'polaroid teardown declares POLAROID_DURATION_MS').not.toBeNull();
    expect(Number(animation![1]) * 1000).toBe(Number(teardownDuration![1]));
  });
});

describe('saveScreenshot', () => {
  it('coalesces overlapping saves and permits a later save after persistence settles', async () => {
    const save = deferred<boolean>();
    mocks.exportCanvasBlob.mockResolvedValue(new Blob(['drawing']));
    mocks.saveBlobToFolder.mockReturnValueOnce(save.promise).mockResolvedValueOnce(true);
    const { saveScreenshot } = await import('./screenshot');

    const first = saveScreenshot();
    const second = saveScreenshot();

    expect(second).toBe(first);
    await vi.waitFor(() => expect(mocks.saveBlobToFolder).toHaveBeenCalledOnce());
    expect(mocks.exportCanvasBlob).toHaveBeenCalledOnce();
    expect(mocks.playPolaroidAnimation).toHaveBeenCalledOnce();

    save.resolve(true);
    await first;
    await saveScreenshot();

    expect(mocks.exportCanvasBlob).toHaveBeenCalledTimes(2);
    expect(mocks.saveBlobToFolder).toHaveBeenCalledTimes(2);
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
