import { trailingRowCutHeight } from '../lib/actions/scrollCue';
import type { ArtOrientation } from '../drawing/paperSpace';
import {
  CARD_HEIGHT_CAP_FRACTION,
  COLORING_HEADER_GAP_PX,
  COLORING_NARROW_MAX_WIDTH_PX,
  COLORING_PADDING_PX,
  COLORING_PHONE_MAX_WIDTH_PX,
  MODAL_CONTROL_SIZE_PX,
  type ModalFrame,
} from './modalGeometry';

// ColoringBook.svelte's Book Grid and Coloring Page Grid. The shipping media queries read the
// viewport, so each step here reads the window. rsd-native-coloring-picker.test.mjs reads every
// value from the shipping source.
const BOOK_GRID_COLUMNS = { wide: 4, orphan: 3, tablet: 3, phone: 2, tallPortrait: 2 };
const BOOK_GRID_MAX_WIDTH_PX = 856;
// Below this width four covers would fall under the 140px cover floor.
const BOOK_GRID_FOUR_COLUMN_MIN_WIDTH_PX = 741;
// Width over height at or under 4:5 turns the wide four-column grid into two tall columns.
export const BOOK_GRID_TALL_PORTRAIT_MAX_ASPECT = 4 / 5;
const BOOK_GRID_ROWS_IN_VIEW = 4;
// Slack under the tall-portrait cap so a sub-pixel row cannot tip the last one past the fold.
export const BOOK_GRID_FOLD_SLACK_PX = 16;
export const PAGE_GRID_COLUMNS = { landscape: 2, portrait: 3, phonePortrait: 2 };
export const COLORING_GRID_GAP_PX = { roomy: 12, phone: 8 };
// The cover tile reserves this band under its art for the overlaid caption.
export const COVER_CAPTION_HEIGHT_PX = 28;
export const TILE_ART_INSET_PX = 8;
export const PAGE_TILE_ASPECT: Record<ArtOrientation, number> = {
  landscape: 3 / 2,
  portrait: 2 / 3,
};

type Window = { width: number; height: number };
export type GridLayout = { columns: number; gap: number; maxWidth: number | null };
export type TileShape = ArtOrientation | 'cover';

function coloringGridGap(window: Window) {
  return window.width <= COLORING_PHONE_MAX_WIDTH_PX
    ? COLORING_GRID_GAP_PX.phone
    : COLORING_GRID_GAP_PX.roomy;
}

function tallPortrait(window: Window) {
  return (
    window.width >= BOOK_GRID_FOUR_COLUMN_MIN_WIDTH_PX &&
    window.width / window.height <= BOOK_GRID_TALL_PORTRAIT_MAX_ASPECT
  );
}

// The tall-portrait grid is capped at the width whose square covers seat BOOK_GRID_ROWS_IN_VIEW
// rows inside the card's height cap, after the padding, header row and row gaps.
function tallPortraitMaxWidth(window: Window, gap: number) {
  const columns = BOOK_GRID_COLUMNS.tallPortrait;
  const chrome =
    2 * COLORING_PADDING_PX.roomy +
    MODAL_CONTROL_SIZE_PX +
    COLORING_HEADER_GAP_PX +
    (BOOK_GRID_ROWS_IN_VIEW - 1) * gap +
    BOOK_GRID_FOLD_SLACK_PX;
  const tile = (window.height * CARD_HEIGHT_CAP_FRACTION - chrome) / BOOK_GRID_ROWS_IN_VIEW;
  return tile * columns + (columns - 1) * gap;
}

export function bookGridLayout(window: Window, bookCount: number): GridLayout {
  const gap = coloringGridGap(window);
  if (window.width <= COLORING_PHONE_MAX_WIDTH_PX)
    return { columns: BOOK_GRID_COLUMNS.phone, gap, maxWidth: BOOK_GRID_MAX_WIDTH_PX };
  if (window.width < BOOK_GRID_FOUR_COLUMN_MIN_WIDTH_PX)
    return { columns: BOOK_GRID_COLUMNS.tablet, gap, maxWidth: BOOK_GRID_MAX_WIDTH_PX };
  if (tallPortrait(window))
    return {
      columns: BOOK_GRID_COLUMNS.tallPortrait,
      gap,
      maxWidth: tallPortraitMaxWidth(window, gap),
    };
  // A last row of one reads as accidental, so that count drops a column.
  const orphan = bookCount > 1 && bookCount % BOOK_GRID_COLUMNS.wide === 1;
  return {
    columns: orphan ? BOOK_GRID_COLUMNS.orphan : BOOK_GRID_COLUMNS.wide,
    gap,
    maxWidth: BOOK_GRID_MAX_WIDTH_PX,
  };
}

export function pageGridLayout(window: Window, orientation: ArtOrientation): GridLayout {
  const gap = coloringGridGap(window);
  if (orientation === 'landscape')
    return { columns: PAGE_GRID_COLUMNS.landscape, gap, maxWidth: null };
  return {
    columns:
      window.width <= COLORING_PHONE_MAX_WIDTH_PX
        ? PAGE_GRID_COLUMNS.phonePortrait
        : PAGE_GRID_COLUMNS.portrait,
    gap,
    maxWidth: null,
  };
}

export function tileWidth(layout: GridLayout, available: number) {
  const width = layout.maxWidth === null ? available : Math.min(available, layout.maxWidth);
  return Math.max(0, Math.floor((width - (layout.columns - 1) * layout.gap) / layout.columns));
}

export function coloringTitleCompact(window: Window) {
  return window.width <= COLORING_NARROW_MAX_WIDTH_PX;
}

// A cover tile is square; a page tile takes its art's aspect.
export function tileHeight(shape: TileShape, width: number) {
  return shape === 'cover' ? width : width / PAGE_TILE_ASPECT[shape];
}

// ColoringBook.svelte's cutTrailingRow: the card budgets its height so the fold lands inside a
// row of tiles rather than between two, the half-cut tile signalling that the grid goes on. The
// grid starts under the header and the body's top inset; null leaves the frame's cap standing.
export function trailingRowCardHeight({
  frame,
  headerHeight,
  layout,
  tile,
  tileCount,
}: {
  frame: Pick<ModalFrame, 'maxHeight' | 'body'>;
  headerHeight: number;
  layout: GridLayout;
  tile: number;
  tileCount: number;
}) {
  const rowCount = Math.ceil(tileCount / layout.columns);
  const gridTop = headerHeight + frame.body.top;
  const gridHeight = rowCount * tile + Math.max(0, rowCount - 1) * layout.gap;
  const contentHeight = gridTop + gridHeight + frame.body.bottom;
  return trailingRowCutHeight({
    gridTop,
    rowHeight: tile,
    rowGap: layout.gap,
    rowCount,
    viewportHeight: Math.min(frame.maxHeight, contentHeight),
    contentHeight,
  });
}
