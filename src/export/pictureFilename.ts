// The shipping save's file name: saveNaming.ts DRAWING_BASENAME and savedFile.ts's sortable
// local timestamp. tools/tests/native-picture-save-web.test.mjs holds both to the shipping source.
export const DRAWING_BASENAME = 'splotch';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function pictureTimestamp(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

// saveNaming.ts AI_IMAGE_BASENAME: the AI Result's Download.
export const AI_IMAGE_BASENAME = 'splotch-ai';

type PictureMime = 'image/png' | 'image/jpeg' | 'image/webp';

// What a kept picture is: the drawing's PNG, or an AI picture in the format it arrived in.
export type PictureFormat = Readonly<{ baseName: string; mime: PictureMime }>;
export const DRAWING_PICTURE: PictureFormat = { baseName: DRAWING_BASENAME, mime: 'image/png' };

const EXTENSIONS: Record<PictureMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

export function pictureFilename(date: Date, format: PictureFormat = DRAWING_PICTURE) {
  return `${format.baseName}-${pictureTimestamp(date)}.${EXTENSIONS[format.mime]}`;
}
