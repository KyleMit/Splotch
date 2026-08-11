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

// The custom (gradient) swatch shares the flow but is never trimmed, so every
// capacity below is a color count plus this.
const GRADIENT_SLOTS = 1;

/**
 * Slots the landscape single column holds on for before it gives up and falls
 * back to the roomier two-column grid. Five colors and the gradient swatch is
 * the narrowest rainbow worth keeping the one-bar layout — and the narrow bar's
 * extra canvas — for.
 */
const LANDSCAPE_SINGLE_COLUMN_FLOOR_SLOTS = 6;

/** Columns in the fallback grid below that floor. */
const LANDSCAPE_FALLBACK_COLUMNS = 2;

/** The portrait row trims all the way down to the untrimmable gradient swatch. */
const PORTRAIT_FLOOR_SLOTS = GRADIENT_SLOTS;

// The landscape Color Palette and Actions Panel both need this inline extent
// before hydration. app.css emits the values as a responsive custom property;
// actionButtonLayout.fallback.test.ts guards that copy against this source.
export const PALETTE_LANDSCAPE_WIDTHS_PX = {
  singleColumn: stackExtentPx(1, PALETTE_COLUMN_GEOMETRY),
  twoColumns: stackExtentPx(LANDSCAPE_FALLBACK_COLUMNS, PALETTE_COLUMN_GEOMETRY),
} as const;

/** One rule of a trim ladder: what it fires at, and what it takes away. */
export interface TrimStep {
  /** The `max-width`/`max-height` the rule is written against. */
  thresholdPx: number;
  /** Trim ranks this step hides, on top of everything a roomier step hid. */
  ranks: number[];
}

/** A ladder rung before its remaining-color count is turned into ranks. */
interface TrimRung {
  thresholdPx: number;
  /** Colors still on screen once this rung's rule applies. */
  remainingColors: number;
}

/**
 * Ladders are written as "how many colors survive here"; the CSS needs "which
 * ranks does this rule hide". Swatches leave in trim-rank order, so each rung
 * hides the ranks between the last rung's count and its own.
 */
function trimSteps(colorCount: number, rungs: readonly TrimRung[]): TrimStep[] {
  let hidden = 0;
  return rungs.map(({ thresholdPx, remainingColors }) => {
    const nowHidden = colorCount - Math.min(remainingColors, colorCount);
    const ranks = Array.from({ length: nowHidden - hidden }, (_, offset) => hidden + offset);
    hidden = nowHidden;
    return { thresholdPx, ranks };
  });
}

/**
 * One rung per swatch for a single flow, roomiest first: just below the extent
 * that fits `slots`, one more swatch has to go.
 */
function stackRungs(
  colorCount: number,
  floorSlots: number,
  geometry: PaletteStackGeometry
): TrimRung[] {
  const rungs: TrimRung[] = [];
  for (let slots = colorCount + GRADIENT_SLOTS; slots > floorSlots; slots--) {
    rungs.push({
      thresholdPx: justBelowPx(stackExtentPx(slots, geometry)),
      remainingColors: slots - 1 - GRADIENT_SLOTS,
    });
  }
  return rungs;
}

/**
 * The two-column grid drops a whole row of two at a time. Rows and single-column
 * slots measure the same way, so its first rung lands exactly on the layout
 * switch: the height where the single column gives up is the height where that
 * row count stops fitting, and everything the taller single column showed above
 * the grid's own capacity goes in that one step.
 */
function landscapeTwoColumnRungs(): TrimRung[] {
  const rungs: TrimRung[] = [];
  for (let rows = LANDSCAPE_SINGLE_COLUMN_FLOOR_SLOTS; rows >= 1; rows--) {
    rungs.push({
      thresholdPx: justBelowPx(stackExtentPx(rows, PALETTE_COLUMN_GEOMETRY)),
      remainingColors: Math.max(0, LANDSCAPE_FALLBACK_COLUMNS * (rows - 1) - GRADIENT_SLOTS),
    });
  }
  return rungs;
}

/** Height below which the single column falls back to the two-column grid. */
export function landscapeSingleColumnFloorPx(): number {
  return stackExtentPx(LANDSCAPE_SINGLE_COLUMN_FLOOR_SLOTS, PALETTE_COLUMN_GEOMETRY);
}

export function landscapeSingleColumnMediaQuery(): string {
  return `(orientation: landscape) and (min-height: ${landscapeSingleColumnFloorPx()}px)`;
}

/** Heights below which the single column loses another swatch. */
export function landscapeSingleColumnTrimSteps(colorCount: number): TrimStep[] {
  return trimSteps(
    colorCount,
    stackRungs(colorCount, LANDSCAPE_SINGLE_COLUMN_FLOOR_SLOTS, PALETTE_COLUMN_GEOMETRY)
  );
}

/** Heights below which the landscape two-column grid loses a row of two. */
export function landscapeTwoColumnTrimSteps(colorCount: number): TrimStep[] {
  return trimSteps(colorCount, landscapeTwoColumnRungs());
}

/** Widths below which the portrait row loses another swatch. */
export function portraitTrimSteps(colorCount: number): TrimStep[] {
  return trimSteps(colorCount, stackRungs(colorCount, PORTRAIT_FLOOR_SLOTS, PALETTE_ROW_GEOMETRY));
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
