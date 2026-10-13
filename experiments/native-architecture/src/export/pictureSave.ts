// Where a kept picture goes: the device's photo library on Android and iOS, and a downloaded PNG
// on the web, as the shipping Screenshot Button saves (drawing/imageSave.ts). 'unavailable' is
// Android below 11, where this app cannot write to the gallery at all.
export type PictureSaveOutcome = 'photos' | 'downloads' | 'denied' | 'failed' | 'unavailable';
export type PictureSave = Readonly<{
  save: (pngBase64: string) => Promise<PictureSaveOutcome>;
}>;
export type SaveOs = 'ios' | 'android' | 'web';

// The heading and details are the shipping Save Failure Banner's words
// (web/src/lib/drawing/saveFailureCopy.ts); tools/tests/native-photo-library.test.mjs
// holds them equal.
export const UNSAVED_HEADING = "Your picture wasn't saved";
export const PERMISSION_DETAIL: Record<Exclude<SaveOs, 'web'>, string> = {
  ios: 'Splotch needs permission to add pictures to Photos. Turn it on in Settings, then try again.',
  android:
    'Splotch needs storage permission to save to your gallery. Turn it on in Settings, then try again.',
};
export const FAILED_DETAIL = 'Something went wrong while saving. Try again in a moment.';
// The shipping app has no wording for this: its Android 7-9 saves fall back to app-specific
// media storage instead of failing.
export const UNAVAILABLE_DETAIL = 'Saving to your gallery needs Android 11 or later.';

const SAVED_NOTICE: Record<SaveOs, string> = {
  ios: 'Picture saved to Photos.',
  android: 'Picture saved to your gallery.',
  web: 'Picture downloaded.',
};

// A save that did not land is a failure, not news: the drawing screen shows it in the Save
// Failure Banner.
export type SaveFailure = Readonly<{ heading: string; detail: string }>;

function failureDetail(outcome: PictureSaveOutcome, os: SaveOs) {
  if (outcome === 'unavailable') return UNAVAILABLE_DETAIL;
  return outcome === 'denied' && os !== 'web' ? PERMISSION_DETAIL[os] : FAILED_DETAIL;
}

export function pictureSaveFailure(outcome: PictureSaveOutcome, os: SaveOs): SaveFailure | null {
  if (outcome === 'photos' || outcome === 'downloads') return null;
  return { heading: UNSAVED_HEADING, detail: failureDetail(outcome, os) };
}

export function pictureSaveNotice(outcome: PictureSaveOutcome, os: SaveOs): string {
  const failure = pictureSaveFailure(outcome, os);
  return failure ? `${failure.heading}. ${failure.detail}` : SAVED_NOTICE[os];
}
