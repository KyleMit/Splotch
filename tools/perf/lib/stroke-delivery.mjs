// Whether every stroke a driven Android capture dispatched reached the page.
//
// Each `adb shell input swipe` is its own down/up, so a page that recorded
// fewer trusted pointerdowns than the capture dispatched lost touches before
// the page saw them. Issue 2229: an accessibility overlay column dropped 20 of
// 160 swipes, and the capture still passed fidelity, because the strokes that
// did arrive were driven perfectly. The count is the only witness.
//
// The one rule for perf:device:frames' exit, campaign acceptance, and the
// person session's REDO verdict, so none of them can bank a capture another
// refuses.

// Columns of a probe event row (tools/perf/probes/real-screen-probe.js).
const EVENT_TYPE = 2;
const EVENT_TRUSTED = 8;
const POINTERDOWN = 0;

export function trustedPointerdowns(report) {
  return (report?.events ?? []).filter(
    (row) => row[EVENT_TYPE] === POINTERDOWN && row[EVENT_TRUSTED] === 1
  ).length;
}

// `required` is for a caller that knows the capture was driven through adb and
// so must carry the count. Elsewhere an absent count is the transports that do
// not record one (iPadOS, hand captures) and artifacts predating the field.
export function strokeDeliveryProblem(artifact, { required = false } = {}) {
  const dispatched = artifact?.dispatchedStrokes;
  const downs = trustedPointerdowns(artifact?.report);
  if (dispatched === undefined || dispatched === null) {
    return required
      ? `the capture recorded ${downs} pointerdowns but no dispatchedStrokes to check them against`
      : null;
  }
  if (!Number.isSafeInteger(dispatched) || dispatched < 0) {
    return `dispatchedStrokes ${JSON.stringify(dispatched)} is not a stroke count`;
  }
  if (downs === dispatched) return null;
  return (
    `the page recorded ${downs} pointerdowns for ${dispatched} dispatched strokes — ` +
    (downs < dispatched
      ? 'an overlay or another window took touches'
      : 'something other than the capture touched the screen')
  );
}
