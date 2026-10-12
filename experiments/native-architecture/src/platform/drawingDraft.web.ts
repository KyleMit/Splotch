import {
  decodeDrawingDraft,
  serializeDrawingDraftStorage,
  type DrawingDraftStorage,
} from '../product/drawingDraft';
import type { DrawingBackend } from '../product/drawingBackend';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { readProtectedDraftSnapshot, WebDrawingDraftOwner } from './drawingDraftOwner.web';

export function createWebDrawingDraftStorage(backend: DrawingBackend): DrawingDraftStorage {
  const owner = new WebDrawingDraftOwner(backend);
  return serializeDrawingDraftStorage({
    read: () => owner.read(),
    async write(snapshot) {
      const drawing = decodeDrawingDraft(snapshot);
      if (!drawing) throw new Error('A current draft is required.');
      const write = () => owner.write(snapshot);
      if (isOfflinePageId(drawing.pageId)) {
        const { offlineLibrary } = await import('../offlineLibrary/runtime');
        await offlineLibrary.withSavedArtwork(drawing.pageId, write);
      } else await write();
    },
  });
}

const storageByBackend: Record<DrawingBackend, DrawingDraftStorage> = {
  legacy: createWebDrawingDraftStorage('legacy'),
  recorded: createWebDrawingDraftStorage('recorded'),
};
export const drawingDraftStorage = storageByBackend.legacy;
export function drawingDraftStorageFor(backend: DrawingBackend) {
  return storageByBackend[backend];
}
export async function protectedDraftPageIds(): Promise<readonly string[]> {
  // Removal owns the artwork lock; a writer waiting for that lock cannot own this read.
  const snapshots = await Promise.all([
    readProtectedDraftSnapshot('legacy'),
    readProtectedDraftSnapshot('recorded'),
  ]);
  return snapshots.flatMap((snapshot) => {
    const drawing = decodeDrawingDraft(snapshot);
    return drawing ? [drawing.pageId] : [];
  });
}
