import { resumePngTask } from './pngTask';
import { PNG_TIMEOUT_MS } from './svgCapture';
import { MAX_PNG_BASE64_CHARACTERS, MAX_PNG_PIXELS } from './pngLimits';

const WORK_SLICE_UNITS = 4096;
const MAX_SYNCHRONOUS_WORK_UNITS = WORK_SLICE_UNITS * 2;
const MAX_WORK_UNITS = MAX_PNG_BASE64_CHARACTERS * 12 + MAX_PNG_PIXELS * 32;
// A React Native continuation can wait a whole frame, so yielding at every slice of a full-size
// PNG spends the deadline waiting; cooperative sites pause once per stretch of continuous work.
const CONTINUOUS_WORK_MS = 8;
// Bounds a stretch when the clock cannot measure it (a coarse or frozen performance.now).
const MAX_CONTINUOUS_WORK_UNITS = WORK_SLICE_UNITS * 64;

export function createPngWork(isCurrent: () => boolean) {
  const deadline = performance.now() + PNG_TIMEOUT_MS;
  let total = 0;
  let slice = 0;
  let continuous = 0;
  let resumedAt = performance.now();
  function check() {
    if (!isCurrent())
      throw new Error('Picture observation was cancelled. Your drawing is still here.');
    if (performance.now() >= deadline)
      throw new Error('Picture observation did not finish. Your drawing is still here.');
  }
  async function pause() {
    check();
    slice = 0;
    continuous = 0;
    await resumePngTask(check, deadline);
    resumedAt = performance.now();
    check();
  }
  return {
    charge(units = 1) {
      total += units;
      slice += units;
      continuous += units;
      if (slice > MAX_SYNCHRONOUS_WORK_UNITS)
        throw new Error('Picture observation exceeded its synchronous work limit.');
      if (total > MAX_WORK_UNITS) throw new Error('Picture observation exceeded its work limit.');
      if (slice >= WORK_SLICE_UNITS) check();
    },
    due: () => slice >= WORK_SLICE_UNITS,
    check,
    pause,
    /** Ends the slice at a cooperative site; true when the stretch is spent and the caller must pause. */
    endSlice() {
      if (
        continuous >= MAX_CONTINUOUS_WORK_UNITS ||
        performance.now() - resumedAt >= CONTINUOUS_WORK_MS
      )
        return true;
      check();
      slice = 0;
      return false;
    },
  };
}
export type PngWork = ReturnType<typeof createPngWork>;
