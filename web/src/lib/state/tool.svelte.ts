// Active drawing tool: pen (default), eraser, magic brush, or crayon. The eraser
// shares the stroke-width setting but removes pixels instead of laying down
// color. The magic brush (ADR-0043) reveals colors where the child paints — the
// active coloring page's colored fill when one is applied, otherwise a random
// rainbow — so it works on any canvas. The crayon (area:crayon) lays down the
// active color as waxy paper-tooth grain that builds up on overlapping passes.
//
// `eraser`, `magic`, and `crayon` are mutually exclusive modifiers on top of the
// pen — at most one is ever true. Pen is the state where all three are false.
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
// Leaving the eraser always lands on the pen (never the magic brush or crayon).
export function toggleEraser() {
  if (toolState.eraser) selectPen();
  else selectEraser();
}

// Flip between the magic brush and the pen. Leaving magic lands on the pen.
export function toggleMagic() {
  if (toolState.magic) selectPen();
  else selectMagic();
}

// Flip between the crayon and the pen. Leaving the crayon lands on the pen.
export function toggleCrayon() {
  if (toolState.crayon) selectPen();
  else selectCrayon();
}

// Picking a palette color lands on a color-using brush. The crayon uses the
// active color just like the pen, so keep it selected when the child picks a new
// color (they're colouring in a new colour); otherwise fall to the pen, which
// also leaves the eraser (you can't erase in a color) and the magic brush (it
// ignores the color and reveals the sheet). Called by ColorPalette on every
// swatch/custom-color selection.
export function pickColorTool() {
  if (toolState.crayon) return;
  selectPen();
}

// After the canvas is cleared, an active eraser would strand the child holding
// a non-drawing tool on a blank page — switch back to the pen. Returning to the
// pen also restores the last-used pen color for free, since the modifier never
// touches colors.activeColor. The magic brush and crayon survive the clear: they
// draw on a fresh page too (the engine re-locks a new magic sheet during
// clearCanvas() while the magic brush stays selected).
export function resetToolAfterClear() {
  if (toolState.eraser) selectPen();
}
