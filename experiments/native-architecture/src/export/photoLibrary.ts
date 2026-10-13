export type PhotoLibraryOutcome = 'photos' | 'denied' | 'failed' | 'unavailable';
export type PhotoLibrary = Readonly<{ save: (pngBase64: string) => Promise<PhotoLibraryOutcome> }>;
export type PhotoLibraryOs = 'ios' | 'android';

// The heading and details are the shipping Save Failure Banner's words
// (web/src/lib/drawing/saveFailureCopy.ts); tools/tests/native-photo-library.test.mjs
// holds them equal.
export const UNSAVED_HEADING = "Your picture wasn't saved";
export const PERMISSION_DETAIL: Record<PhotoLibraryOs, string> = {
  ios: 'Splotch needs permission to add pictures to Photos. Turn it on in Settings, then try again.',
  android:
    'Splotch needs storage permission to save to your gallery. Turn it on in Settings, then try again.',
};
export const FAILED_DETAIL = 'Something went wrong while saving. Try again in a moment.';

const LIBRARY_NAME: Record<PhotoLibraryOs, string> = { ios: 'Photos', android: 'your gallery' };
export const IN_APP_SAVED_NOTICE = 'Picture saved on this device.';
const IN_APP_KEPT = "A copy is kept in this app's Pictures.";

// Only Android below 11 reports 'unavailable'. The shipping app has no wording for it: its
// Android 7-9 saves fall back to app-specific media storage instead of failing.
const UNAVAILABLE_NOTICE = `${IN_APP_SAVED_NOTICE} Saving to your gallery needs Android 11 or later.`;

export function photoLibraryNotice(outcome: PhotoLibraryOutcome, os: PhotoLibraryOs): string {
  if (outcome === 'photos') return `Picture saved to ${LIBRARY_NAME[os]} and on this device.`;
  if (outcome === 'unavailable') return UNAVAILABLE_NOTICE;
  const detail = outcome === 'denied' ? PERMISSION_DETAIL[os] : FAILED_DETAIL;
  return `${UNSAVED_HEADING} to ${LIBRARY_NAME[os]}. ${detail} ${IN_APP_KEPT}`;
}
