import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  isNative: vi.fn(() => false),
  saveToAndroidGallery: vi.fn(),
  savePhoto: vi.fn(),
  saveBlobToFolder: vi.fn(),
  triggerDownload: vi.fn(),
  perfMarks: false,
}));

vi.mock('$lib/platform', () => ({ getPlatform: mocks.getPlatform, isNative: mocks.isNative }));
vi.mock('./androidGallery', () => ({ saveToAndroidGallery: mocks.saveToAndroidGallery }));
vi.mock('@capacitor-community/media', () => ({ Media: { savePhoto: mocks.savePhoto } }));
vi.mock('./folderSave', () => ({ saveBlobToFolder: mocks.saveBlobToFolder }));
vi.mock('$lib/savedFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/savedFile')>()),
  triggerDownload: mocks.triggerDownload,
}));
vi.mock('./perf', () => ({
  get PERF_MARKS() {
    return mocks.perfMarks;
  },
}));

const blob = new Blob(['image'], { type: 'image/png' });
const dataUrl = 'data:image/png;base64,aW1hZ2U=';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.perfMarks = false;
  mocks.isNative.mockReturnValue(false);
  mocks.getPlatform.mockReturnValue('ios');
  mocks.saveToAndroidGallery.mockResolvedValue(undefined);
  mocks.savePhoto.mockResolvedValue({ identifier: 'photo' });
  delete window.__screenshotSaveSink;
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:download');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('saveImageBlob', () => {
  it('uses the instrumented native persistence sink without reaching the media plugin', async () => {
    const sink = vi.fn();
    mocks.perfMarks = true;
    mocks.isNative.mockReturnValue(true);
    window.__screenshotSaveSink = sink;
    const { saveImageBlob } = await import('./imageSave');

    await expect(saveImageBlob(blob, 'splotch-test')).resolves.toEqual({ status: 'photos' });

    expect(sink).toHaveBeenCalledWith(blob, 'splotch-test');
    expect(mocks.savePhoto).not.toHaveBeenCalled();
    expect(mocks.saveBlobToFolder).not.toHaveBeenCalled();
  });

  it('uses the blob MIME type for web filenames', async () => {
    mocks.saveBlobToFolder.mockResolvedValue('Drawings');
    const { saveImageBlob } = await import('./imageSave');

    await expect(
      saveImageBlob(new Blob(['image'], { type: 'image/webp' }), 'splotch-ai')
    ).resolves.toEqual({ status: 'chosenFolder', folderName: 'Drawings' });

    expect(mocks.saveBlobToFolder).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.stringMatching(/^splotch-ai-.+\.webp$/),
      undefined
    );
    expect(mocks.triggerDownload).not.toHaveBeenCalled();
  });

  it('falls back to a download and revokes the object URL when no folder takes the blob', async () => {
    mocks.saveBlobToFolder.mockResolvedValue(null);
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { saveImageBlob } = await import('./imageSave');

    const saved = await saveImageBlob(blob, 'splotch');

    expect(saved).toEqual({ status: 'downloads' });
    expect(mocks.triggerDownload).toHaveBeenCalledWith(
      'blob:download',
      expect.stringMatching(/^splotch-.+\.png$/)
    );
    expect(revoke).toHaveBeenCalledWith('blob:download');
  });

  it('reports a failed native gallery save instead of claiming it landed', async () => {
    mocks.isNative.mockReturnValue(true);
    mocks.savePhoto.mockRejectedValue(new Error('User denied access'));
    const { saveImageBlob } = await import('./imageSave');

    await expect(saveImageBlob(blob, 'splotch')).resolves.toEqual({ status: 'failed' });
    expect(mocks.saveBlobToFolder).not.toHaveBeenCalled();
  });

  it('reports a native gallery save as saved to photos', async () => {
    mocks.isNative.mockReturnValue(true);
    const { saveImageBlob } = await import('./imageSave');

    await expect(saveImageBlob(blob, 'splotch')).resolves.toEqual({ status: 'photos' });
  });
});

