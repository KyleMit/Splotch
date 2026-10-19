// Both platforms deliver input once per display frame, 8.3 ms apart at 120 Hz, so each packet
// hands its ink over as it arrives. A packet that reaches JavaScript closer than this to the last
// packet that handed ink over has queued behind other work, and its picture would be replaced
// before a frame shows it: it waits for the next packet past this spacing or the next frame
// callback, whichever is first. At 120 Hz that tolerates 4.3 ms of arrival jitter;
// native-handoff-cadence.test.mjs has the numbers.
export const HANDOFF_SPACING_MS = 4;

export type HandoffClock<Handle> = Readonly<{
  now: () => number;
  requestFrame: (callback: () => void) => Handle;
  cancelFrame: (handle: Handle) => void;
}>;

// When live ink is painted and handed to the view. `paint` paints every sample taken so far and
// reports whether it handed over new ink: a packet that changed no ink spends no spacing. Only a
// packet's own hand-off starts the spacing; a frame callback that paints held samples does not,
// or every packet after it would be held for the frame callback in turn.
export function createHandoffCadence<Handle>(clock: HandoffClock<Handle>, paint: () => boolean) {
  let frame: Handle | null = null;
  let pending = false;
  let handedAt = -Infinity;
  function paintHeld() {
    pending = false;
    paint();
  }
  function nextFrame() {
    frame = null;
    if (pending) paintHeld();
  }
  return {
    // New samples were taken.
    sample() {
      const at = clock.now();
      if (at - handedAt >= HANDOFF_SPACING_MS) {
        pending = false;
        if (paint()) handedAt = at;
        return;
      }
      pending = true;
      frame ??= clock.requestFrame(nextFrame);
    },
    // A contact is ending: everything sampled so far is painted at once.
    settle: paintHeld,
    dispose() {
      if (frame !== null) clock.cancelFrame(frame);
      frame = null;
      pending = false;
    },
  };
}
