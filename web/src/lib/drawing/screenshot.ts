import { exportCanvasBlob, type CanvasExportPreparation } from './engine';
import { isNative, getPlatform } from '$lib/platform';
import {
  DRAWING_BASENAME,
  extensionForImageType,
  timestamp,
  isUnsaved,
  triggerDownload,
  type SaveResult,
  type UnsavedStatus,
} from '$lib/saveNaming';
import { reportSaveFailure } from '$lib/state/saveFailure.svelte';
import { saveBlobToFolder } from './folderSave';
import { playScreenshotFeedback, playScreenshotSuppressedFeedback } from './screenshotFeedback';
import { SCREENSHOT_COOLDOWN_MS } from './screenshotTiming';
import { PERF_MARKS } from './perf';
import { createPolaroidPreviewRequest } from './polaroidAnimation';

let activeScreenshotSave: Promise<void> | null = null;
let nextScreenshotAllowedAt = 0;
let preparedScreenshot: PreparedScreenshot | null = null;

// The code both native save paths reject with when the OS withholds the permission: iOS through
// @capacitor-community/media, Android 7–9 through PhotoLibraryPlugin.java. screenshot.test.ts reads
// both native sources to hold them to it.
export const ACCESS_DENIED_ERROR_CODE = 'accessDenied';

type ExportResult = { blob: Blob | null; error?: never } | { blob?: never; error: unknown };

interface PreparedScreenshot {
  activate(): Promise<ExportResult>;
  cancel(): void;
  discardPreview(): void;
}

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
async function saveToGallery(blob: Blob, baseName = DRAWING_BASENAME) {
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
  baseName = DRAWING_BASENAME,
  opts?: { allowPrompt?: boolean }
): Promise<SaveResult> {
  // __IS_CAPACITOR__ makes the gallery path compile-time dead on web so Rollup
  // drops the media plugin chunk (isNative() alone can't tree-shake across modules).
  if (__IS_CAPACITOR__ && isNative()) {
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

function createPreparedScreenshot(
  exportPreparation: CanvasExportPreparation | null = null
): PreparedScreenshot {
  const preview = createPolaroidPreviewRequest();
  const exportOptions = preview ? { preview } : undefined;
  return {
    activate() {
      playScreenshotFeedback();
      return (exportPreparation?.complete(exportOptions) ?? exportCanvasBlob(exportOptions)).then(
        (blob): ExportResult => ({ blob }),
        (error): ExportResult => ({ error })
      );
    },
    cancel() {
      exportPreparation?.cancel();
    },
    discardPreview() {
      preview?.discard();
    },
  };
}

export function prepareScreenshot(prepareExport: () => CanvasExportPreparation | null) {
  if (activeScreenshotSave || performance.now() < nextScreenshotAllowedAt) return;
  preparedScreenshot?.cancel();
  preparedScreenshot = createPreparedScreenshot(prepareExport());
}

export function cancelScreenshotPreparation() {
  preparedScreenshot?.cancel();
  preparedScreenshot = null;
}

interface ScreenshotSave {
  result: SaveResult;
  blob: Blob | null;
}

async function savePreparedScreenshot(prepared: PreparedScreenshot): Promise<ScreenshotSave> {
  const exported = await prepared.activate();
  if ('error' in exported) throw exported.error;
  if (!exported.blob) return { result: { status: 'failed' }, blob: null };
  const result = await saveImageBlob(exported.blob, DRAWING_BASENAME, { allowPrompt: true });
  return { result, blob: exported.blob };
}

// The capture cue and polaroid start on the tap so the toddler sees an instant response; a save
// that turns out not to land takes the polaroid back and shakes the camera instead of letting the
// flight finish as if the picture were kept. The shake is for the child; the parent's explanation
// and the retry go to the save-failure banner, carrying the captured picture when there is one.
function showScreenshotFailed(
  prepared: PreparedScreenshot,
  status: UnsavedStatus,
  blob: Blob | null
) {
  prepared.discardPreview();
  playScreenshotSuppressedFeedback();
  void reportSaveFailure(status, blob && { blob, baseName: DRAWING_BASENAME });
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
    .then(
      ({ result, blob }) => {
        if (isUnsaved(result)) return showScreenshotFailed(prepared, result.status, blob);
        nextScreenshotAllowedAt = performance.now() + SCREENSHOT_COOLDOWN_MS;
      },
      (error: unknown) => {
        showScreenshotFailed(prepared, 'failed', null);
        throw error;
      }
    )
    .finally(() => {
      activeScreenshotSave = null;
    });
  return activeScreenshotSave;
}
