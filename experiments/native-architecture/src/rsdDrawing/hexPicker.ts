import { LARGE_TABLET_MIN_SIDE_PX } from '../../../../web/src/lib/breakpoints';
import {
  HEX_GRID_GEOMETRY,
  hexGridColumnLadderPx,
  hexGridRowLadderPx,
} from '../../../../web/src/lib/design/trimGeometry';
import {
  LANDSCAPE_ROWS,
  PICKER_DIM_BORDER,
  PORTRAIT_ROWS,
} from '../../../../web/src/lib/hexPickerLayout';
import { isCustomColor, type CustomColor } from '../drawing/palette';

// ColorPicker.svelte literals no shared module exports. rsd-native-color-picker.test.mjs reads each one
// back out of that component and hexSnapGesture.ts and fails when one diverges.
// Each trim step hides the next row (or column) in its list, 1-based from the light (or red) end.
export const HEX_ROW_TRIM_ORDER = [2, 4, 6, 8, 3, 7] as const;
export const HEX_COLUMN_TRIM_ORDER = [2, 4, 6, 8, 3, 7, 5] as const;
// Roomy windows, both sides at least LARGE_TABLET_MIN_SIDE_PX, grow every hexagon by this factor.
export const HEX_ROOMY_SCALE = 1.3;
// A press in the gap between hexagons still snaps to the nearest one within half a hexagon's
// height plus this slop.
export const HEX_SNAP_GAP_SLOP_PX = 5.5;
export const HEX_HOVER_SCALE = 0.94;
export const HEX_HOVER_BRIGHTNESS = 1.2;
export const HEX_KEYLINE_INSET_PX = 2;
export const HEX_SELECTED_INSET_PX = 3;
export const HEX_SELECTED_SHADE_PERCENT = 20;
// A constant dim ring for the near-black swatch, quieter than the icon ink on the dark card.
export const HEX_DIM_KEYLINE = '#4d4d5b';
export const HEX_WHITE: CustomColor = '#FFFFFF';
export const HEX_DIM: CustomColor = customColor(PICKER_DIM_BORDER);

export type HexCell = { color: CustomColor; x: number; y: number };
export type HexLayout = {
  width: number;
  height: number;
  hexWidth: number;
  hexHeight: number;
  snapRadius: number;
  cells: readonly HexCell[];
};
type Extent = { width: number; height: number };

function customColor(hex: string): CustomColor {
  if (!isCustomColor(hex)) throw new Error(`Picker color ${hex} is not a canonical hex color.`);
  return hex;
}

const GRIDS = {
  portrait: PORTRAIT_ROWS.map((row) => row.colors.map(customColor)),
  landscape: LANDSCAPE_ROWS.map((row) => row.colors.map(customColor)),
};

// The 1-based positions a ladder keeps: every breakpoint at or above the extent has fired, and
// each fired step hides the next position in the trim order.
function keptPositions(count: number, ladder: number[], order: readonly number[], extent: number) {
  const fired = ladder.filter((breakpoint) => extent <= breakpoint).length;
  const hidden = new Set(order.slice(0, fired));
  return Array.from({ length: count }, (_, index) => index + 1).filter((at) => !hidden.has(at));
}

// The honeycomb ColorPicker.svelte lays out for a viewport: the orientation picks the grid, the
// short axis trims shade levels and the long axis trims families, and every second visible row
// takes the half-hexagon indent so a trimmed grid still interlocks. Cell positions are the
// hexagons' top-left corners inside the card.
export function hexPickerLayout(window: Extent): HexLayout {
  const grid = window.width > window.height ? GRIDS.landscape : GRIDS.portrait;
  const roomy =
    window.width >= LARGE_TABLET_MIN_SIDE_PX && window.height >= LARGE_TABLET_MIN_SIDE_PX;
  const scale = roomy ? HEX_ROOMY_SCALE : 1;
  const padding = HEX_GRID_GEOMETRY.paddingPx / 2;
  const hexWidth = HEX_GRID_GEOMETRY.columnPitchPx * scale;
  const hexHeight = HEX_GRID_GEOMETRY.firstRowPx * scale;
  const rowPitch = HEX_GRID_GEOMETRY.rowPitchPx * scale;
  const indent = HEX_GRID_GEOMETRY.rowOffsetPx * scale;
  const rows = keptPositions(grid.length, hexGridRowLadderPx(), HEX_ROW_TRIM_ORDER, window.height);
  const columns = keptPositions(
    grid[0].length,
    hexGridColumnLadderPx(),
    HEX_COLUMN_TRIM_ORDER,
    window.width
  );
  const cells = rows.flatMap((row, rowIndex) =>
    columns.map((column, columnIndex) => ({
      color: grid[row - 1][column - 1],
      x: padding + (rowIndex % 2 === 1 ? indent : 0) + columnIndex * hexWidth,
      y: padding + rowIndex * rowPitch,
    }))
  );
  return {
    width: 2 * padding + indent + columns.length * hexWidth,
    height: 2 * padding + hexHeight + (rows.length - 1) * rowPitch,
    hexWidth,
    hexHeight,
    snapRadius: hexHeight / 2 + HEX_SNAP_GAP_SLOP_PX,
    cells,
  };
}

// The hexagon whose center lies nearest the point, within the snap radius.
export function snapHexagon(layout: HexLayout, x: number, y: number): CustomColor | null {
  let nearest: CustomColor | null = null;
  let nearestDistance = layout.snapRadius;
  for (const cell of layout.cells) {
    const distance = Math.hypot(
      x - (cell.x + layout.hexWidth / 2),
      y - (cell.y + layout.hexHeight / 2)
    );
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = cell.color;
    }
  }
  return nearest;
}

// The hexagon drawn under the point, as a mouse hover hit-tests the clipped shape.
export function hexagonAt(layout: HexLayout, x: number, y: number): CustomColor | null {
  const { hexWidth: width, hexHeight: height } = layout;
  for (const cell of layout.cells) {
    const across = Math.abs(x - cell.x - width / 2);
    const down = y - cell.y;
    const slope = (height * across) / (2 * width);
    if (across <= width / 2 && down >= slope && down <= height - slope) return cell.color;
  }
  return null;
}

// ColorPicker.svelte's clip path, polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%),
// over a box inset from a width x height hexagon and scaled about its center.
export function hexagonPoints(width: number, height: number, inset: number, scale: number) {
  const boxWidth = (width - 2 * inset) * scale;
  const boxHeight = (height - 2 * inset) * scale;
  const left = (width - boxWidth) / 2;
  const top = (height - boxHeight) / 2;
  return [
    [0.5, 0],
    [1, 0.25],
    [1, 0.75],
    [0.5, 1],
    [0, 0.75],
    [0, 0.25],
  ]
    .map(([across, down]) => `${left + across * boxWidth},${top + down * boxHeight}`)
    .join(' ');
}

// A click with no pointer behind it: a keyboard or assistive activation. A web pointer press has
// already picked through the grid's snap, so its trailing click (a detail of 1 or more) is
// ignored, as ColorPicker.svelte's handleHexClick does. React Strict DOM's native click carries
// no detail.
export function isDiscreteActivation(event: object): boolean {
  return !('detail' in event) || event.detail === 0;
}

const CHANNEL_MAX = 255;

// CSS brightness(): each sRGB channel scaled and clipped at full intensity.
export function brighten(hex: CustomColor, factor: number): string {
  const channels = [1, 3, 5].map((at) => Number.parseInt(hex.slice(at, at + 2), 16));
  return `#${channels
    .map((value) =>
      Math.min(CHANNEL_MAX, Math.round(value * factor))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}
