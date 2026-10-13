import { parseDrawing } from '../../experiments/native-architecture/src/drawing/model.ts';

// The app keeps each AI attempt's original drawing and reopens none of them. These read a saved
// original back through the drawing parser, as the AI legacy import reads it, so the fidelity of
// what a save writes stays checked.
export async function readSavedWebPicture(id) {
  const snapshot = localStorage.getItem(`splotch-picture:${id}`);
  if (snapshot === null) throw new Error(`No saved picture ${id}.`);
  return parseDrawing(JSON.parse(snapshot));
}

export async function readSavedNativePicture(id) {
  const { Directory, File, Paths } = await import('expo-file-system');
  const file = new File(new Directory(Paths.document, 'splotch-pictures'), `${id}.json`);
  return parseDrawing(JSON.parse(await file.text()));
}
