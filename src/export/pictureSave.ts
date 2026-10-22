import type { PictureFormat } from './pictureFilename';

type ChosenFolderSave = Readonly<{ status: 'chosenFolder'; folderName: string }>;
export type PictureSaveOutcome = 'photos' | 'downloads' | 'denied' | 'failed' | ChosenFolderSave;
export type UnsavedOutcome = Exclude<PictureSaveOutcome, 'photos' | 'downloads' | ChosenFolderSave>;
export type PictureSaveOptions = Readonly<{ allowPrompt: boolean }>;
export type PictureSave = Readonly<{
  save: (
    base64: string,
    format?: PictureFormat,
    options?: PictureSaveOptions
  ) => Promise<PictureSaveOutcome>;
}>;
export type SaveOs = 'ios' | 'android' | 'web';

export function isUnsaved(outcome: PictureSaveOutcome): outcome is UnsavedOutcome {
  return typeof outcome === 'string' && outcome !== 'photos' && outcome !== 'downloads';
}

// The heading and details are the shipping Save Failure Banner's words
// (src/lib/drawing/saveFailureCopy.ts); tools/tests/native-photo-library.test.mjs
// holds every outcome, count and platform equal.
const UNSAVED_HEADING = "Your picture wasn't saved";
const PERMISSION_DETAIL: Record<Exclude<SaveOs, 'web'>, string> = {
  ios: 'Splotch needs permission to add pictures to Photos. Turn it on in Settings, then try again.',
  android:
    'Splotch needs storage permission to save to your gallery. Turn it on in Settings, then try again.',
};
const FAILED_DETAIL = 'Something went wrong while saving. Try again in a moment.';
const UNCAPTURED_DETAIL = 'Something went wrong while saving it.';

export type SaveFailureCopy = Readonly<{ heading: string; detail: string }>;

// Parent-directed and plain: what happened, why when it is known, and the next step. A picture the
// banner is not holding cannot be retried, so its copy offers none.
export function saveFailureCopy(
  outcome: UnsavedOutcome,
  pictureCount: number,
  os: SaveOs
): SaveFailureCopy {
  const heading = pictureCount > 1 ? `${pictureCount} pictures weren't saved` : UNSAVED_HEADING;
  if (outcome === 'denied' && os !== 'web') return { heading, detail: PERMISSION_DETAIL[os] };
  return { heading, detail: pictureCount > 0 ? FAILED_DETAIL : UNCAPTURED_DETAIL };
}
