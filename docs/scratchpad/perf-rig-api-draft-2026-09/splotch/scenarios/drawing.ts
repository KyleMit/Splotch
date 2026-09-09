// The frames scenario family: one brush, the real-screen probe, the fixed gesture plan, and the
// pen cell's ten measured undos. Geometry is Splotch's and deliberately fixed for every brush
// (a canvas saturates by pass five); freshness comes from the eraser's prime between passes.
import {
  defineScenario,
  type Bounds,
  type GesturePlan,
  type PointerAction,
  type PointerSequence,
  type PaperControls,
} from 'perf-rig';
import { splotch, type Brush } from '../app.js';

const LONG_STROKE_SEEDS = [0.2, 0.7] as const;
const LONG_STROKE_WAVES = 3;
const LONG_STROKE_MS = 2000;
const LONG_STROKE_SEGMENTS = 4;
const LONG_STROKE_PAUSE_MS = 120;
const SHORT_STROKE_ORIGINS = [
  [0.2, 0.2],
  [0.5, 0.2],
  [0.8, 0.2],
  [0.2, 0.5],
  [0.8, 0.5],
  [0.2, 0.8],
  [0.5, 0.8],
  [0.8, 0.8],
] as const;
const SHORT_STROKE_MS = 240;
const SHORT_STROKE_DELTA_PX = { x: 45, y: 70 } as const;
const SHORT_STROKE_PAUSE_MS = 90;

const move = (x: number, y: number, duration: number): PointerAction => ({
  type: 'pointerMove',
  duration,
  origin: 'viewport',
  x,
  y,
});

function longStroke(bounds: Bounds, seed: number): PointerAction[] {
  const startX = bounds.x + bounds.width * 0.12;
  const y = bounds.y + bounds.height * (0.28 + seed * 0.18);
  const actions: PointerAction[] = [move(startX, y, 0), { type: 'pointerDown', button: 0 }];
  for (let segment = 1; segment <= LONG_STROKE_SEGMENTS; segment += 1) {
    const t = segment / LONG_STROKE_SEGMENTS;
    actions.push(
      move(
        startX + bounds.width * 0.76 * t,
        y + Math.sin(t * Math.PI * 2 * LONG_STROKE_WAVES) * bounds.height * 0.08,
        LONG_STROKE_MS / LONG_STROKE_SEGMENTS
      )
    );
  }
  actions.push({ type: 'pointerUp' }, { type: 'pause', duration: LONG_STROKE_PAUSE_MS });
  return actions;
}

function shortStroke(bounds: Bounds, [fx, fy]: readonly [number, number]): PointerAction[] {
  const x = bounds.x + bounds.width * fx;
  const y = bounds.y + bounds.height * fy;
  return [
    move(x, y, 0),
    { type: 'pointerDown', button: 0 },
    move(x + SHORT_STROKE_DELTA_PX.x, y + SHORT_STROKE_DELTA_PX.y, SHORT_STROKE_MS),
    { type: 'pointerUp' },
    { type: 'pause', duration: SHORT_STROKE_PAUSE_MS },
  ];
}

export const GESTURE_REPEATS = 10;
export const UNDO_COUNT = 10;

export const trustedGesturePlan = (primeBetweenPasses: boolean): GesturePlan => ({
  id: primeBetweenPasses ? 'fixed-geometry-refilled' : 'fixed-geometry',
  strokesPerRepeat: LONG_STROKE_SEEDS.length + SHORT_STROKE_ORIGINS.length,
  repeats: GESTURE_REPEATS,
  pauseMs: 0,
  primeBetweenPasses,
  generate: (bounds, repeats, pauseMs): readonly PointerSequence[] => {
    const actions: PointerAction[] = [];
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      for (const seed of LONG_STROKE_SEEDS) actions.push(...longStroke(bounds, seed));
      for (const origin of SHORT_STROKE_ORIGINS) actions.push(...shortStroke(bounds, origin));
      if (pauseMs > 0) actions.push({ type: 'pause', duration: pauseMs });
    }
    return [{ source: 'finger', pointerType: 'touch', actions }];
  },
});

export const paperControls: PaperControls = {
  ensureBlank: {
    name: 'clear-coloring-page',
    steps: [
      {
        kind: 'ifPresent',
        target: 'button[aria-label^="Clear active coloring page:"]',
        then: [{ kind: 'click', target: 'button[aria-label^="Clear active coloring page:"]' }],
      },
    ],
  },
  ensurePage: {
    name: 'open-coloring-page',
    steps: [
      { kind: 'click', target: '#coloringBookButton' },
      { kind: 'waitVisible', target: 'button[aria-label$="coloring book"]', timeoutMs: 5000 },
      { kind: 'click', target: 'button[aria-label$="coloring book"]' },
      { kind: 'waitVisible', target: 'button[aria-label$="coloring page"]', timeoutMs: 5000 },
      { kind: 'click', target: 'button[aria-label$="coloring page"]' },
      { kind: 'waitPresent', target: '#coloringOverlay.overlay-ready', timeoutMs: 10_000 },
    ],
  },
  instructions: {
    blank: 'Draw on blank paper.',
    page: 'Open the coloring book and tap any page, then draw on it.',
  },
};

export const drawingCell = (brush: Brush) =>
  defineScenario(splotch, {
    kind: 'frames',
    id: `drawing-${brush}`,
    description: `Blank-paper drawing with the ${brush} brush over the trusted gesture plan.`,
    tool: brush,
    phases: [{ key: 'blank', paper: 'blank' }],
    input: { kind: 'transport', gesture: trustedGesturePlan(brush === 'eraser') },
    contactCapMs: 60_000,
    ...(brush === 'pen'
      ? { repeatedAction: { control: 'undo' as const, count: UNDO_COUNT, pauseMs: 250 } }
      : {}),
  });

/** perf:web:frames without an iPad: the probe's own synthetic hand at iPad Pro geometry. */
export const localFrames = (brush: Brush) =>
  defineScenario(splotch, {
    kind: 'frames',
    id: `local-frames-${brush}`,
    description: 'The real-screen probe driven by its synthetic hand in a local browser.',
    tool: brush,
    phases: [{ key: 'blank', paper: 'blank' }],
    input: { kind: 'probe-synthetic', hz: 120, shape: 'mixed' },
    contactCapMs: 25_000,
    ...(brush === 'pen'
      ? { repeatedAction: { control: 'undo' as const, count: UNDO_COUNT, pauseMs: 250 } }
      : {}),
  });

/** The HUD-guided suppression sweep of perf:ios:webkit:frames; the nudge pin is a computed value, not a static rule. */
export const realScreenSweep = defineScenario(splotch, {
  kind: 'frames',
  id: 'real-screen-sweep',
  description: 'HUD-guided phase sweep over the blend nudge, mix-blend-mode, and pointer halos.',
  tool: 'pen',
  phases: [
    { key: 'blank', paper: 'blank' },
    { key: 'page', paper: 'page' },
    {
      key: 'page-no-nudge',
      paper: 'page',
      suppress: [{ kind: 'pin-computed', target: '.paper-view', property: 'transform' }],
    },
    {
      key: 'page-no-blend',
      paper: 'page',
      suppress: [{ kind: 'css', css: '.paper-view { mix-blend-mode: normal !important; }' }],
    },
    {
      key: 'page-no-halos',
      paper: 'page',
      suppress: [{ kind: 'css', css: '.brush-ring, .eraser-bubble { display: none !important; }' }],
    },
  ],
  input: { kind: 'human', seconds: 25 },
  contactCapMs: 25_000,
  hud: true,
});
