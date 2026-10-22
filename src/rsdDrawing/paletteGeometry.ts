import { EDGE_INSET_PX, type AreaSize, type LayoutAxis } from './edgeLayout';

// The shipping Color Palette's flow, per axis: a portrait row of 55px swatches or a landscape
// column of 60px ones, each a fixed size the Button Size slider leaves alone. The candidate
// import boundary excludes shipping web source; rsd-native-drawing-frame.test.mjs reads
// trimGeometry.ts, ColorPalette.svelte and ColorSwatch.svelte and fails on divergence.
export type PaletteFlow = Readonly<{
  swatchPx: number;
  gapPx: number;
  // Padding at each end of the flow, and on the bar's two cross-axis sides.
  endPaddingPx: number;
  crossStartPaddingPx: number;
  crossEndPaddingPx: number;
  // The bar's declared cross-axis extent: the row's height, the column's width.
  extentPx: number;
  // The plate's drop shadow, cast onto the paper beside the bar.
  shadow: string;
}>;

export const PALETTE_FLOWS = {
  row: {
    swatchPx: 55,
    gapPx: 8,
    endPaddingPx: 10,
    // The swatch sits 2px high so its drop shadow ends at the bar's edge.
    crossStartPaddingPx: 8,
    crossEndPaddingPx: 12,
    extentPx: 75,
    shadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
  },
  column: {
    swatchPx: 60,
    gapPx: 12,
    endPaddingPx: 12,
    crossStartPaddingPx: 12,
    crossEndPaddingPx: 12,
    extentPx: 84,
    shadow: '2px 0 10px rgba(0, 0, 0, 0.1)',
  },
} as const satisfies Record<LayoutAxis, PaletteFlow>;

export function paletteAxis(area: AreaSize): LayoutAxis {
  return area.width > area.height ? 'column' : 'row';
}

// Selection Ring geometry from shipping's colorRing.ts: a 4px ring outside the swatch, over a
// 1px seam of the bar surface, around a 4px band of that surface inside the swatch's edge.
export const SELECTION_RING_WIDTH_PX = 4;
export const SELECTION_RING_GAP_PX = 4;
export const SELECTION_RING_SEAM_PX = 1;
// The seam and ring are separate circles, and each snaps to the pixel grid on its own: about a
// pixel apart at Android's fractional densities, which bared a sliver of the ring's inner edge as
// a second arc. The seam reaches this far past both edges it meets, under the ring and into the
// swatch's own surface band, so no snapping exposes either.
export const SELECTION_SEAM_OVERLAP_PX = 1;
// The honeycomb rests at the content box divided by the pop it takes when ringed.
export const MORE_COLORS_POP_SCALE = 1.12;

// How many swatches, More colors among them, fit along a bar of this length at full size. The
// touch target never shrinks to make room for a color: the shipping trim ladder's formula.
export function paletteSlots(length: number, axis: LayoutAxis) {
  const { swatchPx, gapPx, endPaddingPx } = PALETTE_FLOWS[axis];
  return Math.max(0, Math.floor((length - 2 * endPaddingPx + gapPx) / (swatchPx + gapPx)));
}

// Shipping's --palette-bottom: the landscape column runs to the screen's bottom edge and pads its
// far end so More colors centres on the Brush Button, which sits one edge inset above the bottom
// safe-area inset. rsd-native-drawing-frame.test.mjs reads the formula from ColorPalette.svelte.
export function columnEndClearance(actionButtonPx: number, insetBottom: number) {
  const half = PALETTE_FLOWS.column.swatchPx / 2;
  return Math.max(0, EDGE_INSET_PX + actionButtonPx / 2 - half + insetBottom);
}

// Shipping spreads the swatches it keeps across the whole bar (space-between) inside its end
// paddings; the spacing is stated outright so the paint group and More colors share it. A flow
// longer than the bar keeps the gap and overruns the far padding, as shipping's grid does.
export function paletteSpacing(
  length: number,
  axis: LayoutAxis,
  count: number,
  endClearance: number
) {
  const { swatchPx, gapPx, endPaddingPx } = PALETTE_FLOWS[axis];
  if (count < 2) return gapPx;
  return Math.max(gapPx, (length - endPaddingPx - endClearance - count * swatchPx) / (count - 1));
}

const DARK_SWATCH_BRIGHTNESS = 0.2;
const RING_LIGHTEN_STEP = 38;
const RING_DARKEN_FACTOR = 0.9;

function channels(hex: string) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

// Shipping's getRingColor: about 10% darker than the swatch, or lighter for a swatch too dark
// for darkening to show, judged by ITU-R BT.601 perceived brightness.
export function selectionRingColor(hex: string) {
  const [red, green, blue] = channels(hex);
  const brightness = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
  const shift =
    brightness < DARK_SWATCH_BRIGHTNESS
      ? (value: number) => Math.min(255, Math.round(value + RING_LIGHTEN_STEP))
      : (value: number) => Math.max(0, Math.round(value * RING_DARKEN_FACTOR));
  return `#${[red, green, blue].map((value) => shift(value).toString(16).padStart(2, '0')).join('')}`;
}
