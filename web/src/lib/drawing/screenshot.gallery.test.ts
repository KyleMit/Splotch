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

    expect(saved).toBe(true);
    expect(mocks.saveToAndroidGallery).toHaveBeenCalledWith(dataUrl, 'image/png', 'splotch-ai');
    expect(mocks.savePhoto).not.toHaveBeenCalled();
  });

  it('keeps iOS on the Media plugin camera-roll save', async () => {
    mocks.getPlatform.mockReturnValue('ios');
    const { saveImageBlob } = await import('./screenshot');

    const saved = await saveImageBlob(blob);

    expect(saved).toBe(true);
    expect(mocks.savePhoto).toHaveBeenCalledWith({ path: dataUrl });
    expect(mocks.saveToAndroidGallery).not.toHaveBeenCalled();
  });

  it('reports an Android save that the photo library rejects as not saved', async () => {
    mocks.getPlatform.mockReturnValue('android');
    const failure = new Error('Saving the image to the photo library failed');
    mocks.saveToAndroidGallery.mockRejectedValue(failure);
    const { saveImageBlob } = await import('./screenshot');

    const saved = await saveImageBlob(blob);

    expect(saved).toBe(false);
    expect(console.error).toHaveBeenCalledWith('Save to gallery failed:', failure);
  });
});
