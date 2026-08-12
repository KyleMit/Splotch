import type { CommonIconName } from '../iconTypes';
import {
  settings,
  setCrayon,
  setEraser,
  setMagicBrush,
  setStrokeWidthControl,
  setUndoButton,
} from '$lib/state/settings.svelte';

// The on-screen tools the Tool Drawer section shows and hides, in the order it
// renders them: what a child draws with, then the controls beside it. The list
// lives here rather than in the section because the hub row summarizes it —
// "2 tools hidden" — and a second copy of the list would let the summary and
// the controls disagree about what a tool is.
interface DrawingTool {
  id: string;
  label: string;
  icon: CommonIconName;
  checked: () => boolean;
  toggle: (next: boolean) => void;
}

export const DRAWING_TOOLS = [
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
] as const satisfies readonly DrawingTool[];

// Derived from the list rather than from the interface above, so an id stays
// the literal it was written as everywhere it is passed around.
export type DrawingToolId = (typeof DRAWING_TOOLS)[number]['id'];

/** How many tools the parent has turned off — what the hub row reports. */
export function hiddenDrawingToolCount(): number {
  return DRAWING_TOOLS.filter((tool) => !tool.checked()).length;
}
