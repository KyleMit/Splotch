import { PNG_TIMEOUT_MS } from './svgCapture';
import { MAX_PNG_BASE64_CHARACTERS, MAX_PNG_PIXELS } from './pngLimits';

const WORK_SLICE_UNITS = 4096;
const MAX_SYNCHRONOUS_WORK_UNITS = WORK_SLICE_UNITS * 2;
const MAX_WORK_UNITS = MAX_PNG_BASE64_CHARACTERS * 12 + MAX_PNG_PIXELS * 32;

export function createPngWork(isCurrent: () => boolean) {
  const deadline = performance.now() + PNG_TIMEOUT_MS;
  let total = 0;
  let slice = 0;
  function check() {
    if (!isCurrent())
      throw new Error('Picture observation was cancelled. Your drawing is still here.');
    if (performance.now() >= deadline)
      throw new Error('Picture observation did not finish. Your drawing is still here.');
  }
  return {
    charge(units = 1) {
      total += units;
      slice += units;
      if (slice > MAX_SYNCHRONOUS_WORK_UNITS)
        throw new Error('Picture observation exceeded its synchronous work limit.');
      if (total > MAX_WORK_UNITS) throw new Error('Picture observation exceeded its work limit.');
      if (slice >= WORK_SLICE_UNITS) check();
    },
    due: () => slice >= WORK_SLICE_UNITS,
    check,
    async pause() {
      check();
      slice = 0;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      check();
    },
  };
}
export type PngWork = ReturnType<typeof createPngWork>;
