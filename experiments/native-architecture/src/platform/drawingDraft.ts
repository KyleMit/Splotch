import { Directory, File, Paths } from 'expo-file-system';
import {
  decodeDrawingDraft,
  MAX_DRAFT_BYTES,
  serializeDrawingDraftStorage,
  type DrawingDraftStorage,
} from '../product/drawingDraft';
import { isOfflinePageId } from '../offlineLibrary/identity';
import type { DrawingBackend } from '../product/drawingBackend';

const DRAFT_DIRECTORIES: Record<DrawingBackend, string> = {
  legacy: 'splotch-current-draft-v1',
  recorded: 'splotch-recorded-current-draft-v1',
};
const REVISION_NAME = /^draft-(\d+)\.json$/;
const RETAINED_REVISIONS = 2;

function directory(backend: DrawingBackend) {
  const owner = new Directory(Paths.document, DRAFT_DIRECTORIES[backend]);
  owner.create({ intermediates: true, idempotent: true });
  return owner;
}

function revisions(owner: Directory) {
  return owner
    .list()
    .flatMap((item) => {
      if (!(item instanceof File)) throw new Error('Unexpected current draft directory.');
      const match = REVISION_NAME.exec(item.name);
      if (!match) {
        if (/^draft-\d+\.pending$/.test(item.name)) return [];
        throw new Error('Unexpected current draft file.');
      }
      const revision = Number(match[1]);
      if (!Number.isSafeInteger(revision) || revision < 1)
        throw new Error('Invalid current draft revision.');
      return [{ file: item, revision }];
    })
    .sort((a, b) => b.revision - a.revision);
}

function createStorage(backend: DrawingBackend): DrawingDraftStorage {
  return {
    async read() {
      const file = revisions(directory(backend))[0]?.file;
      if (!file) return null;
      if (file.size > MAX_DRAFT_BYTES) throw new Error('The current draft is too large.');
      const snapshot = await file.text();
      decodeDrawingDraft(snapshot);
      return snapshot;
    },
    async write(snapshot) {
      decodeDrawingDraft(snapshot);
      const owner = directory(backend);
      const previous = revisions(owner);
      const revision = (previous[0]?.revision ?? 0) + 1;
      if (!Number.isSafeInteger(revision))
        throw new Error('Current draft revisions are exhausted.');
      const pending = new File(owner, `draft-${revision}.pending`);
      const pendingUri = pending.uri;
      if (pending.exists) pending.delete();
      try {
        pending.create();
        pending.write(snapshot);
        if ((await pending.text()) !== snapshot)
          throw new Error('Current draft write was incomplete.');
        const committed = new File(owner, `draft-${revision}.json`);
        await pending.move(committed);
        if ((await committed.text()) !== snapshot)
          throw new Error('Current draft could not be verified.');
      } catch (error) {
        try {
          const unfinished = new File(pendingUri);
          if (unfinished.exists) unfinished.delete();
        } catch {
          // An unfinished write cannot replace the original persistence failure.
        }
        throw error;
      }
      for (const old of previous.slice(RETAINED_REVISIONS - 1)) {
        try {
          old.file.delete();
        } catch {
          // The verified latest revision owns recovery even when an inert revision cannot be pruned.
        }
      }
    },
  };
}
const rawStorage: Record<DrawingBackend, DrawingDraftStorage> = {
  legacy: createStorage('legacy'),
  recorded: createStorage('recorded'),
};
function admitStorage(storage: DrawingDraftStorage): DrawingDraftStorage {
  return serializeDrawingDraftStorage({
    read: storage.read,
    async write(snapshot) {
      const drawing = decodeDrawingDraft(snapshot);
      if (!drawing) throw new Error('A current draft is required.');
      if (isOfflinePageId(drawing.pageId)) {
        const { offlineLibrary } = await import('../offlineLibrary/runtime');
        await offlineLibrary.withSavedArtwork(drawing.pageId, () => storage.write(snapshot));
      } else await storage.write(snapshot);
    },
  });
}
const storageByBackend: Record<DrawingBackend, DrawingDraftStorage> = {
  legacy: admitStorage(rawStorage.legacy),
  recorded: admitStorage(rawStorage.recorded),
};
export const drawingDraftStorage = storageByBackend.legacy;
export function drawingDraftStorageFor(backend: DrawingBackend) {
  return storageByBackend[backend];
}
export async function protectedDraftPageIds(): Promise<readonly string[]> {
  // Removal holds the artwork store lock; joining a writer waiting for that lock would deadlock.
  const snapshots = await Promise.all(Object.values(rawStorage).map((storage) => storage.read()));
  return snapshots.flatMap((snapshot) => {
    const drawing = decodeDrawingDraft(snapshot);
    return drawing ? [drawing.pageId] : [];
  });
}
