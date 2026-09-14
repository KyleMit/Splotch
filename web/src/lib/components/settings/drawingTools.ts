import type { CommonIconName } from '../iconTypes';
import {
  settings,
  setCrayon,
  setEraser,
  setMagicBrush,
  setStrokeWidthControl,
  setUndoButton,
  TOOL_DRAWER_CONTROLS,
  type ToolDrawerControl,
} from '$lib/state/settings.svelte';

// The on-screen tools the Tool Drawer section shows and hides, keyed by the
// setting each one flips. TOOL_DRAWER_CONTROLS owns both the membership and the
// render order: the section's switch hides exactly this set, the hub row
// summarizes it — "2 tools hidden" — and a second list would let the three
// disagree about what a tool is.
interface DrawingToolMeta {
  id: string;
  label: string;
  icon: CommonIconName;
  toggle: (next: boolean) => void;
}

const DRAWING_TOOL_META = {
  crayonEnabled: {
    id: 'crayonToggle',
    label: 'Crayon',
    icon: 'brush-crayon',
    toggle: setCrayon,
  },
  magicBrushEnabled: {
    id: 'magicBrushToggle',
    label: 'Magic brush',
    icon: 'brush-magic',
    toggle: setMagicBrush,
  },
  eraserEnabled: {
    id: 'eraserToggle',
    label: 'Eraser',
    icon: 'brush-eraser',
    toggle: setEraser,
  },
  strokeWidthControlEnabled: {
    id: 'strokeWidthToggle',
    label: 'Stroke width',
    icon: 'line-weight-brush',
    toggle: setStrokeWidthControl,
  },
  undoButtonEnabled: {
    id: 'undoToggle',
    label: 'Undo',
    icon: 'undo',
    toggle: setUndoButton,
  },
} as const satisfies Record<ToolDrawerControl, DrawingToolMeta>;

// Derived from the metadata rather than from the interface above, so an id
// stays the literal it was written as everywhere it is passed around.
export type DrawingToolId = (typeof DRAWING_TOOL_META)[ToolDrawerControl]['id'];

export interface DrawingTool extends DrawingToolMeta {
  id: DrawingToolId;
  setting: ToolDrawerControl;
}

export const DRAWING_TOOLS: readonly DrawingTool[] = TOOL_DRAWER_CONTROLS.map((setting) => ({
  setting,
  ...DRAWING_TOOL_META[setting],
}));

/** Whether the parent has this tool switched on, regardless of the drawer switch above it. */
export function isDrawingToolOn(tool: DrawingTool): boolean {
  return settings[tool.setting];
}

/** How many tools the parent has turned off — what the hub row reports. */
export function hiddenDrawingToolCount(): number {
  return DRAWING_TOOLS.filter((tool) => !isDrawingToolOn(tool)).length;
}
