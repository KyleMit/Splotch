// One interpolated native move emits digitizer-like samples without making WDA
// serialize hundreds of tiny action commands.
const LONG_STROKE_DURATION_MS = 2_000;
const LONG_STROKE_SEGMENTS = 4;
const LONG_STROKE_SEEDS = [0.2, 0.7];
const LONG_STROKE_WAVES = 3;
const LONG_STROKE_PAUSE_MS = 120;
const SHORT_STROKE_DURATION_MS = 240;
const SHORT_STROKE_PAUSE_MS = 90;
const SHORT_STROKE_X_PX = 45;
const SHORT_STROKE_Y_PX = 70;
const SHORT_STROKE_ORIGINS = [
  [0.18, 0.2],
  [0.35, 0.32],
  [0.53, 0.43],
  [0.7, 0.55],
  [0.24, 0.67],
  [0.42, 0.26],
  [0.59, 0.38],
  [0.76, 0.5],
];
// The eraser keeps this fixed geometry too, on purpose. The first cut of issue
// 1292 offset each repeat so later passes would cross fresh ink; review round
// 2's measurement retired the whole approach: even the optimal placement
// schedule (searched numerically over rank-1 lattices and continuous Kronecker
// generators against the exact parallel-lane metric) attains a 7 px minimum
// lane distance against a 16 px eraser on a 700x300 landscape canvas, and the
// canvas SATURATES by pass 5 — fresh-path fractions 100/55/10/20/7/0/0/0/0/0%.
// Ten identical-work passes cannot stay fresh in that geometry no matter where
// the strokes go. Fresh ink comes from refilling the tiles between passes
// instead (eraser-fill.mjs), which also restores identical geometry across
// brushes.
export const STROKES_PER_GESTURE_REPEAT = LONG_STROKE_SEEDS.length + SHORT_STROKE_ORIGINS.length;

export function nativeCanvasBounds({
  webGeometry,
  webViewBounds,
  nativeWindow,
  includeBrowserChrome = true,
}) {
  const scale = webViewBounds.width / webGeometry.viewport.width;
  // A native WebView deficit against the window must NOT be added here the
  // way Safari's browser chrome is: an inset WKWebView (issues 1237 and 2212)
  // put it at the top or the bottom depending on its rotation history, so no
  // side can be assumed. The action capture measures the real offset from an
  // accessibility frame instead (calibrateWebContentOffset in
  // capture-xcuitest-actions.mjs).
  const browserChromeHeight = includeBrowserChrome
    ? Math.max(0, nativeWindow.height - webGeometry.viewport.height * scale)
    : 0;
  return {
    x: webViewBounds.x + webGeometry.canvas.x * scale,
    y: webViewBounds.y + browserChromeHeight + webGeometry.canvas.y * scale,
    width: webGeometry.canvas.width * scale,
    height: webGeometry.canvas.height * scale,
  };
}

function addLongStroke(actions, bounds, seed) {
  actions.push({
    type: 'pointerMove',
    duration: 0,
    origin: 'viewport',
    x: bounds.x + bounds.width * 0.12,
    y: bounds.y + bounds.height * (0.28 + seed * 0.18),
  });
  actions.push({ type: 'pointerDown', button: 0 });
  for (let index = 1; index <= LONG_STROKE_SEGMENTS; index++) {
    const progress = index / LONG_STROKE_SEGMENTS;
    actions.push({
      type: 'pointerMove',
      duration: LONG_STROKE_DURATION_MS / LONG_STROKE_SEGMENTS,
      origin: 'viewport',
      x: bounds.x + bounds.width * (0.12 + progress * 0.76),
      y:
        bounds.y +
        bounds.height *
          (0.35 + seed * 0.15 + Math.sin(progress * Math.PI * 2 * LONG_STROKE_WAVES + seed) * 0.18),
    });
  }
  actions.push({ type: 'pointerUp', button: 0 });
  actions.push({ type: 'pause', duration: LONG_STROKE_PAUSE_MS });
}

function addShortStroke(actions, bounds, [xFraction, yFraction]) {
  const x = bounds.x + bounds.width * xFraction;
  const y = bounds.y + bounds.height * yFraction;
  actions.push({ type: 'pointerMove', duration: 0, origin: 'viewport', x, y });
  actions.push({ type: 'pointerDown', button: 0 });
  actions.push({
    type: 'pointerMove',
    duration: SHORT_STROKE_DURATION_MS,
    origin: 'viewport',
    x: x + SHORT_STROKE_X_PX,
    y: y + SHORT_STROKE_Y_PX,
  });
  actions.push({ type: 'pointerUp', button: 0 });
  actions.push({ type: 'pause', duration: SHORT_STROKE_PAUSE_MS });
}

export function trustedGestureActions(bounds, repeats = 1, repeatPauseMs = 0) {
  const actions = [];
  for (let repeat = 0; repeat < repeats; repeat++) {
    if (repeat > 0 && repeatPauseMs > 0) {
      actions.push({ type: 'pause', duration: repeatPauseMs });
    }
    for (const seed of LONG_STROKE_SEEDS) addLongStroke(actions, bounds, seed);
    for (const origin of SHORT_STROKE_ORIGINS) addShortStroke(actions, bounds, origin);
  }
  return actions;
}

export async function driveTrustedGesturePasses({ repeats, perform, refillBetweenPasses = null }) {
  if (!refillBetweenPasses) {
    await perform(repeats);
    return null;
  }

  const refills = [];
  for (let index = 0; index < repeats; index += 1) {
    await perform(1);
    if (index < repeats - 1) {
      refills.push(await refillBetweenPasses((index + 1) * STROKES_PER_GESTURE_REPEAT));
    }
  }
  return refills;
}
