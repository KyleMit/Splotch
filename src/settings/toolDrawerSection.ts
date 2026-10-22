import type { NativeIconName } from '../rsdDrawing/icons.generated';
import type { BrushAvailability, OptionalBrush } from './brushPreferences';
import type { DrawerControl, DrawingControlPreferences } from './drawingControlPreferences';

// The shipping Tool Drawer section's copy (settings/ControlsSection.svelte and the compact cell in
// CompactShell.svelte); rsd-native-tool-drawer-settings.test.mjs reads each from those sources.
export const TOOL_DRAWER_COPY = {
  enable: 'Enable tool drawer',
  enableHelp: 'Shows the brushes, stroke width, and undo in the drawer',
  tools: 'Drawing Tools',
  quick: 'Tool drawer',
  off: 'Tool drawer off',
} as const;

// The width at which two chips hold the longest tool names on one line each; below it the list is
// the plain toggle rows every other Settings boolean uses. Measured off the block, so the phone
// page and the wide pane each get the skin their own width earns.
export const TWO_COLUMN_CHIP_WIDTH_PX = 345;

type DrawingToolMeta = { id: string; label: string; icon: NativeIconName };

// The tools the section shows and hides, in shipping's TOOL_DRAWER_CONTROLS order. The brushes
// keep their availability in the brush store, the other two in the settings store.
export const DRAWING_TOOLS = [
  { id: 'crayonToggle', label: 'Crayon', icon: 'brush-crayon', brush: 'crayon' },
  { id: 'magicBrushToggle', label: 'Magic brush', icon: 'brush-magic', brush: 'magic' },
  { id: 'eraserToggle', label: 'Eraser', icon: 'brush-eraser', brush: 'eraser' },
  {
    id: 'strokeWidthToggle',
    label: 'Stroke width',
    icon: 'line-weight-brush',
    control: 'strokeWidthControlEnabled',
  },
  { id: 'undoToggle', label: 'Undo', icon: 'undo', control: 'undoButtonEnabled' },
] as const satisfies readonly (DrawingToolMeta &
  ({ brush: OptionalBrush } | { control: DrawerControl }))[];

export type DrawingTool = (typeof DRAWING_TOOLS)[number];
export type DrawingToolId = DrawingTool['id'];

/** Whether the parent has this tool switched on, regardless of the drawer switch above it. */
export function isDrawingToolOn(
  tool: DrawingTool,
  controls: DrawingControlPreferences,
  brushes: BrushAvailability
): boolean {
  return 'brush' in tool ? brushes[tool.brush] : controls[tool.control];
}

/** How many tools the parent has turned off: what the hub row reports. */
export function hiddenDrawingToolCount(
  controls: DrawingControlPreferences,
  brushes: BrushAvailability
): number {
  return DRAWING_TOOLS.filter((tool) => !isDrawingToolOn(tool, controls, brushes)).length;
}
