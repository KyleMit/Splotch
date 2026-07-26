// Executable form of the responsive-trim ladders in ColorPalette.svelte and
// ColorPicker.svelte (ADR-0048). Those components trim swatches/rows/columns
// with pure CSS, so every breakpoint is a hand-evaluated arithmetic result
// baked into a `@media` rule. The formulas live here so a geometry change is
// re-derivable rather than re-guessable, and trimGeometry.test.ts pins each
// ladder against the literals actually committed in the two `<style>` blocks —
// a geometry edit that isn't matched by a CSS edit fails there.

// A `max-*` breakpoint has to sit just below the threshold at which the layout
// still fits, so the ladders encode `threshold - 0.02` (e.g. 588 → 587.98).
const BREAKPOINT_EPSILON_PX = 0.02;

export function justBelowPx(thresholdPx: number): number {
  return thresholdPx - BREAKPOINT_EPSILON_PX;
}

// ── ColorPalette ───────────────────────────────────────────────────────────
// The palette is a single flow of equal squares — a landscape column or a
// portrait row — so both axes share one extent formula.

export interface PaletteStackGeometry {
  swatchPx: number;
  gapPx: number;
  /** Both edges combined, not one side. */
  paddingPx: number;
}

export const PALETTE_COLUMN_GEOMETRY: PaletteStackGeometry = {
  swatchPx: 60,
  gapPx: 12,
  paddingPx: 24,
};

export const PALETTE_ROW_GEOMETRY: PaletteStackGeometry = {
  swatchPx: 55,
  gapPx: 8,
  paddingPx: 20,
};

function stackExtentPx(
  items: number,
  { swatchPx, gapPx, paddingPx }: PaletteStackGeometry
): number {
  return items * swatchPx + (items - 1) * gapPx + paddingPx;
}

/** Height at which a landscape single column still holds `swatches`. */
export function landscapeSingleColumnMinHeightPx(
  swatches: number,
  geometry: PaletteStackGeometry = PALETTE_COLUMN_GEOMETRY
): number {
  return stackExtentPx(swatches, geometry);
}

/**
 * Height at which the single column opens its `slot`-th position. Same family
 * as the trim ladder above — the core seven plus the gradient fill slots 1–8,
 * so the three bonus colors reveal at slots 9–11.
 */
export function landscapeBonusRevealMinHeightPx(
  slot: number,
  geometry: PaletteStackGeometry = PALETTE_COLUMN_GEOMETRY
): number {
  return landscapeSingleColumnMinHeightPx(slot, geometry);
}

/** Height below which the landscape two-column grid loses a row of two. */
export function landscapeTwoColumnMaxHeightPx(
  rows: number,
  geometry: PaletteStackGeometry = PALETTE_COLUMN_GEOMETRY
): number {
  return justBelowPx(stackExtentPx(rows, geometry));
}

/**
 * Width below which the portrait row loses a core swatch. The always-present
 * gradient swatch occupies one slot on top of the `coreSwatches` counted here.
 */
export function portraitMaxWidthPx(
  coreSwatches: number,
  geometry: PaletteStackGeometry = PALETTE_ROW_GEOMETRY
): number {
  return justBelowPx(stackExtentPx(coreSwatches + 1, geometry));
}

// ── ColorPicker ────────────────────────────────────────────────────────────
// The hexagon honeycomb overlaps its rows and indents alternating ones, so the
// two axes need different extents. Both are then divided by the 90vh/90vw cap
// the grid is sized against, which is why the ladder lands off-pixel and every
// step carries a hand-tuned whole-pixel buffer.

export interface HexGridGeometry {
  /** Full hexagon height; later rows overlap and only add `rowPitchPx`. */
  firstRowPx: number;
  rowPitchPx: number;
  columnPitchPx: number;
  /** Honeycomb indent on alternating rows, which widens the grid by one. */
  rowOffsetPx: number;
  /** Both edges combined, not one side. */
  paddingPx: number;
  /** The grid is capped at 90vh/90vw, so a viewport buys only this fraction. */
  viewportFraction: number;
}

export const HEX_GRID_GEOMETRY: HexGridGeometry = {
  firstRowPx: 69,
  rowPitchPx: 51,
  columnPitchPx: 60,
  rowOffsetPx: 31,
  paddingPx: 32,
  viewportFraction: 0.9,
};

/**
 * Height below which the honeycomb drops to fewer than `rows`. `bufferPx` is
 * the hand-tuned slack each encoded step leaves above the geometric minimum;
 * it is negative where a step was tightened below it instead.
 */
export function hexGridRowMaxHeightPx(
  rows: number,
  bufferPx: number,
  geometry: HexGridGeometry = HEX_GRID_GEOMETRY
): number {
  const contentPx = geometry.firstRowPx + geometry.rowPitchPx * (rows - 1) + geometry.paddingPx;
  return justBelowPx(Math.ceil(contentPx / geometry.viewportFraction) + bufferPx);
}

/**
 * Width below which the honeycomb drops to fewer than `columns`. `bufferPx`
 * carries the same hand-tuned slack as the row ladder.
 */
export function hexGridColumnMaxWidthPx(
  columns: number,
  bufferPx: number,
  geometry: HexGridGeometry = HEX_GRID_GEOMETRY
): number {
  const contentPx = geometry.columnPitchPx * columns + geometry.rowOffsetPx + geometry.paddingPx;
  return justBelowPx(Math.ceil(contentPx / geometry.viewportFraction) + bufferPx);
}
