import { parseDrawing, type Drawing } from '../drawing/model';
import type { SavedPicture } from './drawingFiles';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { LibraryFault } from '../offlineLibrary/contract';

const STORAGE_PREFIX = 'splotch-picture:';
const MAX_SAVE_BYTES = 8 * 1024 * 1024;

function storageKey(id: string): string {
  if (!/^picture-\d+-[a-z0-9]+$/.test(id)) throw new Error('Invalid saved picture identity.');
  return `${STORAGE_PREFIX}${id}`;
}

export function listPictures(): SavedPicture[] {
  return Object.keys(localStorage)
    .filter((key) => key.startsWith(STORAGE_PREFIX))
    .map((key) => {
      const id = key.slice(STORAGE_PREFIX.length);
      storageKey(id);
      const modifiedAt = Number(id.split('-')[1]);
      return { id, modifiedAt, name: new Date(modifiedAt).toLocaleString() };
    })
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export async function savePicture(drawing: Drawing): Promise<SavedPicture> {
  const snapshot = JSON.stringify(parseDrawing(drawing));
  if (snapshot.length > MAX_SAVE_BYTES) throw new Error('This picture is too large to save.');
  const modifiedAt = Date.now();
  const id = `picture-${modifiedAt}-${Math.random().toString(36).slice(2, 10)}`;
  const write = async () => {
    localStorage.setItem(storageKey(id), snapshot);
    if (localStorage.getItem(storageKey(id)) !== snapshot)
      throw new Error('The picture could not be saved completely.');
  };
  if (isOfflinePageId(drawing.pageId)) {
    const { offlineLibrary } = await import('../offlineLibrary/runtime');
    await offlineLibrary.withSavedArtwork(drawing.pageId, write);
  } else await write();
  return { id, modifiedAt, name: new Date(modifiedAt).toLocaleString() };
}

export async function reopenPicture(id: string): Promise<Drawing> {
  const snapshot = localStorage.getItem(storageKey(id));
  if (!snapshot || snapshot.length > MAX_SAVE_BYTES)
    throw new Error('This saved picture cannot be opened.');
  const drawing = parseDrawing(JSON.parse(snapshot));
  if (isOfflinePageId(drawing.pageId)) {
    const { offlineLibrary } = await import('../offlineLibrary/runtime');
    await offlineLibrary.openPage(drawing.pageId);
  }
  return drawing;
}

export async function savedColoringPageIds(): Promise<readonly string[]> {
  try {
    return await Promise.all(
      listPictures().map(async ({ id }) => {
        const snapshot = localStorage.getItem(storageKey(id));
        if (!snapshot || snapshot.length > MAX_SAVE_BYTES)
          throw new Error('Invalid saved picture.');
        return parseDrawing(JSON.parse(snapshot)).pageId;
      })
    );
  } catch {
    throw new LibraryFault(
      'corrupt',
      'A saved picture could not be checked. Your coloring books were kept.'
    );
  }
}
