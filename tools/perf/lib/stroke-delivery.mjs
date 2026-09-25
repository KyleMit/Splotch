// Whether every stroke a driven Android capture dispatched reached the page,
// and landed where it was planned.
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

// A dispatched swipe's start is rounded to a whole device pixel, and Android
// reports the touch back at sub-pixel precision; anything past one CSS pixel is
// an origin that was derived wrongly, not rounding.
const STROKE_LANDING_TOLERANCE_CSS_PX = 1;

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
  if (downs === dispatched) return strokeLandingProblem(artifact.strokeLanding);
  return (
    `the page recorded ${downs} pointerdowns for ${dispatched} dispatched strokes — ` +
    (downs < dispatched
      ? 'an overlay or another window took touches'
      : 'something other than the capture touched the screen')
  );
}

// Whether each delivered stroke landed where it was planned. The dispatch
// origin is derived from the page's and the display's reported geometry, and a
// layout that geometry does not describe (issue 2271: a navigation bar counted
// above the page) moves every stroke by the same amount while every count and
// cadence check still passes. Absent evidence is a transport that plans no
// screen coordinates, or an artifact predating the field.
function strokeLandingProblem(landing) {
  if (!landing) return null;
  const { planned, recorded } = landing;
  if (!Array.isArray(recorded)) {
    return 'the page recorded no pointerdown positions to check the planned strokes against';
  }
  if (!Array.isArray(planned) || recorded.length !== planned.length) {
    return (
      `the page recorded ${recorded.length} pointerdown positions for ` +
      `${Array.isArray(planned) ? planned.length : 'no'} planned strokes`
    );
  }
  const misses = planned.map(([x, y], index) => [recorded[index][0] - x, recorded[index][1] - y]);
  const worst = Math.max(0, ...misses.map(([dx, dy]) => Math.max(Math.abs(dx), Math.abs(dy))));
  if (worst <= STROKE_LANDING_TOLERANCE_CSS_PX) return null;
  const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const round = (value) => Math.round(value * 10) / 10;
  return (
    `strokes landed up to ${round(worst)} CSS px from their planned points ` +
    `(median offset x ${round(median(misses.map(([dx]) => dx)))}, ` +
    `y ${round(median(misses.map(([, dy]) => dy)))}) — the dispatch origin does not match ` +
    "this device's layout"
  );
}
