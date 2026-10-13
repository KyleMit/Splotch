import {
  decodeDrawingDraft,
  serializeDrawingDraftStorage,
  type DrawingDraftStorage,
} from '../product/drawingDraft';
import { isOfflinePageId } from '../offlineLibrary/identity';
import { readProtectedDraftSnapshot, WebDrawingDraftOwner } from './drawingDraftOwner.web';

export function createWebDrawingDraftStorage(): DrawingDraftStorage {
  const owner = new WebDrawingDraftOwner();
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

export const drawingDraftStorage = createWebDrawingDraftStorage();
export async function protectedDraftPageIds(): Promise<readonly string[]> {
  // Removal owns the artwork lock; a writer waiting for that lock cannot own this read.
  const drawing = decodeDrawingDraft(await readProtectedDraftSnapshot());
  return drawing ? [drawing.pageId] : [];
}
