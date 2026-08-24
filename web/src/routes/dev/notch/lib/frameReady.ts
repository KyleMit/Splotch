// A preview frame that has not finished hydrating looks exactly like a real
// result: no band, chrome flush against the screen edge. That is the same
// picture a genuinely broken layout produces, so a tile has to be able to tell
// the two apart rather than leaving the reader to guess — a harness that can
// show a false negative is worse than no harness.
//
// Readiness is a flag the tile READS, not a message the frame sends. A message
// has to be listened for before it arrives, and a page of sixty frames loading
// over a dev server produces exactly the ordering where one lands early and is
// dropped, leaving a tile veiled forever with nothing to retry. An attribute is
// still true whenever the tile gets round to looking, and the frames are
// same-origin, so looking is a property read.
export const NOTCH_FRAME_READY_ATTRIBUTE = 'data-notch-frame-ready';

export function isFrameReady(iframe: HTMLIFrameElement | undefined): boolean {
  try {
    return (
      iframe?.contentDocument?.documentElement.hasAttribute(NOTCH_FRAME_READY_ATTRIBUTE) ?? false
    );
  } catch {
    // Only reachable if the frame ever stops being same-origin, which would
    // make every other read here fail too — treat it as "not ready".
    return false;
  }
}
