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
  paper: readonly [number, number, number];
  strokes: ReferenceStroke[];
  labels: SceneLabel[];
}

const WIDTH = 1120;
const HEIGHT = 780;
const STROKE_WIDTH_PX = 46;
const LEFT = 96;
const RIGHT = WIDTH - 96;

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
const HAND_STEP_PX = 4;
const FLICK_STEP_PX = 32;

const BAND_Y = [140, 320, 500, 670];
const SWELL = 52;

function buildStrokes(): ReferenceStroke[] {
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

export const REFERENCE_SCENE: ReferenceScene = {
  width: WIDTH,
  height: HEIGHT,
  paper: PAPER,
  strokes: buildStrokes(),
  labels: [
    { text: '1 · single pass', x: LEFT, y: BAND_Y[0] - 92 },
    { text: '2 · fast sweep (flick point spacing)', x: LEFT, y: BAND_Y[1] - 92 },
    { text: '3 · wax buildup — one, two, three passes', x: LEFT, y: BAND_Y[2] - 78 },
    { text: '4 · subtractive glaze — blue over yellow', x: LEFT, y: BAND_Y[3] - 74 },
  ],
};

// Where the contact sheet crops its detail tile from: the crest of the first
// band, where the tooth, the rim feather and the shade mottling are all in one
// place at full stroke width.
export const DETAIL_CROP = { x: 300, y: 60, width: 260, height: 170 } as const;
