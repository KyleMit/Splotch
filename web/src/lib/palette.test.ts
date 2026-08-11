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
    const hues = PALETTE_COLORS.filter(({ label }) => !isNeutral(label)).map(({ hex }) =>
      hueDegrees(hex)
    );
    // Descending all the way but for the single wrap past red, so every swatch
    // sits between the two hues nearest it rather than on the end of the bar.
    const climbs = hues.filter((hue, index) => index > 0 && hue > hues[index - 1]);
    expect(climbs).toHaveLength(1);
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
