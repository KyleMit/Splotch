import { parseDrawing, type Drawing } from '../drawing/model';
import type { SavedPicture } from './drawingFiles';

const STORAGE_PREFIX = 'splotch-picture:';
const MAX_SAVE_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE_BASE64 = 'iVBORw0KGgo';

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
  localStorage.setItem(storageKey(id), snapshot);
  if (localStorage.getItem(storageKey(id)) !== snapshot)
    throw new Error('The picture could not be saved completely.');
  return { id, modifiedAt, name: new Date(modifiedAt).toLocaleString() };
}

export async function reopenPicture(id: string): Promise<Drawing> {
  const snapshot = localStorage.getItem(storageKey(id));
  if (!snapshot || snapshot.length > MAX_SAVE_BYTES)
    throw new Error('This saved picture cannot be opened.');
  return parseDrawing(JSON.parse(snapshot));
}

export async function exportPng(base64: string): Promise<string> {
  if (!base64.startsWith(PNG_SIGNATURE_BASE64))
    throw new Error('The drawing could not be exported as a PNG.');
  const uri = `data:image/png;base64,${base64}`;
  const link = document.createElement('a');
  link.href = uri;
  link.download = `splotch-${Date.now()}.png`;
  link.click();
  return uri;
}
