import { isOfflinePageId } from '../offlineLibrary/identity';
import { LibraryFault } from '../offlineLibrary/contract';
import { Directory, File, Paths } from 'expo-file-system';
import { parseDrawing, type Drawing } from '../drawing/model';

const DRAWING_DIRECTORY = 'splotch-pictures';
const MAX_SAVE_BYTES = 8 * 1024 * 1024;

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
  const write = async () => {
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
  };
  if (isOfflinePageId(drawing.pageId)) {
    const { offlineLibrary } = await import('../offlineLibrary/runtime');
    await offlineLibrary.withSavedArtwork(drawing.pageId, write);
  } else await write();
  return { id, name: new Date(modifiedAt).toLocaleString(), modifiedAt };
}

export async function reopenPicture(id: string): Promise<Drawing> {
  const file = pictureFile(id);
  if (!file.exists || file.size > MAX_SAVE_BYTES)
    throw new Error('This saved picture cannot be opened.');
  const drawing = parseDrawing(JSON.parse(await file.text()));
  if (isOfflinePageId(drawing.pageId)) {
    const { offlineLibrary } = await import('../offlineLibrary/runtime');
    await offlineLibrary.openPage(drawing.pageId);
  }
  return drawing;
}

export async function savedColoringPageIds(): Promise<readonly string[]> {
  const pages: string[] = [];
  try {
    for (const picture of listPictures()) {
      const file = pictureFile(picture.id);
      if (!file.exists || file.size > MAX_SAVE_BYTES) throw new Error('Invalid saved picture.');
      pages.push(parseDrawing(JSON.parse(await file.text())).pageId);
    }
  } catch {
    throw new LibraryFault(
      'corrupt',
      'A saved picture could not be checked. Your coloring books were kept.'
    );
  }
  return pages;
}
