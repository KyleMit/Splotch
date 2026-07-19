// Active drawing tool: pen (default), crayon, eraser, or magic brush. The eraser shares
// the stroke-width setting but removes pixels instead of laying down color. The
// magic brush (ADR-0043) reveals colors where the child paints — the active
// coloring page's colored fill when one is applied, otherwise a random rainbow —
// so it works on any canvas.
//
// The modifiers are mutually exclusive. Pen is the state where all are false.
export const toolState = $state({
  eraser: false,
  magic: false,
  crayon: false,
});

export function selectEraser() {
  toolState.eraser = true;
  toolState.magic = false;
  toolState.crayon = false;
}

export function selectPen() {
  toolState.eraser = false;
  toolState.magic = false;
  toolState.crayon = false;
}

export function selectMagic() {
  toolState.magic = true;
  toolState.eraser = false;
  toolState.crayon = false;
}

export function selectCrayon() {
  toolState.crayon = true;
  toolState.eraser = false;
  toolState.magic = false;
}

// Flip between pen and eraser. Shared by the on-screen eraser button's tap handler
// and the Apple Pencil double-tap bridge (web/src/lib/plugins/pencilEraser.ts).
// Leaving the eraser always lands on the pen (never the magic brush).
export function toggleEraser() {
  if (toolState.eraser) selectPen();
  else selectEraser();
}

// Flip between the magic brush and the pen. Leaving magic lands on the pen.
export function toggleMagic() {
  if (toolState.magic) selectPen();
  else selectMagic();
}

export function toggleCrayon() {
  if (toolState.crayon) selectPen();
  else selectCrayon();
}

// After the canvas is cleared, an active eraser would strand the child holding
// a non-drawing tool on a blank page — switch back to the pen. Returning to the
// pen also restores the last-used pen color for free, since the modifier never
// touches colors.activeColor. The drawing brushes survive the clear.
export function resetToolAfterClear() {
  if (toolState.eraser) selectPen();
}
