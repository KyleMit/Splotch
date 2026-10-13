import { CONTROL_GAP, TOUCH_TARGET } from '../drawing/theme';

export type LayoutAxis = 'row' | 'column';
export type AreaSize = Readonly<{ width: number; height: number }>;
export type DrawerOffset = Readonly<{ left: number; bottom: number }>;

// Every edge control is a border-box TOUCH_TARGET square, inset one gap from the paper area's
// edges and spaced one gap from its neighbours.
export const EDGE_INSET_PX = CONTROL_GAP;
const STEP_PX = TOUCH_TARGET + CONTROL_GAP;

function slotsAcross(length: number) {
  return Math.max(0, Math.floor((length - 2 * EDGE_INSET_PX + CONTROL_GAP) / STEP_PX));
}

// The drawer opens away from its chevron, which keeps the bottom-left corner. Clear and Settings
// own the right edge, so in portrait the drawer's columns stop short of it and in landscape its
// rows stop short of Settings. A line that runs out of room wraps to the next one, further from
// the edge the chevron sits on; rsd-native-toolbar.test.mjs pins that the smallest phones hold
// every tool in both orientations.
export function drawerOffsets(area: AreaSize, axis: LayoutAxis, count: number): DrawerOffset[] {
  const column = axis === 'column';
  const along = slotsAcross(column ? area.height : area.width);
  const perLine = Math.max(1, along - (column ? 1 : 2));
  return Array.from({ length: count }, (_, index) => {
    const line = Math.floor(index / perLine);
    const slot = (index % perLine) + 1;
    const [x, y] = column ? [line, slot] : [slot, line];
    return { left: EDGE_INSET_PX + x * STEP_PX, bottom: EDGE_INSET_PX + y * STEP_PX };
  });
}
