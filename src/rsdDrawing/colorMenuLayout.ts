import { PALETTE_COLORS, PALETTE_TRIM_ORDER, type PaletteLabel } from '../drawing/palette';

// ColorMenu.svelte's geometry, restated rather than imported: shipping's trimGeometry.ts is also in
// the Color Picker's chunk, and a module two lazy chunks share becomes a third chunk both wait on.
// rsd-native-color-control.test.mjs holds every value, and the whole trim ladder, to shipping.
// The menu takes the portrait palette row's swatch, gap and padding (both ends together).
export const COLOR_MENU_SWATCH_PX = 55;
export const COLOR_MENU_GAP_PX = 8;
export const COLOR_MENU_PADDING_PX = 20;
// landscapeToolbar.ts's OMITTED_COLOR_COUNT: the first colors the trim order drops never join.
export const COLOR_MENU_FIRST_TRIM_RANK = 4;
// What the menu's sizing box leaves beside the Color Button besides the button itself: the
// panel's inset, the gap to the menu and a margin at the far edge.
export const COLOR_MENU_EDGE_ROOM_PX = 24;
// A max-width rung sits this far below the extent it guards (breakpoints.ts).
const BREAKPOINT_EPSILON_PX = 0.02;
// The custom swatch keeps its slot however little room there is.
const CUSTOM_SLOTS = 1;

const trimRank = (label: PaletteLabel) => PALETTE_TRIM_ORDER.indexOf(label);

// The landscape phone's colors: the palette less the first colors its trim order drops, in palette
// order.
export const COLOR_MENU_LABELS: readonly PaletteLabel[] = PALETTE_COLORS.map(
  ({ label }) => label
).filter((label) => trimRank(label) >= COLOR_MENU_FIRST_TRIM_RANK);

function extent(slots: number) {
  return slots * COLOR_MENU_SWATCH_PX + (slots - 1) * COLOR_MENU_GAP_PX + COLOR_MENU_PADDING_PX;
}

// The colors the menu shows in the room beside a button of this size: the swatches that fit at
// full size beside the custom swatch, the lowest-ranked going first, as shipping's container-query
// ladder trims them.
export function colorMenuLabels(areaWidth: number, buttonSize: number): PaletteLabel[] {
  const room = areaWidth - buttonSize - COLOR_MENU_EDGE_ROOM_PX;
  let shown = COLOR_MENU_LABELS.length;
  while (shown > 0 && room <= extent(shown + CUSTOM_SLOTS) - BREAKPOINT_EPSILON_PX) shown -= 1;
  const kept = [...COLOR_MENU_LABELS].sort((a, b) => trimRank(b) - trimRank(a)).slice(0, shown);
  return COLOR_MENU_LABELS.filter((label) => kept.includes(label));
}

export const COLOR_MENU_SPACING = {
  paddingPx: COLOR_MENU_PADDING_PX / 2,
  gapPx: COLOR_MENU_GAP_PX,
} as const;
