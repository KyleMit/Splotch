import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlatform: vi.fn(),
  saveToAndroidGallery: vi.fn(),
  savePhoto: vi.fn(),
}));

vi.mock('$lib/platform', () => ({ getPlatform: mocks.getPlatform, isNative: () => true }));
vi.mock('./androidGallery', () => ({ saveToAndroidGallery: mocks.saveToAndroidGallery }));
vi.mock('@capacitor-community/media', () => ({ Media: { savePhoto: mocks.savePhoto } }));
vi.mock('./engine', () => ({ exportCanvasBlob: vi.fn() }));
vi.mock('./folderSave', () => ({ saveBlobToFolder: vi.fn() }));
vi.mock('./screenshotFeedback', () => ({
  playScreenshotFeedback: vi.fn(),
  playScreenshotSuppressedFeedback: vi.fn(),
}));
vi.mock('./polaroidAnimation', () => ({ createPolaroidPreviewRequest: vi.fn() }));

const blob = new Blob(['image'], { type: 'image/png' });
const dataUrl = 'data:image/png;base64,aW1hZ2U=';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.saveToAndroidGallery.mockResolvedValue(undefined);
  mocks.savePhoto.mockResolvedValue({ identifier: 'photo' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('saveImageBlob native gallery routing', () => {
  it('saves Android images through the shared-Pictures module, not the Media plugin', async () => {
    mocks.getPlatform.mockReturnValue('android');
    const { saveImageBlob } = await import('./screenshot');

    const saved = await saveImageBlob(blob, 'splotch-ai');

    expect(saved).toEqual({ status: 'photos' });
    expect(mocks.saveToAndroidGallery).toHaveBeenCalledWith(dataUrl, 'image/png', 'splotch-ai');
    expect(mocks.savePhoto).not.toHaveBeenCalled();
  });

  it('keeps iOS on the Media plugin camera-roll save', async () => {
    mocks.getPlatform.mockReturnValue('ios');
    const { saveImageBlob } = await import('./screenshot');

    const saved = await saveImageBlob(blob);

    expect(saved).toEqual({ status: 'photos' });
    expect(mocks.savePhoto).toHaveBeenCalledWith({ path: dataUrl });
    expect(mocks.saveToAndroidGallery).not.toHaveBeenCalled();
  });

  it('reports an Android save that the photo library rejects as not saved', async () => {
    mocks.getPlatform.mockReturnValue('android');
    const failure = new Error('Saving the image to the photo library failed');
    mocks.saveToAndroidGallery.mockRejectedValue(failure);
    const { saveImageBlob } = await import('./screenshot');

    const saved = await saveImageBlob(blob);

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
      const { saveImageBlob } = await import('./screenshot');

      await expect(saveImageBlob(blob)).resolves.toEqual({ status: 'denied' });
    }
  );

  it('reports any other rejection code as failed', async () => {
    mocks.getPlatform.mockReturnValue('ios');
    mocks.savePhoto.mockRejectedValue(
      Object.assign(new Error('Unable to save image to album'), { code: 'filesystemError' })
    );
    const { saveImageBlob } = await import('./screenshot');

    await expect(saveImageBlob(blob)).resolves.toEqual({ status: 'failed' });
  });
});

// The path stays a parameter so Vite leaves the URL alone (see app.html.test.ts).
function sourceFile(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('the native access-denied rejection code', () => {
  it('matches the code both native save paths reject with', async () => {
    const { ACCESS_DENIED_ERROR_CODE } = await import('./screenshot');
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
