import type { DBSchema } from '$lib/idbDatabase';
import { idbKvStore } from '$lib/idb';
import type { UnsavedStatus } from '$lib/saveNaming';
import { STORAGE_KEYS, readBool, removeKey, writeBool } from '$lib/storage';

// The pictures the save-failure banner holds outlive the page. Granting the permission a save
// needs happens in the device Settings, and iOS terminates an app whose Photos access changes
// there, so pictures kept only in memory would be gone exactly when the parent comes back to
// retry them. A Blob is structured-cloneable, so IndexedDB stores the bytes as they are.

export interface HeldPicture {
  blob: Blob;
  baseName: string;
  signature: string | null;
}

export interface HeldPictures {
  outcome: UnsavedStatus;
  pictures: HeldPicture[];
}

export interface UnsavedPictureStore {
  read(): Promise<HeldPictures | null>;
  write(held: HeldPictures | null): Promise<void>;
}

const DB_NAME = 'splotch-unsaved-pictures';
const STORE = 'held';
const HELD_KEY = 'pictures';

interface UnsavedPictureDb extends DBSchema {
  held: {
    key: string;
    value: HeldPictures;
  };
}

export function createUnsavedPictureStore(): UnsavedPictureStore {
  const store = idbKvStore<UnsavedPictureDb>(DB_NAME, STORE);
  return {
    async read() {
      if (!readBool(STORAGE_KEYS.unsavedPicturesHeld, false)) return null;
      try {
        return (await store.get(HELD_KEY)) ?? null;
      } catch (err) {
        console.error('Reading unsaved pictures failed:', err);
        return null;
      }
    },
    async write(held) {
      try {
        if (held && held.pictures.length > 0) {
          await store.put(HELD_KEY, held);
          writeBool(STORAGE_KEYS.unsavedPicturesHeld, true);
        } else {
          removeKey(STORAGE_KEYS.unsavedPicturesHeld);
          await store.delete(HELD_KEY);
        }
      } catch (err) {
        console.error('Keeping unsaved pictures failed:', err);
      }
    },
  };
}
