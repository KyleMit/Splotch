// The fixed scene every renderer draws, so the three options can be compared
// pixel-for-pixel and frame-for-frame rather than by feel.
//
// Four bands, each isolating one thing the CPU crayon is judged on today:
//
//   1. Single pass    — the airy first-stroke look CRAYON_DEFAULTS tunes for.
//   2. Fast sweep     — the same curve at a flick's point spacing, where a
//                       stamped tip beads and an analytic one should not.
//   3. Wax buildup    — one, two and three same-colour passes side by side.
//                       Each pass phase-shifts the tooth, so the later ones
//                       must fill in bare paper WITHOUT shifting hue.
//   4. Subtractive    — blue laid over yellow. Under gl.MIN this has to read
//                       green; an rgb average would read grey.
//
// Points are authored at a realistic digitiser cadence so the replay's frame
// batches match what strokeRasterQueue sees on device.

import { paletteHex } from '../../palette';

export interface ReferenceStroke {
  label: string;
  color: string;
  widthPx: number;
  // Phase-shifts the tooth field, exactly as crayonBrush's per-op integer seed
  // does. Equal seeds must produce equal pixels; different seeds must fill in
  // each other's tooth.
  seed: number;
  points: Float32Array;
}

export interface SceneLabel {
  text: string;
  x: number;
  y: number;
}

export interface ReferenceScene {
  width: number;
  height: number;
  // What the authored 1120x780 layout was multiplied by. Labels stay in
  // authored coordinates and are positioned by CSS against the presented size.
  scale: number;
  paper: readonly [number, number, number];
  strokes: ReferenceStroke[];
  labels: SceneLabel[];
}

// The scene is authored at this size and scaled up whole. Scale exists because
// at 1x on an Apple M5 the three architectures were indistinguishable for a
// reason that had nothing to do with them: a probe that removed the draw call
// entirely took GPU time to zero, while cutting the stamped option's instance
// count fivefold moved it 8%. At that workload every option is bound by
// per-draw-call overhead, and a benchmark that cannot separate 5x less work
// from the same work cannot judge an optimisation either.
//
// IPAD_SCALE puts the surface at the 12.9-inch iPad Pro's real backing store
// (2732x1830 at the capped DPR of 2, ADR-0015) — 5.7x the pixels, which is the
// load the architectures actually have to survive.
const BASE_WIDTH = 1120;
const BASE_HEIGHT = 780;
const BASE_STROKE_WIDTH_PX = 46;
const MARGIN = 96;

export const IPAD_SCALE = 2732 / BASE_WIDTH;

// #fcfbf8, the light-theme --paper token, as the ink target's clear colour.
const PAPER: readonly [number, number, number] = [0xfc / 255, 0xfb / 255, 0xf8 / 255];

function sampleCurve(
  from: number,
  to: number,
  step: number,
  y: (t: number, x: number) => number
): Float32Array {
  const count = Math.max(2, Math.floor((to - from) / step) + 1);
  const points = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = from + ((to - from) * i) / (count - 1);
    points[i * 2] = x;
    points[i * 2 + 1] = y(i / (count - 1), x);
  }
  return points;
}

function zigzag(from: number, to: number, centreY: number, amplitude: number, teeth: number) {
  const step = (to - from) / teeth;
  const points = new Float32Array((teeth + 1) * 2);
  for (let i = 0; i <= teeth; i++) {
    points[i * 2] = from + step * i;
    points[i * 2 + 1] = centreY + (i % 2 === 0 ? -amplitude : amplitude);
  }
  return points;
}

// A hand at drawing speed puts roughly one point every 4 px; a flick puts one
// every 30-plus, which is where a fixed stamp spacing starts to show.
const BASE_HAND_STEP_PX = 4;
const BASE_FLICK_STEP_PX = 32;

const BASE_BAND_Y = [140, 320, 500, 670];
const BASE_SWELL = 52;

