// 'denied' is a native save the OS refused for want of a photo-library or storage permission, which
// only the parent can grant in the device's Settings; 'failed' is every other save that did not land.
export type SaveResult =
  | { status: 'photos' | 'downloads' | 'denied' | 'failed' }
  | { status: 'chosenFolder'; folderName: string };

export const DRAWING_BASENAME = 'splotch';
export const AI_IMAGE_BASENAME = 'splotch-ai';
