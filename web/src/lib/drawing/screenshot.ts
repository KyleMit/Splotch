import type { MediaPlugin } from '@capacitor-community/media';
import { exportCanvasBlob, type CanvasExportPreparation } from './engine';
import { isNative, getPlatform } from '$lib/platform';
import {
  DRAWING_BASENAME,
  extensionForImageType,
  timestamp,
  triggerDownload,
} from '$lib/saveNaming';
import { saveBlobToFolder } from './folderSave';
import { playScreenshotFeedback, playScreenshotSuppressedFeedback } from './screenshotFeedback';
import { SCREENSHOT_COOLDOWN_MS } from './screenshotTiming';
import { PERF_MARKS } from './perf';
import { createPolaroidPreviewRequest } from './polaroidAnimation';

const ALBUM_NAME = 'Splotch';

let activeScreenshotSave: Promise<void> | null = null;
let nextScreenshotAllowedAt = 0;
let preparedScreenshot: PreparedScreenshot | null = null;

type ExportResult = { blob: Blob | null; error?: never } | { blob?: never; error: unknown };

interface PreparedScreenshot {
  activate(): void;
  cancel(): void;
  result: Promise<ExportResult>;
}

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
    if (PERF_MARKS && window.__screenshotSaveSink) {
      await window.__screenshotSaveSink(blob, baseName);
      return true;
    }
    try {
      await saveToGallery(blob, baseName);
      return true;
    } catch (err) {
      console.error('Save to gallery failed:', err);
      return false;
    }
  } else {
    const filename = `${baseName}-${timestamp()}.${extensionForImageType(blob.type)}`;
    if (await saveBlobToFolder(blob, filename, opts)) return true;
    const url = URL.createObjectURL(blob);
    triggerDownload(url, filename);
    URL.revokeObjectURL(url);
    return true;
  }
}

function createPreparedScreenshot(
  exportPreparation: CanvasExportPreparation | null = null
): PreparedScreenshot {
  const preview = createPolaroidPreviewRequest();
  let activated = false;
  let cancelled = false;
  let pendingPreview: ImageBitmap | null = null;
  const deferredPreview = preview
    ? {
        width: preview.width,
        onReady(bitmap: ImageBitmap) {
          if (cancelled) {
            bitmap.close();
          } else if (activated) {
            preview.onReady(bitmap);
          } else {
            pendingPreview?.close();
            pendingPreview = bitmap;
          }
        },
      }
    : null;
  const exportOptions = deferredPreview ? { preview: deferredPreview } : undefined;
  const result = (
    exportPreparation?.complete(exportOptions) ?? exportCanvasBlob(exportOptions)
  ).then(
    (blob): ExportResult => ({ blob }),
    (error): ExportResult => ({ error })
  );
  return {
    activate() {
      if (cancelled || activated) return;
      activated = true;
      playScreenshotFeedback();
      if (pendingPreview) {
        const bitmap = pendingPreview;
        pendingPreview = null;
        preview?.onReady(bitmap);
      }
    },
    cancel() {
      if (activated || cancelled) return;
      cancelled = true;
      pendingPreview?.close();
      pendingPreview = null;
    },
    result,
  };
}

export function prepareScreenshot(exportPreparation: CanvasExportPreparation | null = null) {
  if (activeScreenshotSave || performance.now() < nextScreenshotAllowedAt || preparedScreenshot) {
    exportPreparation?.cancel();
    return;
  }
  preparedScreenshot = createPreparedScreenshot(exportPreparation);
}

export function cancelScreenshotPreparation() {
  preparedScreenshot?.cancel();
  preparedScreenshot = null;
}

async function savePreparedScreenshot(prepared: PreparedScreenshot) {
  prepared.activate();
  const result = await prepared.result;
  if ('error' in result) throw result.error;
  if (!result.blob) return false;
  return saveImageBlob(result.blob, undefined, { allowPrompt: true });
}

export function saveScreenshot(): Promise<void> {
  if (activeScreenshotSave) {
    cancelScreenshotPreparation();
    playScreenshotSuppressedFeedback();
    return activeScreenshotSave;
  }
  const startedAt = performance.now();
  if (startedAt < nextScreenshotAllowedAt) {
    cancelScreenshotPreparation();
    playScreenshotSuppressedFeedback();
    return Promise.resolve();
  }
  const prepared = preparedScreenshot ?? createPreparedScreenshot();
  preparedScreenshot = null;
  activeScreenshotSave = savePreparedScreenshot(prepared)
    .then((saved) => {
      if (saved) nextScreenshotAllowedAt = performance.now() + SCREENSHOT_COOLDOWN_MS;
    })
    .finally(() => {
      activeScreenshotSave = null;
    });
  return activeScreenshotSave;
}
