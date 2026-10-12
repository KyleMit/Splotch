import {
  decodeDrawingDraft,
  serializeDrawingDraftStorage,
  type DrawingDraftStorage,
} from '../product/drawingDraft';
import type { DrawingBackend } from '../product/drawingBackend';

const CURRENT_DRAFT_KEYS: Record<DrawingBackend, string> = {
  legacy: 'splotch-candidate:current-draft-v1',
  recorded: 'splotch-candidate:recorded-current-draft-v1',
};
function createStorage(backend: DrawingBackend): DrawingDraftStorage {
  const key = CURRENT_DRAFT_KEYS[backend];

  return serializeDrawingDraftStorage({
    async read() {
      const snapshot = localStorage.getItem(key);
      decodeDrawingDraft(snapshot);
      return snapshot;
    },
    async write(snapshot) {
      decodeDrawingDraft(snapshot);
      localStorage.setItem(key, snapshot);
      if (localStorage.getItem(key) !== snapshot)
        throw new Error('The current draft could not be verified.');
    },
  });
}
const storageByBackend: Record<DrawingBackend, DrawingDraftStorage> = {
  legacy: createStorage('legacy'),
  recorded: createStorage('recorded'),
};
export const drawingDraftStorage = storageByBackend.legacy;
export function drawingDraftStorageFor(backend: DrawingBackend) {
  return storageByBackend[backend];
}
export async function protectedDraftPageIds(): Promise<readonly string[]> {
  const snapshots = await Promise.all(
    Object.values(storageByBackend).map((storage) => storage.read())
  );
  return snapshots.flatMap((snapshot) => {
    const drawing = decodeDrawingDraft(snapshot);
    return drawing ? [drawing.pageId] : [];
  });
}
