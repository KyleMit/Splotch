import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFiles from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { parseDrawing, type Drawing } from '../drawing/model';

const DRAWING_DIRECTORY = 'splotch-pictures';
const MAX_SAVE_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE_BASE64 = 'iVBORw0KGgo';

export type SavedPicture = Readonly<{ id: string; name: string; modifiedAt: number }>;

function directory(): Directory {
  const result = new Directory(Paths.document, DRAWING_DIRECTORY);
  result.create({ intermediates: true, idempotent: true });
  return result;
}

function pictureFile(id: string): File {
  if (!/^picture-\d+-[a-z0-9]+$/.test(id)) throw new Error('Invalid saved picture identity.');
  return new File(directory(), `${id}.json`);
}

export function listPictures(): SavedPicture[] {
  return directory()
    .list()
    .flatMap((item) => {
      if (!(item instanceof File) || !/^picture-\d+-[a-z0-9]+\.json$/.test(item.name)) return [];
      const id = item.name.slice(0, -5);
      const modifiedAt = Number(id.split('-')[1]);
      return [{ id, name: new Date(modifiedAt).toLocaleString(), modifiedAt }];
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function savePicture(drawing: Drawing): Promise<SavedPicture> {
  const snapshot = JSON.stringify(parseDrawing(drawing));
  if (snapshot.length > MAX_SAVE_BYTES) throw new Error('This picture is too large to save.');
  const modifiedAt = Date.now();
  const id = `picture-${modifiedAt}-${Math.random().toString(36).slice(2, 10)}`;
  const file = new File(directory(), `${id}.pending`);
  const pendingUri = file.uri;
  file.create();
  try {
    file.write(snapshot);
    const readback = await file.text();
    if (readback !== snapshot)
      throw new Error('The picture could not be saved completely. Please try again.');
    await file.move(pictureFile(id));
  } catch (error) {
    try {
      const pending = new File(pendingUri);
      if (pending.exists) pending.delete();
    } catch {
      // Cleanup must preserve the save error; move can change the original File's URI.
    }
    throw error;
  }
  return { id, name: new Date(modifiedAt).toLocaleString(), modifiedAt };
}

export async function reopenPicture(id: string): Promise<Drawing> {
  const file = pictureFile(id);
  if (!file.exists || file.size > MAX_SAVE_BYTES)
    throw new Error('This saved picture cannot be opened.');
  return parseDrawing(JSON.parse(await file.text()));
}

export async function exportPng(base64: string): Promise<string> {
  if (!base64.startsWith(PNG_SIGNATURE_BASE64))
    throw new Error('The drawing could not be exported as a PNG.');
  const uri = new File(Paths.cache, `splotch-${Date.now()}.png`).uri;
  await LegacyFiles.writeAsStringAsync(uri, base64, { encoding: LegacyFiles.EncodingType.Base64 });
  if (!(await Sharing.isAvailableAsync()))
    throw new Error('PNG saved locally, but sharing is unavailable on this device.');
  await Sharing.shareAsync(uri, {
    mimeType: 'image/png',
    UTI: 'public.png',
    dialogTitle: 'Save your picture',
  });
  return uri;
}
