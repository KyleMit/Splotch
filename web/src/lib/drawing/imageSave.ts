import { isNative, getPlatform } from '$lib/platform';
import type { SaveResult, UnsavedStatus } from '$lib/saveNaming';
import { extensionForImageType, timestamp, triggerDownload } from '$lib/savedFile';
import { saveBlobToFolder } from './folderSave';
import { PERF_MARKS } from './perf';

// The code both native save paths reject with when the OS withholds the permission: iOS through
// @capacitor-community/media, Android 7–9 through PhotoLibraryPlugin.java. imageSave.test.ts reads
// both native sources to hold them to it.
export const ACCESS_DENIED_ERROR_CODE = 'accessDenied';

function unsavedStatusForError(err: unknown): UnsavedStatus {
  const code = typeof err === 'object' && err !== null && 'code' in err ? err.code : undefined;
  return code === ACCESS_DENIED_ERROR_CODE ? 'denied' : 'failed';
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(reader.error ?? new Error('FileReader produced no data URL'));
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Native: drop the image blob straight into the device photo library. Android writes a
// "Splotch" folder in shared Pictures (androidGallery.ts); iOS saves to the camera roll with
// add-only permission.
async function saveToGallery(blob: Blob, baseName: string) {
  const dataUrl = await blobToDataUrl(blob);

  if (getPlatform() === 'android') {
    const { saveToAndroidGallery } = await import('./androidGallery');
    await saveToAndroidGallery(dataUrl, blob.type, baseName);
  } else {
    const { Media } = await import('@capacitor-community/media');
    await Media.savePhoto({ path: dataUrl });
  }
}

// Persist a PNG, WebP, or JPEG blob: native drops it into the photo gallery; the web writes it
// silently into the parent-chosen folder when one is set (File System Access
// API, desktop Chromium), otherwise triggers a file download. The folder is
// optional and decoupled from saving — no folder just means a download.
// `allowPrompt` lets a user-initiated save re-confirm a lapsed folder
// permission; background saves (AI auto-save, save-on-delete) leave it falsy. No
// polaroid animation — the caller owns its own feedback, and words it from the outcome.
export async function saveImageBlob(
  blob: Blob,
  baseName: string,
  opts?: { allowPrompt?: boolean }
): Promise<SaveResult> {
  // __IS_CAPACITOR__ makes the gallery path compile-time dead on web so Rollup
  // drops the media plugin chunk (isNative() alone can't tree-shake across modules).
  if (__IS_CAPACITOR__ && isNative()) {
    // The sink keeps the name the native action runner in tools/perf/ installs it under, but it
    // intercepts every native save here, not only the Screenshot Button's.
    if (PERF_MARKS && window.__screenshotSaveSink) {
      await window.__screenshotSaveSink(blob, baseName);
      return { status: 'photos' };
    }
    try {
      await saveToGallery(blob, baseName);
      return { status: 'photos' };
    } catch (err) {
      console.error('Save to gallery failed:', err);
      return { status: unsavedStatusForError(err) };
    }
  } else {
    const filename = `${baseName}-${timestamp()}.${extensionForImageType(blob.type)}`;
    const folderName = await saveBlobToFolder(blob, filename, opts);
    if (folderName !== null) return { status: 'chosenFolder', folderName };
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    URL.revokeObjectURL(url);
    return { status: 'downloads' };
  }
}

// The save-failure banner's Try again is a tap, so like the camera button it may re-confirm a lapsed
// web folder permission.
export function retryImageSave(blob: Blob, baseName: string): Promise<SaveResult> {
  return saveImageBlob(blob, baseName, { allowPrompt: true });
}
