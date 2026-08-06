// Executable form of the responsive-trim ladders in ColorPalette.svelte and
// ColorPicker.svelte (ADR-0048). Those components trim swatches/rows/columns
// with pure CSS, so every breakpoint is a hand-evaluated arithmetic result
// baked into a `@media` rule. This module holds the geometry, the formulas and
// the step tables — the whole ladder — so a size change is re-derivable rather
// than re-guessable, and trimGeometry.test.ts parses both `<style>` blocks and
// asserts the committed CSS still matches what these functions produce.

// A `max-*` breakpoint has to sit just below the threshold at which the layout
// still fits, so the ladders encode `threshold - 0.02` (e.g. 588 → 587.98).
const BREAKPOINT_EPSILON_PX = 0.02;

function justBelowPx(thresholdPx: number): number {
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

// The landscape Color Palette and Actions Panel both need this inline extent
// before hydration. app.css emits the values as a responsive custom property;
// actionButtonLayout.fallback.test.ts guards that copy against this source.
export const PALETTE_LANDSCAPE_WIDTHS_PX = {
  singleColumn: stackExtentPx(1, PALETTE_COLUMN_GEOMETRY),
  twoColumns: stackExtentPx(2, PALETTE_COLUMN_GEOMETRY),
} as const;

/**
 * Swatch counts the landscape single column is sized for, tallest first. Below
 * the last one a third swatch would have to go, so the layout falls back to the
 * roomier two-column grid instead of trimming further — which is why the trim
 * rules are floored at that count's height.
 */
const LANDSCAPE_SINGLE_COLUMN_LADDER = [8, 7, 6] as const;

/**
 * Column slots the three bonus colors reveal into. The core seven plus the
 * gradient swatch fill slots 1–8, so the bonuses start at 9.
 */
const LANDSCAPE_BONUS_REVEAL_LADDER = [9, 10, 11] as const;

/** Row counts the landscape two-column grid trims through, tallest first. */
const LANDSCAPE_TWO_COLUMN_LADDER = [4, 3, 2, 1] as const;

/** Core swatch counts the portrait row trims through, widest first. */
const PORTRAIT_LADDER = [7, 6, 5, 4, 3, 2, 1] as const;

/** Height at which a landscape single column still holds `swatches`. */
function landscapeSingleColumnMinHeightPx(swatches: number): number {
  return stackExtentPx(swatches, PALETTE_COLUMN_GEOMETRY);
}

/** Height below which the single column falls back to the two-column grid. */
export function landscapeSingleColumnFloorPx(): number {
  return landscapeSingleColumnMinHeightPx(LANDSCAPE_SINGLE_COLUMN_LADDER.at(-1)!);
}

export function landscapeSingleColumnMediaQuery(): string {
  return `(orientation: landscape) and (min-height: ${landscapeSingleColumnFloorPx()}px)`;
}

/**
 * Heights below which the single column loses another swatch. One step shorter
 * than the ladder: its last entry is the floor above, not a trim.
 */
export function landscapeSingleColumnTrimLadderPx(): number[] {
  return LANDSCAPE_SINGLE_COLUMN_LADDER.slice(0, -1).map((swatches) =>
    justBelowPx(landscapeSingleColumnMinHeightPx(swatches))
  );
}

/** Heights at which the single column opens each bonus color's slot. */
export function landscapeBonusRevealLadderPx(): number[] {
  return LANDSCAPE_BONUS_REVEAL_LADDER.map((slot) => landscapeSingleColumnMinHeightPx(slot));
}

/** Heights below which the landscape two-column grid loses a row of two. */
export function landscapeTwoColumnLadderPx(): number[] {
  return LANDSCAPE_TWO_COLUMN_LADDER.map((rows) =>
    justBelowPx(stackExtentPx(rows, PALETTE_COLUMN_GEOMETRY))
  );
}

/**
 * Widths below which the portrait row loses a core swatch. The always-present
 * gradient swatch occupies one slot on top of the core count.
 */
export function portraitLadderPx(): number[] {
  return PORTRAIT_LADDER.map((coreSwatches) =>
    justBelowPx(stackExtentPx(coreSwatches + 1, PALETTE_ROW_GEOMETRY))
  );
}

// ── ColorPicker ────────────────────────────────────────────────────────────
// The hexagon honeycomb overlaps its rows and indents alternating ones, so the
// two axes need different extents. Both are then divided by the 90vh/90vw cap
// the grid is sized against, which lands the raw minimum off-pixel — so each
// step rounds up, and the tables below carry the two hand-tightened exceptions.

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

interface HexGridLadderRule {
  /** The raw minimum is rounded up to a multiple of this before slack. */
  roundToPx: number;
  /** Slack past the rounded minimum, counted in `roundToPx` units. */
  slackSteps: number;
}

interface HexGridStep {
  /** Rows (or columns) still shown above this breakpoint. */
  count: number;
  /** Overrides the ladder's default slack for a hand-tightened step. */
  slackSteps?: number;
}

// Rows land on whole pixels with no slack…
const HEX_GRID_ROW_RULE: HexGridLadderRule = { roundToPx: 1, slackSteps: 0 };

const HEX_GRID_ROW_LADDER: readonly HexGridStep[] = [
  // Nine rows need 565.56px of viewport; this step is tightened down to 565
  // rather than up to 566, so the honeycomb overruns the 90vh cap by half a
  // pixel — invisible, and the picker clips it (overflow: hidden) anyway.
  { count: 9, slackSteps: -1 },
  { count: 8 },
  { count: 7 },
  { count: 6 },
  { count: 5 },
  { count: 4 },
];

// …while columns round to 5px and then take one more 5px step, keeping the
// wider ladder on round numbers with a little breathing room.
const HEX_GRID_COLUMN_RULE: HexGridLadderRule = { roundToPx: 5, slackSteps: 1 };

const HEX_GRID_COLUMN_LADDER: readonly HexGridStep[] = [
  { count: 9 },
  { count: 8 },
  { count: 7 },
  { count: 6 },
  { count: 5 },
  // Four columns need 336.67px, and this step stops at the first multiple of 5
  // above that (340) instead of the second (345) its neighbours take — 3.3px of
  // slack rather than 5–8.3px. The narrowest steps are the ones a small phone
  // actually lands on, so the tighter fit buys one more column there.
  { count: 4, slackSteps: 0 },
  { count: 3 },
];

function hexGridBreakpointPx(
  contentPx: number,
  rule: HexGridLadderRule,
  step: HexGridStep,
  viewportFraction: number
): number {
  const minViewportPx = contentPx / viewportFraction;
  const roundedPx = Math.ceil(minViewportPx / rule.roundToPx) * rule.roundToPx;
  const slackSteps = step.slackSteps ?? rule.slackSteps;
  return justBelowPx(roundedPx + slackSteps * rule.roundToPx);
}

/** Height below which the honeycomb drops below `step.count` rows. */
function hexGridRowMaxHeightPx(step: HexGridStep): number {
  const contentPx =
    HEX_GRID_GEOMETRY.firstRowPx +
    HEX_GRID_GEOMETRY.rowPitchPx * (step.count - 1) +
    HEX_GRID_GEOMETRY.paddingPx;
  return hexGridBreakpointPx(
    contentPx,
    HEX_GRID_ROW_RULE,
    step,
    HEX_GRID_GEOMETRY.viewportFraction
  );
}

/** Width below which the honeycomb drops below `step.count` columns. */
function hexGridColumnMaxWidthPx(step: HexGridStep): number {
  const contentPx =
    HEX_GRID_GEOMETRY.columnPitchPx * step.count +
    HEX_GRID_GEOMETRY.rowOffsetPx +
    HEX_GRID_GEOMETRY.paddingPx;
  return hexGridBreakpointPx(
    contentPx,
    HEX_GRID_COLUMN_RULE,
    step,
    HEX_GRID_GEOMETRY.viewportFraction
  );
}

export function hexGridRowLadderPx(): number[] {
  return HEX_GRID_ROW_LADDER.map((step) => hexGridRowMaxHeightPx(step));
}

export function hexGridColumnLadderPx(): number[] {
  return HEX_GRID_COLUMN_LADDER.map((step) => hexGridColumnMaxWidthPx(step));
}
