// Active drawing tool: a BRUSH (pen, magic, crayon, watercolor) plus the eraser
// modifier. The brush is a persistent selection made in the Actions Panel's
// brush-selector flyout; the eraser is a separate button that removes pixels
// under whatever brush is selected.
//
// `eraser` and `brush` are orthogonal on the op (see strokeOps.ts), but the UI
// keeps them mutually exclusive: selecting a brush leaves the eraser, and
// selecting the eraser is the active tool while the brush stays remembered.
// "Pen" is the default brush; the magic brush (ADR-0043) reveals colors where
// the child paints; crayon and watercolor are textured brushes (brushRender.ts).

import { readString, writeString } from '../storage';
import type { BrushKind } from '../drawing/strokeOps';

export type { BrushKind };

const BRUSH_KEY = 'splotch-brush';
const BRUSH_IDS: BrushKind[] = ['pen', 'crayon', 'watercolor', 'magic'];

// Metadata for the brush-selector flyout, in display order (pen first as the
// default, magic last as the "special" one). `icon` is checked against the
// generated IconName union at the call site.
export interface BrushDef {
  id: BrushKind;
  label: string;
  icon: string;
}

export const BRUSHES: BrushDef[] = [
  { id: 'pen', label: 'Pen', icon: 'brush-pen' },
  { id: 'crayon', label: 'Crayon', icon: 'brush-crayon' },
  { id: 'watercolor', label: 'Watercolor', icon: 'brush-watercolor' },
  { id: 'magic', label: 'Magic brush', icon: 'magic-brush' },
];

function readBrush(): BrushKind {
  const stored = readString(BRUSH_KEY, 'pen');
  return BRUSH_IDS.includes(stored as BrushKind) ? (stored as BrushKind) : 'pen';
}

export const toolState = $state({
  eraser: false,
  brush: readBrush(),
  // The brush-selector flyout's open state — module-level (like strokeState)
  // so the Actions Panel's outside-click handler can close it.
  brushMenuOpen: false,
});

export function brushDef(id: BrushKind): BrushDef {
  return BRUSHES.find((b) => b.id === id) ?? BRUSHES[0];
}

// Read the active brush reactively (for $derived/$effect/template use).
export function isMagic(): boolean {
  return toolState.brush === 'magic';
}

// Select a brush from the flyout: it becomes the active tool (eraser off) and
// persists so it survives a reload. The magic sheet is armed by the engine's
// setBrush bridge, not here.
export function selectBrush(brush: BrushKind) {
  toolState.brush = brush;
  toolState.eraser = false;
  writeString(BRUSH_KEY, brush);
}

export function selectEraser() {
  toolState.eraser = true;
}

// Hard reset to the pen (eraser off, brush pen). Used by the Apple Pencil
// double-tap bridge and the pen-selection unit paths.
export function selectPen() {
  selectBrush('pen');
}

export function selectMagic() {
  selectBrush('magic');
}

// Picking a color leaves the eraser. It keeps a color-using brush (pen, crayon,
// watercolor) so the child keeps their texture with the new color — but leaves
// the magic brush (which ignores color) for the pen, since picking a color there
// means "I want to draw with this color."
export function selectColorBrush() {
  toolState.eraser = false;
  if (toolState.brush === 'magic') selectBrush('pen');
}

// Flip between pen and eraser. Shared by the on-screen eraser button's tap handler
// and the Apple Pencil double-tap bridge (web/src/lib/plugins/pencilEraser.ts).
// Leaving the eraser lands on the remembered brush.
export function toggleEraser() {
  if (toolState.eraser) toolState.eraser = false;
  else selectEraser();
}

// Flip between the magic brush and the pen. Leaving magic lands on the pen.
export function toggleMagic() {
  if (toolState.brush === 'magic') selectBrush('pen');
  else selectMagic();
}

// After the canvas is cleared, an active eraser would strand the child holding
// a non-drawing tool on a blank page — switch it off (falling back to the
// remembered brush). A selected brush survives the clear: it draws on a fresh
// page too, and the engine re-locks a new magic sheet during clearCanvas() while
// the magic brush stays selected.
export function resetToolAfterClear() {
  if (toolState.eraser) toolState.eraser = false;
}
