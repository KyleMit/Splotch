import type { Point } from './dragToClear';

export const CLEAR_DOCK_OVERHANG_PX = 10;
const CLEAR_DOCK_PORTRAIT_TOP_PX = 90;
// Landscape docks below Android's immersive-mode reveal strip: a floor, or the safe-area top plus
// this margin when the window reports a taller inset.
const CLEAR_DOCK_LANDSCAPE_TOP_FLOOR_PX = 48;
const CLEAR_DOCK_LANDSCAPE_TOP_MARGIN_PX = 20;
const CLEAR_DOCK_SIZE_PX = { portrait: 60, landscape: 70 } as const;
const CLEAR_ICON_SIZE_PX = { portrait: 38, landscape: 40 } as const;

type ClearDockOrientation = keyof typeof CLEAR_DOCK_SIZE_PX;

// The docked tab in the coordinates of the safe-area frame the drawing layout fills: `right` is
// negative because the tab's square edge runs past the frame's right edge.
export type ClearDock = Readonly<{
  top: number;
  right: number;
  size: number;
  iconSize: number;
}>;

type WindowSize = Readonly<{ width: number; height: number }>;

// The shipping stylesheet's `@media (orientation: portrait)`, which a square window also matches.
function dockOrientation(window: WindowSize): ClearDockOrientation {
  return window.height >= window.width ? 'portrait' : 'landscape';
}

// The shipping offsets are from the viewport and add the safe-area inset themselves; the layout
// this dock sits in already starts below that inset, so it comes back off.
export function clearDock(window: WindowSize, safeTop: number): ClearDock {
  const orientation = dockOrientation(window);
  const viewportTop =
    orientation === 'portrait'
      ? CLEAR_DOCK_PORTRAIT_TOP_PX + safeTop
      : Math.max(CLEAR_DOCK_LANDSCAPE_TOP_FLOOR_PX, CLEAR_DOCK_LANDSCAPE_TOP_MARGIN_PX + safeTop);
  return {
    top: viewportTop - safeTop,
    right: -CLEAR_DOCK_OVERHANG_PX,
    size: CLEAR_DOCK_SIZE_PX[orientation],
    iconSize: CLEAR_ICON_SIZE_PX[orientation],
  };
}

// The tab's centre, the accept ring's centre and where the departing page goes, measured from the
// top-right corner of the frame the dock is placed in: x leftward from its right edge, y down.
export function dockCenterFromTopRight(dock: ClearDock): Point {
  return { x: dock.right + dock.size / 2, y: dock.top + dock.size / 2 };
}
