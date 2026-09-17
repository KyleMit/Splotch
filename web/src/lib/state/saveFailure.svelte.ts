import { browser } from '$app/environment';
import type { SaveResult, UnsavedStatus } from '$lib/saveNaming';
import {
  createUnsavedPictureStore,
  type HeldPicture,
  type UnsavedPictureStore,
} from '$lib/drawing/unsavedPictureStore';
import { demandOverlay } from './overlayDemand';

// A picture whose save did not land, held as the exact bytes that were exported at the time. Retry
// saves these bytes, never a fresh export: by the time a parent reads the banner the canvas may have
// been cleared (save-on-delete) or drawn over.
export interface UnsavedPicture {
  blob: Blob;
  baseName: string;
}

// Each held picture is a full-resolution image kept in memory and on disk, and a toddler can tap
// the camera again and again while the permission stays denied. The oldest is released first.
export const UNSAVED_PICTURE_LIMIT = 8;

export type SavePicture = (picture: UnsavedPicture) => Promise<SaveResult>;

export interface SaveFailureState {
  readonly outcome: UnsavedStatus | null;
  readonly pictureCount: number;
  readonly retrying: boolean;
  reportSaveFailure(outcome: UnsavedStatus, picture: UnsavedPicture | null): Promise<void>;
  retryUnsavedPictures(): Promise<void>;
  dismissSaveFailure(): void;
  restoreUnsavedPictures(): Promise<void>;
}

async function pictureSignature(blob: Blob): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

// The save pipeline loads on demand (issue #461); a retry is user-initiated, so it may re-confirm a
// lapsed web folder permission like the camera button does.
const savePictureOnDemand: SavePicture = async ({ blob, baseName }) => {
  try {
    const { saveImageBlob } = await import('$lib/drawing/screenshot');
    return await saveImageBlob(blob, baseName, { allowPrompt: true });
  } catch (err) {
    console.error('Retrying the save failed:', err);
    return { status: 'failed' };
  }
};

interface SaveFailureDependencies {
  savePicture?: SavePicture;
  pictureStore?: UnsavedPictureStore;
}

// Both dependencies are test seams: production always takes the on-demand save pipeline and the
// IndexedDB-backed store.
export function createSaveFailure({
  savePicture = savePictureOnDemand,
  pictureStore = createUnsavedPictureStore(),
}: SaveFailureDependencies = {}): SaveFailureState {
  const s = $state<{ outcome: UnsavedStatus | null; retrying: boolean }>({
    outcome: null,
    retrying: false,
  });
  let pictures = $state.raw<HeldPicture[]>([]);
  // Bumped by a dismissal so a report, retry, or restore that settles afterwards cannot bring the
  // banner back.
  let generation = 0;
  // Intentionally untracked: one queue for every read and write of the stored pictures. Each write
  // takes the state as it is when its turn comes, and a restore's read runs before any write queued
  // behind it, so a failure reported during boot cannot overwrite the pictures being restored.
  let storeQueue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = storeQueue.then(operation);
    storeQueue = queued.catch(() => undefined);
    return queued;
  }

  function persist() {
    void enqueue(() =>
      pictureStore.write(s.outcome && pictures.length > 0 ? { outcome: s.outcome, pictures } : null)
    );
  }

  function withPicture(held: HeldPicture[], picture: HeldPicture): HeldPicture[] {
    const duplicate =
      picture.signature !== null && held.some((other) => other.signature === picture.signature);
    return duplicate ? held : [...held, picture].slice(-UNSAVED_PICTURE_LIMIT);
  }

  return {
    get outcome() {
      return s.outcome;
    },
    get pictureCount() {
      return pictures.length;
    },
    get retrying() {
      return s.retrying;
    },

    async reportSaveFailure(outcome, picture) {
      const reportGeneration = generation;
      const signature = picture ? await pictureSignature(picture.blob) : null;
      if (reportGeneration !== generation) return;
      if (picture) pictures = withPicture(pictures, { ...picture, signature });
      s.outcome = outcome;
      persist();
      demandOverlay('saveFailureBanner');
    },

    async retryUnsavedPictures() {
      if (s.retrying || pictures.length === 0) return;
      const retryGeneration = generation;
      const attempted = pictures;
      const stillUnsaved: HeldPicture[] = [];
      let outcome: UnsavedStatus = 'failed';
      s.retrying = true;
      try {
        for (const picture of attempted) {
          const result = await savePicture(picture);
          if (retryGeneration !== generation) return;
          if (result.status === 'denied' || result.status === 'failed') {
            stillUnsaved.push(picture);
            if (result.status === 'denied') outcome = 'denied';
          }
        }
      } finally {
        if (retryGeneration === generation) s.retrying = false;
      }
      const reportedDuringRetry = pictures.filter((picture) => !attempted.includes(picture));
      pictures = [...stillUnsaved, ...reportedDuringRetry];
      if (pictures.length === 0) {
        s.outcome = null;
      } else if (stillUnsaved.length > 0) {
        s.outcome = outcome;
      }
      persist();
    },

    dismissSaveFailure() {
      generation += 1;
      pictures = [];
      s.outcome = null;
      s.retrying = false;
      persist();
    },

    async restoreUnsavedPictures() {
      const restoreGeneration = generation;
      const held = await enqueue(() => pictureStore.read());
      if (!held || held.pictures.length === 0 || restoreGeneration !== generation) return;
      pictures = pictures.reduce(withPicture, held.pictures);
      s.outcome ??= held.outcome;
      persist();
      demandOverlay('saveFailureBanner');
    },
  };
}

export const saveFailureState = createSaveFailure();

export const { reportSaveFailure, retryUnsavedPictures, dismissSaveFailure } = saveFailureState;

if (browser) void saveFailureState.restoreUnsavedPictures();
