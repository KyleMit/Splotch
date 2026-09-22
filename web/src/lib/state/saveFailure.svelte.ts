import { browser } from '$app/environment';
import { sha256Hex } from '$lib/digestHex';
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

async function pictureSignature(blob: Blob): Promise<string | null> {
  try {
    return await sha256Hex(await blob.arrayBuffer());
  } catch {
    return null;
  }
}

// The save pipeline loads on demand (issue #461), and this module is on the startup path, so the
// retry's save options stay inside it (web/tests/startup-bundle.spec.ts).
const savePictureOnDemand: SavePicture = async ({ blob, baseName }) => {
  try {
    const { retryImageSave } = await import('$lib/drawing/screenshot');
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
  // Intentionally untracked: stored pictures are restored into memory once, however many times boot
  // and durable hydration ask, because a picture whose signature could not be computed has no
  // content identity to deduplicate a second restore against.
  let restoration: Promise<void> | null = null;
  let restored = false;
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
    void enqueue(() => pictureStore.write(pictures.length > 0 ? pictures : null));
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
      const signature = picture ? await pictureSignature(picture.blob) : null;
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
      if (restored) return Promise.resolve();
      restoration ??= (async () => {
        const restoreGeneration = generation;
        const held = await enqueue(() => pictureStore.read());
        restoration = null;
        if (!held || held.length === 0) return;
        restored = true;
        if (restoreGeneration !== generation) return;
        pictures = pictures.reduce(withPicture, held.slice(-UNSAVED_PICTURE_LIMIT));
        persist();
        demandOverlay('saveFailureBanner');
      })();
      return restoration;
    },
  };
}

export const saveFailureState = createSaveFailure();

export const { reportSaveFailure, retryUnsavedPictures, dismissSaveFailure } = saveFailureState;

// The flag that gates the IndexedDB read lives in localStorage, which a native WebView can evict
// while its Capacitor Preferences mirror keeps it; hydration then restores the flag, so the restore
// runs again; once a restore has found pictures, later calls do nothing.
if (browser) {
  void saveFailureState.restoreUnsavedPictures();
  onDurableRestore(() => void saveFailureState.restoreUnsavedPictures());
}
