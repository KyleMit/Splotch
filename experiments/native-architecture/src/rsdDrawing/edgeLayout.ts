import { CONTROL_GAP, TOUCH_TARGET } from '../drawing/theme';

export type LayoutAxis = 'row' | 'column';
export type AreaSize = Readonly<{ width: number; height: number }>;
// How far an area's top and right edges sit inside the layout that holds it.
export type AreaOffset = Readonly<{ top: number; right: number }>;
export type DrawerOffset = Readonly<{ left: number; bottom: number }>;

// Every edge control is a border-box square, inset one gap from the paper area's edges and
// spaced one gap from its neighbours. The chevron and the drawer's tools take the Button Size
// (settings/buttonSize.ts); Clear and Settings keep the normal TOUCH_TARGET, as the shipping
// Clear and Settings Buttons ignore the slider.
export const EDGE_INSET_PX = CONTROL_GAP;

// How many squares of this size, the chevron's among them, fit along a line of this length.
function slotsAlong(length: number, size: number) {
  return Math.max(0, Math.floor((length - 2 * EDGE_INSET_PX + CONTROL_GAP) / (size + CONTROL_GAP)));
}

// The drawer opens away from its chevron, which keeps the bottom-left corner. Clear and Settings
// own the right edge, so in landscape the drawer's rows stop short of Settings, and in portrait its
// columns climb the left edge. A line that runs out of room wraps to the next one, further from
// the edge the chevron sits on; rsd-native-button-size.test.mjs pins that the smallest phones hold
// every tool in both orientations at every Button Size.
export function drawerOffsets(
  area: AreaSize,
  axis: LayoutAxis,
  count: number,
  size: number
): DrawerOffset[] {
  const column = axis === 'column';
  const reserved = column ? 0 : TOUCH_TARGET + CONTROL_GAP;
  const along = slotsAlong((column ? area.height : area.width) - reserved, size);
  const perLine = Math.max(1, along - 1);
  const step = size + CONTROL_GAP;
  return Array.from({ length: count }, (_, index) => {
    const line = Math.floor(index / perLine);
    const slot = (index % perLine) + 1;
    const [x, y] = column ? [line, slot] : [slot, line];
    return { left: EDGE_INSET_PX + x * step, bottom: EDGE_INSET_PX + y * step };
  });
}
