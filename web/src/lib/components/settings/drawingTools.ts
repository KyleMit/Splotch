import type { CommonIconName } from '../iconTypes';
import {
  settings,
  setCrayon,
  setEraser,
  setMagicBrush,
  setStrokeWidthControl,
  setUndoButton,
} from '$lib/state/settings.svelte';

// The on-screen tools the Tool Drawer section shows and hides, in the two chip
// grids it renders them as. The list lives here rather than in the section
// because the hub row summarizes it — "2 tools hidden" — and a second copy of
// the list would let the summary and the grids disagree about what a tool is.
export interface DrawingToolChip {
  id: string;
  label: string;
  icon: CommonIconName;
  /** Which grid the chip belongs to: an Actions Panel button, or a brush. */
  grid: 'button' | 'brush';
  checked: () => boolean;
  toggle: (next: boolean) => void;
}

export const DRAWING_TOOL_CHIPS = [
  {
    id: 'strokeWidthToggle',
    label: 'Stroke width',
    icon: 'line-weight-brush',
    grid: 'button',
    checked: () => settings.strokeWidthControlEnabled,
    toggle: setStrokeWidthControl,
  },
  {
    id: 'crayonToggle',
    label: 'Crayon',
    icon: 'brush-crayon',
    grid: 'brush',
    checked: () => settings.crayonEnabled,
    toggle: setCrayon,
  },
  {
    id: 'magicBrushToggle',
    label: 'Magic brush',
    icon: 'brush-magic',
    grid: 'brush',
    checked: () => settings.magicBrushEnabled,
    toggle: setMagicBrush,
  },
  {
    id: 'eraserToggle',
    label: 'Eraser',
    icon: 'brush-eraser',
    grid: 'brush',
    checked: () => settings.eraserEnabled,
    toggle: setEraser,
  },
  {
    id: 'undoToggle',
    label: 'Undo',
    icon: 'undo',
    grid: 'button',
    checked: () => settings.undoButtonEnabled,
    toggle: setUndoButton,
  },
] as const satisfies readonly DrawingToolChip[];

// Derived from the list rather than from the interface above, so an id stays
// the literal it was written as everywhere it is passed around.
export type DrawingTool = (typeof DRAWING_TOOL_CHIPS)[number];
export type DrawingToolId = DrawingTool['id'];

/** How many tools the parent has turned off — what the hub row reports. */
export function hiddenDrawingToolCount(): number {
  return DRAWING_TOOL_CHIPS.filter((chip) => !chip.checked()).length;
}
