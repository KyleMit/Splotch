// The shipping save's file name: saveNaming.ts DRAWING_BASENAME and savedFile.ts's sortable
// local timestamp. tools/tests/native-picture-save-web.test.mjs holds both to the shipping source.
export const DRAWING_BASENAME = 'splotch';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function pictureTimestamp(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function pictureFilename(date: Date) {
  return `${DRAWING_BASENAME}-${pictureTimestamp(date)}.png`;
}
