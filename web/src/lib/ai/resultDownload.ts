import {
  AI_IMAGE_BASENAME,
  extensionForImageType,
  timestamp,
  triggerDownload,
} from '$lib/saveNaming';

// The file a downloaded AI picture lands as: the AI basename, the moment it
// was saved, and the extension its MIME type maps to (falling back the way
// every other save does when the type is unknown).
export function aiResultFileName(imageType: string | null): string {
  return `${AI_IMAGE_BASENAME}-${timestamp()}.${extensionForImageType(imageType ?? '')}`;
}

export function downloadAiResult(url: string, imageType: string | null): void {
  triggerDownload(url, aiResultFileName(imageType));
}
