import { readString, writeString, onDurableRestore } from '../storage';

// The active brush, a single four-way axis picked from the Actions Panel's
// Brush Menu:
//   pen    — solid ink, no texture (the default).
//   crayon — textured wax with color mixing (ADR-0065).
//   magic  — reveals colors where the child paints (ADR-0043): the active
//            coloring page's colored fill when one is applied, otherwise a
//            random rainbow, so it works on any canvas.
//   eraser — removes pixels; shares the stroke-width setting at a multiplier.
// Pen and crayon are the "ink brushes": both lay down the active palette color.
export type BrushType = 'pen' | 'crayon' | 'magic' | 'eraser';

// Presentation order in the Brush Menu.
export const BRUSH_TYPES: BrushType[] = ['pen', 'crayon', 'magic', 'eraser'];

const BRUSH_TYPE_KEY = 'splotch-brush-type';
const DEFAULT_BRUSH: BrushType = 'pen';

export function isInkBrush(brush: BrushType): brush is 'pen' | 'crayon' {
  return brush === 'pen' || brush === 'crayon';
}

// The eraser is deliberately excluded from persistence: a fresh launch always
// opens on a blank page, and waking up holding an eraser would strand the
// child with a tool that does nothing there (the same reasoning as
// resetToolAfterClear). Selecting the eraser therefore never overwrites the
// stored choice, and a stored value is never restored as the eraser.
function readBrush(fallback: BrushType): BrushType {
  const raw = readString(BRUSH_TYPE_KEY, fallback);
  return (BRUSH_TYPES as string[]).includes(raw) && raw !== 'eraser'
    ? (raw as BrushType)
    : fallback;
}

export const toolState = $state({
  brush: readBrush(DEFAULT_BRUSH),
});

// The last ink brush the child held — where a color pick or a canvas clear
// lands them when it pulls them out of the eraser or magic brush (picking a
// color means "draw with this", so it must resume a brush that uses color).
// Runtime-only: across a relaunch it's rebuilt from the persisted brush,
// falling back to the pen when the stored choice was the magic brush.
let inkBrush: 'pen' | 'crayon' = isInkBrush(toolState.brush) ? toolState.brush : 'pen';

export function selectBrush(brush: BrushType) {
  toolState.brush = brush;
  if (isInkBrush(brush)) inkBrush = brush;
  if (brush !== 'eraser') writeString(BRUSH_TYPE_KEY, brush);
}

// Resume drawing with the active color: the last-used pen/crayon. Called by
// the palette when a color is picked while the eraser or magic brush is held.
export function selectInkBrush() {
  selectBrush(inkBrush);
}

// Flip between the ink brush and the eraser. Shared by the Brush Menu's eraser
// entry-toggle semantics and the Apple Pencil double-tap bridge
// (web/src/lib/plugins/pencilEraser.ts). Leaving the eraser always lands on
// the last ink brush (never the magic brush).
export function toggleEraser() {
  if (toolState.brush === 'eraser') selectInkBrush();
  else selectBrush('eraser');
}

// After the canvas is cleared, an active eraser would strand the child holding
// a non-drawing tool on a blank page — switch back to the last ink brush,
// which also restores the last-used color for free (the eraser never touches
// colors.activeColor). The magic brush survives the clear: it draws on a fresh
// page too, and the engine re-locks a new magic sheet during clearCanvas()
// while the brush stays selected.
export function resetToolAfterClear() {
  if (toolState.brush === 'eraser') selectInkBrush();
}

// Re-read the persisted brush into the live store after the durable storage
// layer recovers values evicted by the native WebView (see storage.ts).
export function reloadBrushType() {
  toolState.brush = readBrush(toolState.brush);
  if (isInkBrush(toolState.brush)) inkBrush = toolState.brush;
}

onDurableRestore(reloadBrushType);
