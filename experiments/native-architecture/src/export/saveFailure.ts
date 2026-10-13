import { isUnsaved, type PictureSaveOutcome, type UnsavedOutcome } from './pictureSave';
import type { PictureFormat } from './pictureFilename';

// The shipping Save Failure Banner's owner (web/src/lib/state/saveFailure.svelte.ts), held in
// memory: no copy of a picture outlives the app, so a picture still unsaved when the app closes
// stays only on the paper it was drawn on.

// A picture whose save did not land, held as the exact PNG that was captured. Try again saves
// these bytes, never a fresh capture: by the time a parent reads the banner the paper may have
// been cleared or drawn over.
// An AI picture keeps the format it arrived in, so Try again saves it under its own name.
type HeldPicture = Readonly<{
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
  publish: () => void
) {
  let pictures: readonly HeldPicture[] = [];
  // A failure that left no picture to hold (a capture that produced nothing, or a gallery this
  // app cannot write to), which still owes the parent a banner.
  let uncapturedOutcome: UnsavedOutcome | null = null;
  let retrying = false;
  let state = NO_FAILURE;
  // Bumped by a dismissal so a retry that settles afterwards cannot bring the banner back.
  let generation = 0;
  // Bumped by each picture-less report, so a retry clears only the one it saw when it started.
  let uncapturedVersion = 0;

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
  }

  return {
    getState: () => state,
    // A gallery this app cannot write to refuses every retry alike, so its picture is not held.
    report(failed: UnsavedOutcome, pngBase64: string | null, format?: PictureFormat) {
      if (pngBase64 !== null && failed !== 'unavailable') {
        pictures = withPicture(pictures, { pngBase64, outcome: failed, format });
      } else {
        uncapturedVersion += 1;
        uncapturedOutcome = failed;
      }
      changed();
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
    },
  };
}