describe('retryImageSave', () => {
  it('lets a banner retry re-confirm a lapsed folder permission like the camera button', async () => {
    const held = new Blob(['held'], { type: 'image/png' });
    mocks.saveBlobToFolder.mockResolvedValue('Drawings');
    const { retryImageSave } = await import('./imageSave');

    await expect(retryImageSave(held, 'splotch-ai')).resolves.toEqual({
      status: 'chosenFolder',
      folderName: 'Drawings',
    });
    expect(mocks.saveBlobToFolder).toHaveBeenCalledWith(
      held,
      expect.stringMatching(/^splotch-ai-.+\.png$/),
      { allowPrompt: true }
    );
  });
});

describe('saveImageBlob native gallery routing', () => {
  beforeEach(() => {
    mocks.isNative.mockReturnValue(true);
  });

  it('saves Android images through the shared-Pictures module, not the Media plugin', async () => {
    mocks.getPlatform.mockReturnValue('android');
    const { saveImageBlob } = await import('./imageSave');

    const saved = await saveImageBlob(blob, 'splotch-ai');

    expect(saved).toEqual({ status: 'photos' });
    expect(mocks.saveToAndroidGallery).toHaveBeenCalledWith(dataUrl, 'image/png', 'splotch-ai');
    expect(mocks.savePhoto).not.toHaveBeenCalled();
  });

  it('keeps iOS on the Media plugin camera-roll save', async () => {
    mocks.getPlatform.mockReturnValue('ios');
    const { saveImageBlob } = await import('./imageSave');

    const saved = await saveImageBlob(blob, 'splotch');

    expect(saved).toEqual({ status: 'photos' });
    expect(mocks.savePhoto).toHaveBeenCalledWith({ path: dataUrl });
    expect(mocks.saveToAndroidGallery).not.toHaveBeenCalled();
  });

  it('reports an Android save that the photo library rejects as not saved', async () => {
    mocks.getPlatform.mockReturnValue('android');
    const failure = new Error('Saving the image to the photo library failed');
    mocks.saveToAndroidGallery.mockRejectedValue(failure);
    const { saveImageBlob } = await import('./imageSave');

    const saved = await saveImageBlob(blob, 'splotch');

    expect(saved).toEqual({ status: 'failed' });
    expect(console.error).toHaveBeenCalledWith('Save to gallery failed:', failure);
  });

  it.each([
    ['android', 'saveToAndroidGallery'],
    ['ios', 'savePhoto'],
  ] as const)(
    'reports a %s save refused for a permission as denied',
    async (platform, nativeSave) => {
      mocks.getPlatform.mockReturnValue(platform);
      mocks[nativeSave].mockRejectedValue(
        Object.assign(new Error('Access to photos not allowed by user'), { code: 'accessDenied' })
      );
      const { saveImageBlob } = await import('./imageSave');

      await expect(saveImageBlob(blob, 'splotch')).resolves.toEqual({ status: 'denied' });
    }
  );

  it('reports any other rejection code as failed', async () => {
    mocks.getPlatform.mockReturnValue('ios');
    mocks.savePhoto.mockRejectedValue(
      Object.assign(new Error('Unable to save image to album'), { code: 'filesystemError' })
    );
    const { saveImageBlob } = await import('./imageSave');

    await expect(saveImageBlob(blob, 'splotch')).resolves.toEqual({ status: 'failed' });
  });
});

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('the native access-denied rejection code', () => {
  it('matches the code both native save paths reject with', async () => {
    const { ACCESS_DENIED_ERROR_CODE } = await import('./imageSave');
    const android = sourceFile(
      '../../../../android/app/src/main/java/art/splotch/app/PhotoLibraryPlugin.java'
    );
    const ios = sourceFile(
      '../../../../node_modules/@capacitor-community/media/ios/Sources/MediaPlugin/MediaPlugin.swift'
    );

    expect(android).toContain(`ERROR_ACCESS_DENIED = "${ACCESS_DENIED_ERROR_CODE}";`);
    expect(ios).toContain(`EC_ACCESS_DENIED = "${ACCESS_DENIED_ERROR_CODE}"`);
    expect(ios).toMatch(
      /func savePhoto[\s\S]*?checkAuthorization\(permission: \.addOnly[\s\S]*?call\.reject\([^)]*EC_ACCESS_DENIED\)/
    );
  });
});
