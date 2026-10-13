import { Directory, File, Paths } from 'expo-file-system';
import {
  decodeDrawingDraft,
  MAX_DRAFT_BYTES,
  serializeDrawingDraftStorage,
  type DrawingDraftStorage,
} from '../product/drawingDraft';
import { isOfflinePageId } from '../offlineLibrary/identity';

const DRAFT_DIRECTORY = 'splotch-current-draft-v1';
const REVISION_NAME = /^draft-(\d+)\.json$/;
const RETAINED_REVISIONS = 2;

function directory() {
  const owner = new Directory(Paths.document, DRAFT_DIRECTORY);
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

function createStorage(): DrawingDraftStorage {
  return {
    async read() {
      const file = revisions(directory())[0]?.file;
      if (!file) return null;
      if (file.size > MAX_DRAFT_BYTES) throw new Error('The current draft is too large.');
      const snapshot = await file.text();
      decodeDrawingDraft(snapshot);
      return snapshot;
    },
    async write(snapshot) {
      decodeDrawingDraft(snapshot);
      const owner = directory();
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
const rawStorage = createStorage();
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
export const drawingDraftStorage = admitStorage(rawStorage);
export async function protectedDraftPageIds(): Promise<readonly string[]> {
  // Removal holds the artwork store lock; joining a writer waiting for that lock would deadlock.
  const drawing = decodeDrawingDraft(await rawStorage.read());
  return drawing ? [drawing.pageId] : [];
}
