// The frames scenario family: one brush, the real-screen probe, the fixed gesture plan, and the
// pen cell's ten measured undos. Geometry is Splotch's and deliberately fixed for every brush
// (a canvas saturates by pass five); freshness comes from the eraser's prime between passes.
import { defineScenario, type Bounds, type GesturePlan, type PointerAction } from 'perf-rig';

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
    const x = startX + bounds.width * 0.76 * t;
    const wave = Math.sin(t * Math.PI * 2 * LONG_STROKE_WAVES) * bounds.height * 0.08;
    actions.push(move(x, y + wave, LONG_STROKE_MS / LONG_STROKE_SEGMENTS));
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

export const trustedGesturePlan = (primeBetweenPasses: boolean): GesturePlan => ({
  id: primeBetweenPasses ? 'fixed-geometry-refilled' : 'fixed-geometry',
  strokesPerRepeat: LONG_STROKE_SEEDS.length + SHORT_STROKE_ORIGINS.length,
  repeats: GESTURE_REPEATS,
  pauseMs: 0,
  primeBetweenPasses,
  generate: (bounds, repeats, pauseMs) => {
    const plan: PointerAction[] = [];
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      for (const seed of LONG_STROKE_SEEDS) plan.push(...longStroke(bounds, seed));
      for (const origin of SHORT_STROKE_ORIGINS) plan.push(...shortStroke(bounds, origin));
      if (pauseMs > 0) plan.push({ type: 'pause', duration: pauseMs });
    }
    return plan;
  },
});

export const UNDO_COUNT = 10;

export const drawingCell = (brush: 'pen' | 'crayon' | 'magic' | 'eraser') =>
  defineScenario({
    kind: 'frames',
    id: `drawing-${brush}`,
    description: `Blank-paper drawing with the ${brush} brush over the trusted gesture plan.`,
    mode: brush,
    phases: [{ key: 'blank' }],
    gesture: trustedGesturePlan(brush === 'eraser'),
    contactMs: 60_000,
    hud: false,
    ...(brush === 'pen'
      ? {
          afterDrawing: {
            control: 'undo',
            count: UNDO_COUNT,
            pauseMs: 250,
            proof: 'history-depth-and-pixels' as const,
          },
        }
      : {}),
  });

// The hand-driven and suppression-sweep variants of perf:ios:webkit:frames / perf:web:frames.
export const realScreenSweep = defineScenario({
  kind: 'frames',
  id: 'real-screen-sweep',
  description: 'HUD-guided phase sweep over the blend nudge, mix-blend-mode, and pointer halos.',
  mode: 'pen',
  phases: [
    { key: 'blank' },
    {
      key: 'page',
      setup: {
        name: 'open-coloring-page',
        steps: [
          { kind: 'click', target: '#coloringBookButton' },
          { kind: 'waitVisible', target: 'button[aria-label$="coloring page"]' },
          { kind: 'click', target: 'button[aria-label$="coloring page"]' },
          { kind: 'waitVisible', target: '#coloringOverlay.overlay-ready' },
        ],
      },
    },
    { key: 'page-no-nudge', suppressCss: '.paper-view { transform: none !important; }' },
    { key: 'page-no-blend', suppressCss: '.paper-view { mix-blend-mode: normal !important; }' },
    {
      key: 'page-no-halos',
      suppressCss: '.brush-ring, .eraser-bubble { display: none !important; }',
    },
  ],
  gesture: trustedGesturePlan(false),
  contactMs: 25_000,
  hud: true,
});
