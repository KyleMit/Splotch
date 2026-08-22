// Defer the eraser's "is the drawing empty now?" scan until the child stops.
//
// The scan reads back every live tile, and on a physical Android phone it
// measured 4.5 ms average and 12.3 ms maximum against an 8.3 ms budget, once per
// eraser lift, landing in the frames that are already the eraser's worst.
// Nothing needs the answer that fast — it only enables or disables Undo, Clear,
// and the screenshot control — so it waits for the child to stop, the same
// discipline ADR-0085 gave history folding.
const EMPTY_SCAN_IDLE_MS = 400;

export type IdleEmptyScanDeps = {
  // A scan that comes due mid-stroke re-arms rather than running, so a child who
  // never pauses never pays for one.
  isDrawing: () => boolean;
  run: () => void;
};

export function createIdleEmptyScan(deps: IdleEmptyScanDeps) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  // A pointerdown pushes the scan back out rather than letting it fire between
  // two strokes of the same scribble.
  function schedule() {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      if (deps.isDrawing()) {
        schedule();
        return;
      }
      deps.run();
    }, EMPTY_SCAN_IDLE_MS);
  }

  return { cancel, schedule };
}
