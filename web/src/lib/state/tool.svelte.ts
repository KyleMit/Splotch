// Active drawing tool: pen (default), eraser, or magic brush. The eraser shares
// the stroke-width setting but removes pixels instead of laying down color. The
// magic brush (ADR-0043) reveals colors where the child paints — the active
// coloring page's colored fill when one is applied, otherwise a random rainbow —
// so it works on any canvas.
//
// `eraser` and `magic` are mutually exclusive modifiers on top of the pen — at
// most one is ever true. Pen is the state where both are false.
//
// `crayon` (ADR-0065) is a different axis: a pen-tip STYLE, not a modifier. It
// stays latched through color picks (changing colors is a crayon's core loop)
// and through eraser/magic detours — those win while selected (the engine
// gates the tip at stroke start), and leaving them lands back on the crayon.
export const toolState = $state({
  eraser: false,
  magic: false,
  crayon: false,
});

// Whether a stroke drawn right now would use the crayon tip: the latch, minus
// any modifier currently overriding it. Drives the Crayon Button's lit state.
export function crayonSelected(): boolean {
  return toolState.crayon && !toolState.eraser && !toolState.magic;
}

// Flip between the crayon tip and the plain pen. Tapping while a modifier
// holds the pen (eraser/magic) selects the crayon rather than silently
// unlatching it — the child's tap means "draw with the crayon now".
export function toggleCrayon() {
  if (crayonSelected()) {
    toolState.crayon = false;
    return;
  }
  toolState.crayon = true;
  toolState.eraser = false;
  toolState.magic = false;
}

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

// After the canvas is cleared, an active eraser would strand the child holding
// a non-drawing tool on a blank page — switch back to the pen. Returning to the
// pen also restores the last-used pen color for free, since the modifier never
// touches colors.activeColor. The magic brush survives the clear: it draws on a
// fresh page too, and the engine re-locks a new magic sheet during clearCanvas()
// while the brush stays selected.
export function resetToolAfterClear() {
  if (toolState.eraser) selectPen();
}
