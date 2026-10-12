// Save outcomes and file basenames. Startup-path modules (state/saveFailure.svelte.ts,
// drawing/saveOnDelete.ts) import this at runtime, and the bundler groups modules by the set of
// entry chunks that reach them: a runtime import from the lazily loaded drawing/imageSave.ts moves
// this module out of its startup chunk into one of its own, an extra request on the startup
// modulepreload list. So imageSave.ts takes only types from here, which saveNaming.test.ts
// enforces, and save-time helpers live in savedFile.ts.

// 'denied' is a native save the OS refused for want of a photo-library or storage permission, which
// only the parent can grant in the device's Settings; 'failed' is every other save that did not land.
export type SaveResult =
  | { status: 'photos' | 'downloads' | 'denied' | 'failed' }
  | { status: 'chosenFolder'; folderName: string };

export type UnsavedStatus = Extract<SaveResult['status'], 'denied' | 'failed'>;

export function isUnsavedStatus(status: unknown): status is UnsavedStatus {
  return status === 'denied' || status === 'failed';
}

export function isUnsaved(result: SaveResult): result is { status: UnsavedStatus } {
  return isUnsavedStatus(result.status);
}

export const DRAWING_BASENAME = 'splotch';
export const AI_IMAGE_BASENAME = 'splotch-ai';
