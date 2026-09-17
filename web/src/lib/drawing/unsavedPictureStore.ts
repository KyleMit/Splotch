import type { DBSchema } from '$lib/idbDatabase';
import { idbKvStore } from '$lib/idb';
import type { UnsavedStatus } from '$lib/saveNaming';
import { STORAGE_KEYS, readBool, removeKey, writeBool } from '$lib/storage';

// The pictures the save-failure banner holds outlive the page. Granting the permission a save
// needs happens in the device Settings, and iOS terminates an app whose Photos access changes
// there, so pictures kept only in memory would be gone exactly when the parent comes back to
// retry them. The bytes are stored as an ArrayBuffer rather than the Blob itself: WKWebView returned
// a stored Blob after a relaunch that the save could not read.

export interface HeldPicture {
  blob: Blob;
  baseName: string;
  outcome: UnsavedStatus;
  signature: string | null;
}

export interface UnsavedPictureStore {
  read(): Promise<HeldPicture[] | null>;
  write(held: HeldPicture[] | null): Promise<void>;
}

const DB_NAME = 'splotch-unsaved-pictures';
const STORE = 'held';
const HELD_KEY = 'pictures';

interface StoredPicture {
  bytes: ArrayBuffer;
  type: string;
  baseName: string;
  outcome: UnsavedStatus;
  signature: string | null;
}

interface UnsavedPictureDb extends DBSchema {
  held: {
    key: string;
    value: StoredPicture[];
  };
}

function toStored(held: HeldPicture[]): Promise<StoredPicture[]> {
  return Promise.all(
    held.map(async ({ blob, ...picture }) => ({
      ...picture,
      bytes: await blob.arrayBuffer(),
      type: blob.type,
    }))
  );
}

function fromStored(stored: StoredPicture[]): HeldPicture[] {
  return stored.map(({ bytes, type, ...picture }) => ({
    ...picture,
    blob: new Blob([bytes], { type }),
  }));
}

export function createUnsavedPictureStore(): UnsavedPictureStore {
  const store = idbKvStore<UnsavedPictureDb>(DB_NAME, STORE);
  return {
    async read() {
      if (!readBool(STORAGE_KEYS.unsavedPicturesHeld, false)) return null;
      try {
        const stored = await store.get(HELD_KEY);
        return stored ? fromStored(stored) : null;
      } catch (err) {
        console.error('Reading unsaved pictures failed:', err);
        return null;
      }
    },
    async write(held) {
      try {
        if (held && held.length > 0) {
          await store.put(HELD_KEY, await toStored(held));
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
