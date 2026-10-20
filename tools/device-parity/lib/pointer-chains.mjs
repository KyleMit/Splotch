// W3C pointer-action chains for Appium's /actions endpoint, and the point paths the drivers press.

export const MOVE_STEP_MS = 16;
// Strokes stay inside a band clear of every screen edge: an iPadOS stroke along the bottom edge is
// the swipe-between-apps gesture, and it switched the foreground app in a Clear-drag run.
export const EDGE_MARGIN_PT = 80;
// Clear-drag paths are expressed in multiples of this fraction of the window's short side, the
// distance the harness models as Clear's accept threshold: 1.0 sits on it, above 1 commits.
const ACCEPT_RADIUS_FACTOR = 0.4;
const SCRIBBLE_WOBBLE_PT = 18;
const LCG_MULTIPLIER = 1103515245;
const LCG_INCREMENT = 12345;
const LCG_MODULUS = 2147483648;
const SEED_SPREAD = 7919;
const RUN_SPREAD = 104729;

const TOUCH = { pointerType: 'touch' };
const rounded = (point) => ({ x: Math.round(point.x), y: Math.round(point.y) });

export function clampToSafeArea(win, point, margin = EDGE_MARGIN_PT) {
  return {
    x: Math.round(Math.min(Math.max(point.x, margin), win.width - margin)),
    y: Math.round(Math.min(Math.max(point.y, margin), win.height - margin)),
  };
}

// segments: { points, step?, raw? } presses along its points; { pause } waits with the pointer up.
// `raw` leaves the press point unclamped, so a control near an edge is pressed where it is; every
// later point of the segment still passes through `clamp`.
export function pointerChain(id, segments, clamp = rounded) {
  const pressAt = (segment) =>
    segment.raw ? rounded(segment.points[0]) : clamp(segment.points[0]);
  const actions = [];
  // WDA rejects a chain whose first item is a pause; a zero-length move to where the pointer will
  // press positions it without touching.
  const firstPress = segments.find((segment) => segment.points);
  if (segments[0]?.pause !== undefined && firstPress) {
    actions.push({ type: 'pointerMove', duration: 0, ...pressAt(firstPress) });
  }
  for (const segment of segments) {
    if (segment.pause !== undefined) {
      actions.push({ type: 'pause', duration: segment.pause });
      continue;
    }
    actions.push({ type: 'pointerMove', duration: 0, ...pressAt(segment) });
    actions.push({ type: 'pointerDown', button: 0 });
    for (const point of segment.points.slice(1)) {
      actions.push({
        type: 'pointerMove',
        duration: segment.step ?? MOVE_STEP_MS,
        ...clamp(point),
      });
    }
    actions.push({ type: 'pointerUp', button: 0 });
  }
  return { type: 'pointer', id, parameters: TOUCH, actions };
}

export function strokeChain(id, points, stepMs = MOVE_STEP_MS) {
  return pointerChain(id, [{ points, step: stepMs, raw: true }], rounded);
}

// One pointer that presses the same point `count` times, as one chain.
export function tapChain(id, point, { holdMs, count = 1, gapMs = 0 }) {
  const actions = [{ type: 'pointerMove', duration: 0, ...rounded(point) }];
  for (let index = 0; index < count; index += 1) {
    actions.push(
      { type: 'pointerDown', button: 0 },
      { type: 'pause', duration: holdMs },
      { type: 'pointerUp', button: 0 }
    );
    if (index < count - 1) actions.push({ type: 'pause', duration: gapMs });
  }
  return { type: 'pointer', id, parameters: TOUCH, actions };
}

// The crash matrix replays a run exactly from its (seed, run) pair.
export function createSeededRandom(seed, run) {
  let state = seed * SEED_SPREAD + run * RUN_SPREAD;
  return () => {
    state = (state * LCG_MULTIPLIER + LCG_INCREMENT) % LCG_MODULUS;
    return state / LCG_MODULUS;
  };
}

export function scribblePoints(win, random, count) {
  const x0 = win.width * (0.18 + 0.5 * random());
  const y0 = win.height * (0.25 + 0.5 * random());
  const dx = (random() - 0.5) * win.width * 0.4;
  const dy = (random() - 0.5) * win.height * 0.3;
  const points = [];
  for (let k = 0; k <= count; k += 1) {
    points.push({
      x: x0 + (dx * k) / count + SCRIBBLE_WOBBLE_PT * Math.sin(k / 2 + random()),
      y: y0 + (dy * k) / count + SCRIBBLE_WOBBLE_PT * Math.cos(k / 3),
    });
  }
  return points;
}

// A drag from Clear's centre toward the window's centre whose distance oscillates between lo and
// hi (multiples of the accept radius) at hz for `seconds`, then ends at finalFraction.
export function clearDragPoints({ win, center, hz, seconds, lo, hi, finalFraction }) {
  const radius = Math.min(win.width, win.height) * ACCEPT_RADIUS_FACTOR;
  const toMiddle = { x: win.width / 2 - center.x, y: win.height / 2 - center.y };
  const length = Math.hypot(toMiddle.x, toMiddle.y);
  const at = (fraction) => ({
    x: center.x + (toMiddle.x / length) * radius * fraction,
    y: center.y + (toMiddle.y / length) * radius * fraction,
  });
  const steps = Math.round((seconds * 1000) / MOVE_STEP_MS);
  const points = [center];
  for (let k = 1; k <= steps; k += 1) {
    const t = (k * MOVE_STEP_MS) / 1000;
    points.push(at(lo + (hi - lo) * (0.5 - 0.5 * Math.cos(2 * Math.PI * hz * t))));
  }
  points.push(at(finalFraction));
  return { points, radius, direction: { x: toMiddle.x / length, y: toMiddle.y / length } };
}
