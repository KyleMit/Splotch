export type FrameClock = Readonly<{
  requestFrame: (callback: () => void) => number;
  cancelFrame: (handle: number) => void;
}>;

// A native drawable change reaches JavaScript before the drawable it leaves behind is ready to
// show a frame: a resized drawable can coalesce with the picture submitted in the same frame, and
// the texture layer Android rebuilds after high-contrast text toggles shows only a frame queued
// after it exists. Redrawing two display frames later lands on the drawable as it settled.
const SETTLE_FRAMES = 2;

// Redraws once, SETTLE_FRAMES display frames after the latest request; requests that arrive while
// one is waiting restart its count rather than queueing another redraw.
export function createDeferredRedraw(clock: FrameClock, redraw: () => void) {
  let pending: number | null = null;
  let remaining = 0;
  const tick = () => {
    remaining -= 1;
    if (remaining > 0) {
      pending = clock.requestFrame(tick);
      return;
    }
    pending = null;
    redraw();
  };
  return {
    request() {
      remaining = SETTLE_FRAMES;
      if (pending === null) pending = clock.requestFrame(tick);
    },
    dispose() {
      if (pending !== null) clock.cancelFrame(pending);
      pending = null;
    },
  };
}