function buildStrokes(scale: number): ReferenceStroke[] {
  const WIDTH = Math.round(BASE_WIDTH * scale);
  const HEIGHT = Math.round(BASE_HEIGHT * scale);
  const STROKE_WIDTH_PX = BASE_STROKE_WIDTH_PX * scale;
  const LEFT = MARGIN * scale;
  const RIGHT = WIDTH - MARGIN * scale;
  const BAND_Y = BASE_BAND_Y.map((y) => y * scale);
  const SWELL = BASE_SWELL * scale;
  // Point spacing is a property of the HAND, not of the surface: a finger puts
  // down the same number of samples per second whichever device it is on, so a
  // bigger paper gets longer segments rather than more of them. Scaling this
  // too would quietly hold segments-per-brush-width constant and hide exactly
  // the regime the scale-up exists to reach.
  const HAND_STEP_PX = BASE_HAND_STEP_PX * scale;
  const FLICK_STEP_PX = BASE_FLICK_STEP_PX * scale;
  const strokes: ReferenceStroke[] = [];

  strokes.push({
    label: 'single pass',
    color: paletteHex('Purple'),
    widthPx: STROKE_WIDTH_PX,
    seed: 1,
    points: sampleCurve(
      LEFT,
      RIGHT,
      HAND_STEP_PX,
      (t) => BAND_Y[0] + Math.sin(t * Math.PI * 2) * SWELL
    ),
  });

  strokes.push({
    label: 'fast sweep',
    color: paletteHex('Orange'),
    widthPx: STROKE_WIDTH_PX,
    seed: 2,
    points: sampleCurve(
      LEFT,
      RIGHT,
      FLICK_STEP_PX,
      (t) => BAND_Y[1] + Math.sin(t * Math.PI * 2) * SWELL
    ),
  });

  // Three side-by-side thirds, stroked once, twice and three times. Every pass
  // gets its own seed so the tooth it leaves bare is not the tooth the next
  // one leaves bare.
  const third = (RIGHT - LEFT) / 3;
  for (let column = 0; column < 3; column++) {
    const from = LEFT + third * column + 14;
    const to = LEFT + third * (column + 1) - 14;
    for (let pass = 0; pass <= column; pass++) {
      strokes.push({
        label: `buildup ×${column + 1}`,
        color: paletteHex('Mint'),
        widthPx: STROKE_WIDTH_PX,
        seed: 10 + column * 4 + pass,
        points: zigzag(from, to, BAND_Y[2], 34, 5),
      });
    }
  }

  strokes.push({
    label: 'glaze base',
    color: paletteHex('Yellow'),
    widthPx: STROKE_WIDTH_PX * 1.6,
    seed: 30,
    points: sampleCurve(LEFT, RIGHT, HAND_STEP_PX, () => BAND_Y[3]),
  });
  strokes.push({
    label: 'glaze over',
    color: paletteHex('Blue'),
    widthPx: STROKE_WIDTH_PX,
    seed: 31,
    points: sampleCurve(
      LEFT + 40,
      RIGHT - 40,
      HAND_STEP_PX,
      (t) => BAND_Y[3] + Math.sin(t * Math.PI * 5) * 30
    ),
  });

  return strokes;
}

export function buildReferenceScene(scale = 1): ReferenceScene {
  return {
    width: Math.round(BASE_WIDTH * scale),
    height: Math.round(BASE_HEIGHT * scale),
    scale,
    paper: PAPER,
    strokes: buildStrokes(scale),
    labels: [
      { text: '1 · single pass', x: MARGIN, y: BASE_BAND_Y[0] - 92 },
      { text: '2 · fast sweep (flick point spacing)', x: MARGIN, y: BASE_BAND_Y[1] - 92 },
      { text: '3 · wax buildup — one, two, three passes', x: MARGIN, y: BASE_BAND_Y[2] - 78 },
      { text: '4 · subtractive glaze — blue over yellow', x: MARGIN, y: BASE_BAND_Y[3] - 74 },
    ],
  };
}

export const REFERENCE_SCENE: ReferenceScene = buildReferenceScene();

// Where the contact sheet crops its detail tile from: the crest of the first
// band, where the tooth, the rim feather and the shade mottling are all in one
// place at full stroke width.
export const DETAIL_CROP = { x: 300, y: 60, width: 260, height: 170 } as const;
