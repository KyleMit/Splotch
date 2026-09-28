import { exportCanvasBlob, type CanvasExportPreparation } from './engine';
import { DRAWING_BASENAME, isUnsaved, type SaveResult, type UnsavedStatus } from '$lib/saveNaming';
import { reportSaveFailure } from '$lib/state/saveFailure.svelte';
import { saveImageBlob } from './imageSave';
import { playScreenshotFeedback, playScreenshotSuppressedFeedback } from './screenshotFeedback';
import { SCREENSHOT_COOLDOWN_MS } from './screenshotTiming';
import { createPolaroidPreviewRequest } from './polaroidAnimation';

let activeScreenshotSave: Promise<void> | null = null;
let nextScreenshotAllowedAt = 0;
let preparedScreenshot: PreparedScreenshot | null = null;

type ExportResult = { blob: Blob | null; error?: never } | { blob?: never; error: unknown };

interface PreparedScreenshot {
  activate(): Promise<ExportResult>;
  cancel(): void;
  discardPreview(): void;
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
