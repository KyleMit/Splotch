export function timestamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function extensionForImageType(imageType: string) {
  switch (imageType) {
    case 'image/webp':
      return 'webp';
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
    default:
      return 'png';
  }
}

// 'denied' is a native save the OS refused for want of a photo-library or storage permission, which
// only the parent can grant in the device's Settings; 'failed' is every other save that did not land.
export type SaveResult =
  | { status: 'photos' | 'downloads' | 'denied' | 'failed' }
  | { status: 'chosenFolder'; folderName: string };

export type UnsavedStatus = Extract<SaveResult['status'], 'denied' | 'failed'>;

export function isUnsaved(result: SaveResult): result is { status: UnsavedStatus } {
  return result.status === 'denied' || result.status === 'failed';
}

export const DRAWING_BASENAME = 'splotch';
export const AI_IMAGE_BASENAME = 'splotch-ai';
