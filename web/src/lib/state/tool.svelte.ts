// Active drawing tool: the crayon (default), the eraser, or the magic brush. The
// crayon (ADR-0065) is the freehand brush — it lays the active color down through
// a paper-tooth texture that builds up wax on repeated passes, and it's what the
// app draws with unless the eraser or magic brush is picked. The eraser shares the
// stroke-width setting but removes pixels; the magic brush (ADR-0043) reveals
// colors where the child paints.
//
// `eraser` and `magic` are mutually exclusive modifiers on top of the crayon — at
// most one is ever true. The crayon is the base state where both are false; there
// is no separate plain-pen tool (the crayon replaced it).
export const toolState = $state({
  eraser: false,
  magic: false,
});

export function selectEraser() {
  toolState.eraser = true;
  toolState.magic = false;
}

// Return to the freehand crayon (both modifiers off). Named `selectPen` for its
// callers' sake — the color palette calls it when a swatch is tapped — but the
// base freehand tool is the crayon now.
export function selectPen() {
  toolState.eraser = false;
  toolState.magic = false;
}

export function selectMagic() {
  toolState.magic = true;
  toolState.eraser = false;
}

// Flip between the crayon and the eraser. Shared by the on-screen eraser button's
// tap handler and the Apple Pencil double-tap bridge
// (web/src/lib/plugins/pencilEraser.ts). Leaving the eraser lands on the crayon
// (never the magic brush).
export function toggleEraser() {
  if (toolState.eraser) selectPen();
  else selectEraser();
}

// Flip between the magic brush and the crayon. Leaving magic lands on the crayon.
export function toggleMagic() {
  if (toolState.magic) selectPen();
  else selectMagic();
}

// After the canvas is cleared, an active eraser would strand the child holding a
// non-drawing tool on a blank page — switch back to the crayon. The magic brush
// survives the clear: it draws on a fresh page too (the engine re-locks a new
// magic sheet during clearCanvas() while the brush stays selected).
export function resetToolAfterClear() {
  if (toolState.eraser) selectPen();
}
