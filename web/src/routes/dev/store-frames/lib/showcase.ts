// Page 04's doodle→masterpiece showcase spec: a real child-style drawing and
// the real generation it produced (scrapbook/model-eval), joined by the app's
// own wand-stars icon with a stepping-stone connector — palette-color stones
// trail from the doodle into the wand, growing sparkles burst out toward the
// polaroid. The wand is never rotated: its AI badge must read flat.

import type { PaletteLabel } from '../../../../lib/palette.ts';
import type { StoreOrientation } from './targets.ts';

interface ShowcasePlacement {
  x: number;
  y: number;
  w: number;
}

interface ShowcaseStone {
  x: number;
  y: number;
  d: number;
  color: PaletteLabel;
}

interface ShowcaseSparkle extends ShowcasePlacement {
  color: PaletteLabel;
}

export interface ShowcaseSpec {
  doodle: ShowcasePlacement;
  wand: ShowcasePlacement;
  polaroid: ShowcasePlacement;
  stones: readonly ShowcaseStone[];
  sparkles: readonly ShowcaseSparkle[];
}

export const SHOWCASE_SPEC: Record<StoreOrientation, ShowcaseSpec> = {
  landscape: {
    doodle: { x: 620, y: 290, w: 530 },
    wand: { x: 1210, y: 430, w: 115 },
    polaroid: { x: 1370, y: 235, w: 530 },
    stones: [
      { x: 1085, y: 655, d: 24, color: 'Purple' },
      { x: 1125, y: 600, d: 20, color: 'Blue' },
      { x: 1160, y: 548, d: 26, color: 'Green' },
      { x: 1192, y: 500, d: 20, color: 'Yellow' },
    ],
    sparkles: [
      { x: 1338, y: 400, w: 34, color: 'Orange' },
      { x: 1356, y: 352, w: 40, color: 'Pink' },
      { x: 1344, y: 302, w: 36, color: 'Blue' },
      { x: 1316, y: 252, w: 46, color: 'Yellow' },
    ],
  },
  portrait: {
    doodle: { x: 88, y: 603, w: 737 },
    wand: { x: 687, y: 1236, w: 199 },
    polaroid: { x: 251, y: 1515, w: 754 },
    stones: [
      { x: 487, y: 1113, d: 40, color: 'Purple' },
      { x: 579, y: 1140, d: 33, color: 'Blue' },
      { x: 662, y: 1174, d: 43, color: 'Green' },
      { x: 720, y: 1218, d: 33, color: 'Yellow' },
    ],
    sparkles: [
      { x: 764, y: 1347, w: 61, color: 'Orange' },
      { x: 720, y: 1400, w: 74, color: 'Pink' },
      { x: 672, y: 1451, w: 64, color: 'Blue' },
      { x: 607, y: 1474, w: 83, color: 'Yellow' },
    ],
  },
};

// The portrait showcase is authored against the App Store 6.9" slot's height
// (2796 output px / k = 2341 base px). The Play phone slot is proportionally
// shorter (1920), so the whole composition scales down uniformly around the
// page's horizontal center — extra whitespace instead of overflow, with the
// connector arc's geometry intact.
export const P_SHOWCASE_DESIGN_H = 2341;

// The doodle card and polaroid carry their own portrait dimensions from the
// handoff (28 / 14 output px radii, 22px paper padding, 34px caption).
export interface ShowcaseCardSpec {
  doodleRadius: number;
  polaroidRadius: number;
  pad: number;
  caption: number;
  captionPad: readonly [number, number];
}

export const SHOWCASE_CARD_SPEC: Record<StoreOrientation, ShowcaseCardSpec> = {
  landscape: { doodleRadius: 24, polaroidRadius: 10, pad: 16, caption: 27, captionPad: [14, 16] },
  portrait: {
    doodleRadius: 23.4,
    polaroidRadius: 11.7,
    pad: 18.4,
    caption: 28.5,
    captionPad: [16, 18],
  },
};
