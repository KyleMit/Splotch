import { isUnsaved, type PictureSaveOutcome, type UnsavedOutcome } from './pictureSave';
import type { PictureFormat } from './pictureFilename';

// A picture whose save did not land, held as the exact PNG that was captured. Try again saves
// these bytes, never a fresh capture: by the time a parent reads the banner the paper may have
// been cleared or drawn over.
// An AI picture keeps the format it arrived in, so Try again saves it under its own name.
export type HeldPicture = Readonly<{
  pngBase64: string;
  outcome: UnsavedOutcome;
  format?: PictureFormat;
}>;

// Each held picture is a full-resolution PNG in memory, and a toddler can tap the camera again
// and again while the permission stays denied. The oldest is released first. The shipping
// UNSAVED_PICTURE_LIMIT; tools/tests/native-save-failure.test.mjs reads it back.
export const UNSAVED_PICTURE_LIMIT = 8;

type SaveFailureState = Readonly<{
  outcome: UnsavedOutcome | null;
  pictureCount: number;
  retrying: boolean;
}>;

export type UnsavedPictureStore = Readonly<{
  read(): Promise<readonly HeldPicture[] | null>;
  write(pictures: readonly HeldPicture[] | null): Promise<void>;
}>;

const NO_FAILURE: SaveFailureState = { outcome: null, pictureCount: 0, retrying: false };

// Identical bytes are held once, but a denial reported for either copy is kept, so Open Settings
// stays on offer whichever order the outcomes arrive in.
function withPicture(held: readonly HeldPicture[], picture: HeldPicture): HeldPicture[] {
  const index = held.findIndex((other) => other.pngBase64 === picture.pngBase64);
  if (index === -1) return [...held, picture].slice(-UNSAVED_PICTURE_LIMIT);
  if (picture.outcome !== 'denied' || held[index].outcome === 'denied') return [...held];
  return held.map((other, i) => (i === index ? { ...other, outcome: 'denied' } : other));
}

export function createSaveFailure(
  save: (pngBase64: string, format?: PictureFormat) => Promise<PictureSaveOutcome>,
  publish: () => void,
  // Omitted only by focused owner tests; the drawing screen supplies its durable platform store.
  store?: UnsavedPictureStore
) {
  let pictures: readonly HeldPicture[] = [];
  let uncapturedOutcome: UnsavedOutcome | null = null;
  let retrying = false;
  let state = NO_FAILURE;
  // Bumped by a dismissal so a retry that settles afterwards cannot bring the banner back.
  let generation = 0;
  // Bumped by each picture-less report, so a retry clears only the one it saw when it started.
  let uncapturedVersion = 0;
  let memoryCoversRecord = !store;
  let queue: Promise<unknown> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>) {
    const queued = queue.then(operation);
    queue = queued.catch(() => undefined);
    return queued;
  }

  async function restoreFromStore() {
    if (memoryCoversRecord || !store) return;
    const sinceGeneration = generation;
    const held = await store.read();
    memoryCoversRecord = true;
    if (sinceGeneration !== generation) return;
    if (held && held.length > 0) {
      pictures = pictures.reduce(withPicture, [...held.slice(-UNSAVED_PICTURE_LIMIT)]);
      changed();
    }
  }

  function persist() {
    if (!store) return;
    void enqueue(async () => {
      await restoreFromStore();
      await store.write(pictures.length > 0 ? pictures : null);
    }).catch(() => undefined);
  }

  function outcome(): UnsavedOutcome | null {
    if (pictures.some((picture) => picture.outcome === 'denied')) return 'denied';
    return pictures.length > 0 ? 'failed' : uncapturedOutcome;
  }

  function changed() {
    state = { outcome: outcome(), pictureCount: pictures.length, retrying };
    publish();
  }

  async function retryPictures() {
    const retryGeneration = generation;
    const retryUncapturedVersion = uncapturedVersion;
    const attempted = pictures;
    const stillUnsaved: HeldPicture[] = [];
    const saved: HeldPicture[] = [];
    for (const picture of attempted) {
      const result = await save(picture.pngBase64, picture.format).catch(
        (): PictureSaveOutcome => 'failed'
      );
      if (retryGeneration !== generation) return;
      if (isUnsaved(result)) stillUnsaved.push({ ...picture, outcome: result });
      else saved.push(picture);
    }
    const reportedDuringRetry = pictures.filter(
      (picture) =>
        !attempted.includes(picture) &&
        !saved.some((other) => other.pngBase64 === picture.pngBase64)
    );
    pictures = [...stillUnsaved, ...reportedDuringRetry].reduce(withPicture, []);
    if (uncapturedVersion === retryUncapturedVersion) uncapturedOutcome = null;
    retrying = false;
    changed();
    persist();
  }

  return {
    getState: () => state,
    restore: () => enqueue(restoreFromStore).catch(() => undefined),
    report(failed: UnsavedOutcome, pngBase64: string | null, format?: PictureFormat) {
      if (pngBase64 !== null) {
        pictures = withPicture(pictures, { pngBase64, outcome: failed, format });
      } else {
        uncapturedVersion += 1;
        uncapturedOutcome = failed;
      }
      changed();
      persist();
    },
    async retry() {
      if (retrying || pictures.length === 0) return;
      retrying = true;
      changed();
      await retryPictures();
    },
    dismiss() {
      generation += 1;
      pictures = [];
      uncapturedOutcome = null;
      retrying = false;
      changed();
      persist();
    },
  };
}
