import { browser } from '$app/environment';
import { blobSha256OrNull } from '$lib/digestHex';
import { onDurableRestore } from '$lib/storage';
import { isUnsaved, type SaveResult, type UnsavedStatus } from '$lib/saveNaming';
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

function sameContent(a: HeldPicture, b: HeldPicture): boolean {
  return a.signature !== null && a.signature === b.signature;
}

// Identical bytes are held once, but a denial reported for either copy is kept, so Open Settings
// stays on offer whichever order the outcomes arrive in.
function withPicture(held: HeldPicture[], picture: HeldPicture): HeldPicture[] {
  const index = held.findIndex((other) => sameContent(other, picture));
  if (index === -1) return [...held, picture].slice(-UNSAVED_PICTURE_LIMIT);
  if (picture.outcome !== 'denied' || held[index].outcome === 'denied') return held;
  return held.map((other, i) => (i === index ? { ...other, outcome: 'denied' } : other));
}

// The save pipeline loads on demand (issue #461), and this module is on the startup path, so the
// retry's save options stay inside it (web/tests/startup-bundle.spec.ts).
const savePictureOnDemand: SavePicture = async ({ blob, baseName }) => {
  try {
    const { retryImageSave } = await import('$lib/drawing/imageSave');
    return await retryImageSave(blob, baseName);
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
  // `uncapturedOutcome` is a failure that left no picture to hold (an export that produced nothing),
  // which still owes the parent a banner. Held pictures each keep their own outcome, so a denied one
  // keeps Open Settings on offer however many generic failures are reported after it.
  const s = $state<{ uncapturedOutcome: UnsavedStatus | null; retrying: boolean }>({
    uncapturedOutcome: null,
    retrying: false,
  });
  let pictures = $state.raw<HeldPicture[]>([]);

  function outcome(): UnsavedStatus | null {
    if (pictures.some((picture) => picture.outcome === 'denied')) return 'denied';
    return pictures.length > 0 ? 'failed' : s.uncapturedOutcome;
  }
  // Bumped by a dismissal so a report, retry, or restore that settles afterwards cannot bring the
  // banner back.
  let generation = 0;
  // Bumped by each picture-less report, so a retry clears only the one it saw when it started.
  let uncapturedVersion = 0;
  // Intentionally untracked: set once memory holds every picture the record does, because a
  // restore brought them in or a write from this session landed. No read runs after that, however
  // many times boot, durable hydration, and writes after a failed read ask: a picture whose
  // signature could not be computed has no content identity to deduplicate a second restore
  // against, and a second read would bring back a picture a retry saved or a dismissal released.
  let restoration: Promise<void> | null = null;
  let memoryCoversRecord = false;
  // Intentionally untracked: set by a read of the stored pictures that failed and cleared by one
  // that succeeds. Every write replaces the whole record, so while it is set a write first reads
  // the record into memory, and is skipped if that read fails too.
  let storeUnread = false;
  // Intentionally untracked: one queue for every read and write of the stored pictures. Each write
  // takes the state as it is when its turn comes, and a restore's read runs before any write queued
  // behind it, so a failure reported during boot cannot overwrite the pictures being restored.
  let storeQueue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const queued = storeQueue.then(operation);
    storeQueue = queued.catch(() => undefined);
    return queued;
  }

  // Runs inside the store queue. Resolves whether it brought stored pictures into memory; a
  // dismissal after `sinceGeneration` releases them instead.
  async function restoreFromStore(sinceGeneration: number): Promise<boolean> {
    if (memoryCoversRecord) return false;
    let held: HeldPicture[] | null;
    try {
      held = await pictureStore.read();
    } catch (err) {
      console.error('Reading unsaved pictures failed:', err);
      storeUnread = true;
      return false;
    }
    storeUnread = false;
    if (!held || held.length === 0) return false;
    memoryCoversRecord = true;
    if (sinceGeneration !== generation) return false;
    pictures = pictures.reduce(withPicture, held.slice(-UNSAVED_PICTURE_LIMIT));
    demandOverlay('saveFailureBanner');
    return true;
  }

  async function writeToStore() {
    if (storeUnread) {
      await restoreFromStore(generation);
      if (storeUnread) return;
    }
    try {
      await pictureStore.write(pictures.length > 0 ? pictures : null);
      memoryCoversRecord = true;
    } catch (err) {
      console.error('Keeping unsaved pictures failed:', err);
    }
  }

  function persist() {
    void enqueue(writeToStore);
  }

  return {
    get outcome() {
      return outcome();
    },
    get pictureCount() {
      return pictures.length;
    },
    get retrying() {
      return s.retrying;
    },

    async reportSaveFailure(outcome, picture) {
      const reportGeneration = generation;
      const signature = picture ? await blobSha256OrNull(picture.blob) : null;
      if (reportGeneration !== generation) return;
      if (picture) {
        pictures = withPicture(pictures, { ...picture, outcome, signature });
        persist();
      } else {
        uncapturedVersion += 1;
        s.uncapturedOutcome = outcome;
      }
      demandOverlay('saveFailureBanner');
    },

    async retryUnsavedPictures() {
      if (s.retrying || pictures.length === 0) return;
      const retryGeneration = generation;
      const retryUncapturedVersion = uncapturedVersion;
      const attempted = pictures;
      const stillUnsaved: HeldPicture[] = [];
      const saved: HeldPicture[] = [];
      s.retrying = true;
      try {
        for (const picture of attempted) {
          const result = await savePicture(picture);
          if (retryGeneration !== generation) return;
          if (isUnsaved(result)) stillUnsaved.push({ ...picture, outcome: result.status });
          else saved.push(picture);
        }
      } finally {
        if (retryGeneration === generation) s.retrying = false;
      }
      const reportedDuringRetry = pictures.filter(
        (picture) =>
          !attempted.includes(picture) && !saved.some((other) => sameContent(other, picture))
      );
      pictures = [...stillUnsaved, ...reportedDuringRetry].reduce(withPicture, []);
      if (uncapturedVersion === retryUncapturedVersion) s.uncapturedOutcome = null;
      persist();
    },

    dismissSaveFailure() {
      generation += 1;
      pictures = [];
      s.uncapturedOutcome = null;
      s.retrying = false;
      persist();
    },

    restoreUnsavedPictures() {
      if (memoryCoversRecord) return Promise.resolve();
      restoration ??= (async () => {
        const restoreGeneration = generation;
        const broughtIn = await enqueue(() => restoreFromStore(restoreGeneration));
        restoration = null;
        if (broughtIn) persist();
      })();
      return restoration;
    },
  };
}

export const saveFailureState = createSaveFailure();

export const { reportSaveFailure, retryUnsavedPictures, dismissSaveFailure } = saveFailureState;

// The flag that gates the IndexedDB read lives in localStorage, which a native WebView can evict
// while its Capacitor Preferences mirror keeps it; hydration then restores the flag, so the restore
// runs again; once a restore has found pictures or this session has written the record, later calls
// do nothing.
if (browser) {
  void saveFailureState.restoreUnsavedPictures();
  onDurableRestore(() => void saveFailureState.restoreUnsavedPictures());
}
