import type { MediaPlugin } from '@capacitor-community/media';
import { exportCanvasBlob } from './engine';
import { getActiveOverlayImage } from './overlay';
import { isNative, getPlatform } from '$lib/platform';
import {
  DRAWING_BASENAME,
  extensionForImageType,
  timestamp,
  triggerDownload,
} from '$lib/saveNaming';
import { saveBlobToFolder } from './folderSave';
import { playPolaroidAnimation } from './polaroidAnimation';

const ALBUM_NAME = 'Splotch';

let activeScreenshotSave: Promise<void> | null = null;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function findAlbumId(Media: MediaPlugin, name: string): Promise<string | undefined> {
  const { albums } = await Media.getAlbums();
  return albums.find((a) => a.name === name)?.identifier;
}

// Native: drop the image blob straight into the device photo library. Android requires
// an album identifier, so we tuck drawings into a "Splotch" album (creating it
// once); iOS saves to the camera roll with add-only permission.
async function saveToGallery(blob: Blob, baseName = DRAWING_BASENAME) {
  const { Media } = await import('@capacitor-community/media');
  const dataUrl = await blobToDataUrl(blob);

  if (getPlatform() === 'android') {
    let albumId = await findAlbumId(Media, ALBUM_NAME);
    if (!albumId) {
      await Media.createAlbum({ name: ALBUM_NAME });
      albumId = await findAlbumId(Media, ALBUM_NAME);
    }
    await Media.savePhoto({
      path: dataUrl,
      albumIdentifier: albumId,
      fileName: `${baseName}-${timestamp()}`,
    });
  } else {
    await Media.savePhoto({ path: dataUrl });
  }
}

// Persist a PNG, WebP, or JPEG blob: native drops it into the photo gallery; the web writes it
// silently into the parent-chosen folder when one is set (File System Access
// API, desktop Chromium), otherwise triggers a file download. The folder is
// optional and decoupled from saving — no folder just means a download.
// `allowPrompt` lets a user-initiated save re-confirm a lapsed folder
// permission; background saves (AI auto-save, save-on-delete) leave it falsy. No
// polaroid animation — the caller owns its own feedback.
export async function saveImageBlob(
  blob: Blob,
  baseName = DRAWING_BASENAME,
  opts?: { allowPrompt?: boolean }
) {
  // __IS_CAPACITOR__ makes the gallery path compile-time dead on web so Rollup
  // drops the media plugin chunk (isNative() alone can't tree-shake across modules).
  if (__IS_CAPACITOR__ && isNative()) {
    try {
      await saveToGallery(blob, baseName);
    } catch (err) {
      console.error('Save to gallery failed:', err);
    }
  } else {
    const filename = `${baseName}-${timestamp()}.${extensionForImageType(blob.type)}`;
    if (await saveBlobToFolder(blob, filename, opts)) return;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    URL.revokeObjectURL(url);
  }
}

async function saveScreenshotImage() {
  const blob = await exportCanvasBlob(getActiveOverlayImage());
  if (!blob) return;
  // Feedback first: the polaroid must not wait behind the folder write — or the
  // permission re-confirm dialog — that saveImageBlob may perform on the web.
  playPolaroidAnimation(URL.createObjectURL(blob));
  await saveImageBlob(blob, undefined, { allowPrompt: true });
}

export function saveScreenshot(): Promise<void> {
  activeScreenshotSave ??= saveScreenshotImage().finally(() => {
    activeScreenshotSave = null;
  });
  return activeScreenshotSave;
}
