// Pure geometry/timing helpers factored out of engine.ts so the subtle
// edge-gesture and stroke-speed math can be unit-tested without a canvas.
// engine.ts owns all mutable state and the DOM; everything here takes what it
// needs as arguments and returns a value (calculateStrokeSpeed mutates the
// sample array it is given, by contract — that is its sliding window).

export type GuardEdge = 'bottom' | 'left' | 'right';

export interface SpeedSample {
  t: number;
  distance: number;
}

// Backing-store px of the edge band a start touch must fall in to be treated as
// an OS-gesture candidate, the travel before the inward/cross direction is
// decided, and the minimum safe-area inset that marks a tablet's landscape
// long-bottom as a real home-indicator zone. See engine.ts for the full story.
export const EDGE_SWIPE_BAND_PX = 24;
export const EDGE_SWIPE_DECISION_PX = 12;
export const GESTURE_INSET_MIN_PX = 16;

export interface GuardEdgeDims {
  width: number;
  height: number;
  renderScale: number;
  bottomInset: number;
}

// The guarded edge (if any) a start point sits in — within EDGE_SWIPE_BAND_PX of
// the edge. Orientation picks the edges; coordinates are backing-store px so the
// band scales with renderScale, while the tablet inset gate is a CSS-px threshold.
export function guardedEdgeAt(x: number, y: number, dims: GuardEdgeDims): GuardEdge | null {
  const band = EDGE_SWIPE_BAND_PX * dims.renderScale;

  // Portrait: the system home/navbar is always along the bottom.
  if (dims.width <= dims.height) {
    return y >= dims.height - band ? 'bottom' : null;
  }

  // Landscape: a phone's physical-bottom navbar is on a short side edge, so
  // guard both short edges. A tablet keeps its home indicator on the long
  // bottom — guard that too, but only when the OS reports an inset there.
  if (dims.bottomInset >= GESTURE_INSET_MIN_PX && y >= dims.height - band) return 'bottom';
  if (x <= band) return 'left';
  if (x >= dims.width - band) return 'right';
  return null;
}

// Whether the decided travel (dx, dy from the start point, backing-store px) on
// a guarded edge is the OS home/back gesture — a mostly-inward flick toward the
// canvas centre, within ~45° of perpendicular — rather than a real stroke.
export function edgeSwipeIsOsGesture(edge: GuardEdge, dx: number, dy: number): boolean {
  let inward = 0;
  let cross = 0;
  switch (edge) {
    case 'bottom':
      inward = -dy;
      cross = Math.abs(dx);
      break;
    case 'left':
      inward = dx;
      cross = Math.abs(dy);
      break;
    case 'right':
      inward = -dx;
      cross = Math.abs(dy);
      break;
  }
  return inward > 0 && inward >= cross;
}

// Honest sliding window: stamp each move's distance with its time, drop samples
// older than windowMs, then divide the distance covered since the oldest
// surviving sample by that elapsed span. (The oldest sample is the anchor for
// the span, so its own distance — travelled before it — is excluded.)
export function calculateStrokeSpeed(
  samples: SpeedSample[],
  newSample: SpeedSample,
  windowMs: number
): number {
  samples.push(newSample);
  const cutoff = newSample.t - windowMs;
  while (samples.length > 1 && samples[0].t < cutoff) samples.shift();
  let windowDistance = 0;
  for (let i = 1; i < samples.length; i++) windowDistance += samples[i].distance;
  const windowSpan = Math.max(newSample.t - samples[0].t, 1);
  return windowDistance / windowSpan;
}
