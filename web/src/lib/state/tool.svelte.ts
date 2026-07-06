// Active drawing tool: pen (default), eraser, or magic brush. The eraser shares
// the stroke-width setting but removes pixels instead of laying down color. The
// magic brush (ADR-0043) reveals the active coloring page's colored twin where
// the child paints; it's only usable while a coloring page is applied.
//
// `eraser` and `magic` are mutually exclusive modifiers on top of the pen — at
// most one is ever true. Pen is the state where both are false.
export const toolState = $state({
  eraser: false,
  magic: false,
});

export function selectEraser() {
  toolState.eraser = true;
  toolState.magic = false;
}

export function selectPen() {
  toolState.eraser = false;
  toolState.magic = false;
}

export function selectMagic() {
  toolState.magic = true;
  toolState.eraser = false;
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
