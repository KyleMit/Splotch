import type { CommonIconName } from '../iconTypes';
import {
  settings,
  setCrayon,
  setEraser,
  setMagicBrush,
  setStrokeWidthControl,
  setUndoButton,
} from '$lib/state/settings.svelte';

// The on-screen tools the Tool Drawer section shows and hides, in the order its
// one chip grid renders them: what a child draws with, then the controls beside
// it. The list lives here rather than in the section because the hub row
// summarizes it — "2 tools hidden" — and a second copy of the list would let
// the summary and the grid disagree about what a tool is.
interface DrawingToolChip {
  id: string;
  label: string;
  icon: CommonIconName;
  checked: () => boolean;
  toggle: (next: boolean) => void;
}

export const DRAWING_TOOL_CHIPS = [
  {
    id: 'crayonToggle',
    label: 'Crayon',
    icon: 'brush-crayon',
    checked: () => settings.crayonEnabled,
    toggle: setCrayon,
  },
  {
    id: 'magicBrushToggle',
    label: 'Magic brush',
    icon: 'brush-magic',
    checked: () => settings.magicBrushEnabled,
    toggle: setMagicBrush,
  },
  {
    id: 'eraserToggle',
    label: 'Eraser',
    icon: 'brush-eraser',
    checked: () => settings.eraserEnabled,
    toggle: setEraser,
  },
  {
    id: 'strokeWidthToggle',
    label: 'Stroke width',
    icon: 'line-weight-brush',
    checked: () => settings.strokeWidthControlEnabled,
    toggle: setStrokeWidthControl,
  },
  {
    id: 'undoToggle',
    label: 'Undo',
    icon: 'undo',
    checked: () => settings.undoButtonEnabled,
    toggle: setUndoButton,
  },
] as const satisfies readonly DrawingToolChip[];

// Derived from the list rather than from the interface above, so an id stays
// the literal it was written as everywhere it is passed around.
export type DrawingToolId = (typeof DRAWING_TOOL_CHIPS)[number]['id'];

/** How many tools the parent has turned off — what the hub row reports. */
export function hiddenDrawingToolCount(): number {
  return DRAWING_TOOL_CHIPS.filter((chip) => !chip.checked()).length;
}
