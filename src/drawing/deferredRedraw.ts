export type FrameClock = Readonly<{
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
}>;

// A native drawable change reaches JavaScript before the drawable it leaves behind is ready to
// show a frame: a resized drawable can coalesce with the picture submitted in the same frame, and
// the texture layer Android rebuilds after high-contrast text toggles shows only a frame queued
// after it exists. Redrawing two display frames later lands on the drawable as it settled.
const SETTLE_FRAMES = 2;

// Redraws once, SETTLE_FRAMES display frames after the latest request. A request supersedes the
// one waiting, and a superseded or disposed wait never redraws, even if its frame still fires.
export function createDeferredRedraw(clock: FrameClock, redraw: () => void) {
  let pending: number | null = null;
  let generation = 0;
  const cancel = () => {
    if (pending !== null) clock.cancelFrame(pending);
    pending = null;
    generation += 1;
  };
  const wait = (frames: number, waiting: number) => {
    pending = clock.requestFrame(() => {
      if (waiting !== generation) return;
      if (frames > 1) {
        wait(frames - 1, waiting);
        return;
      }
      pending = null;
      redraw();
    });
  };
  return {
    request() {
      cancel();
      wait(SETTLE_FRAMES, generation);
    },
    dispose: cancel,
  };
}
