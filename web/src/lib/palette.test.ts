// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { PALETTE_COLORS, TRIM_ORDER, paletteHex, type PaletteLabel } from './palette';

// The palette's two orders are design decisions with consequences a type can't
// carry: the display order has to read as a spectrum at every trim depth, and
// the trim order decides which hues a small screen is left with. Both are
// asserted here so a new swatch dropped on the end of a list fails rather than
// quietly clumping the extras or stranding a phone with three shades of one hue.

/** Swatches with no place on the color wheel; they close the display order. */
const NEUTRAL_LABELS: readonly PaletteLabel[] = ['Grey', 'Black'];

/** The rainbow left when there's room for only a handful of swatches. */
const CORE_RAINBOW: readonly PaletteLabel[] = [
  'Red',
  'Orange',
  'Green',
  'Yellow',
  'Blue',
  'Purple',
  'Black',
];

const isNeutral = (label: string) => NEUTRAL_LABELS.some((neutral) => neutral === label);

/** Position on the color wheel, 0–360. Undefined for a neutral, hence isNeutral. */
function hueDegrees(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  const sextant =
    max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return (sextant * 60 + 360) % 360;
}

describe('palette display order', () => {
  it('walks one way around the color wheel', () => {
    const hued = PALETTE_COLORS.filter(({ label }) => !isNeutral(label));
    // How far the wheel turns to reach the next swatch, always measured in the
    // one direction the bar walks, so the wrap past red is an ordinary step and
    // a swatch out of place is a huge one. Every step is a real move and the
    // whole bar is under one turn: a swatch dropped on the end (or between the
    // wrong two neighbours) has to be walked back to, which either laps the
    // wheel or doubles back past the rest of the bar. That's what makes each
    // swatch sit between the two hues nearest it rather than clumping.
    const steps = hued.slice(1).map(({ hex }, index) => ({
      between: `${hued[index].label} → ${hued[index + 1].label}`,
      degrees: (hueDegrees(hued[index].hex) - hueDegrees(hex) + 360) % 360,
    }));
    for (const { between, degrees } of steps) {
      expect(degrees, `${between} moves around the wheel`).toBeGreaterThan(0);
    }
    // The arc the bar never walks — the last swatch back around to the first —
    // is the seam a ring is cut at to lay it out in a line. Keeping it wider
    // than a typical step is what makes the two ends read as ends: a swatch
    // dropped on the end rather than between the two hues nearest it lands
    // inside the seam, leaving the bar to start and finish on neighbouring
    // hues. Lapping the wheel outright makes the seam negative.
    const walked = steps.reduce((total, { degrees }) => total + degrees, 0);
    expect(360 - walked).toBeGreaterThan(walked / steps.length);
  });

  it('closes with the neutrals', () => {
    const tail = PALETTE_COLORS.slice(-NEUTRAL_LABELS.length).map(({ label }) => label);
    expect(tail).toEqual([...NEUTRAL_LABELS]);
  });
});

describe('palette trim order', () => {
  it('leaves a full rainbow on a palette with room for only a handful', () => {
    const keptLongest = [...TRIM_ORDER].slice(-CORE_RAINBOW.length);
    expect(keptLongest).toEqual(CORE_RAINBOW.map((label) => paletteHex(label)));
  });

  it('gives every swatch exactly one place in the priority', () => {
    expect([...TRIM_ORDER].sort()).toEqual(PALETTE_COLORS.map(({ hex }) => hex).sort());
  });
});
