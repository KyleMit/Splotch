// Active drawing tool: pen (default), crayon, eraser, or magic brush. The eraser
// shares the stroke-width setting but removes pixels instead of laying down
// color. The magic brush (ADR-0043) reveals colors where the child paints. The
// crayon lays the active color down through a paper-tooth texture that builds up
// like wax where same-color strokes overlap (crayonTexture.ts).
//
// `crayon` is the BASE brush selector (pen vs. crayon — which texture a normal
// color stroke uses); `eraser` and `magic` are mutually exclusive MODIFIERS on
// top of it, and both override the base while active. So a normal stroke is
// crayon only when `crayon` is true and neither `eraser` nor `magic` is.
export const toolState = $state({
  crayon: false,
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
  toolState.crayon = false;
}

export function selectCrayon() {
  toolState.crayon = true;
  toolState.eraser = false;
  toolState.magic = false;
}

// Flip between the crayon and the plain pen, leaving the eraser/magic modifiers
// off (picking a base brush is also leaving those tools).
export function toggleCrayon() {
  if (toolState.crayon) selectPen();
  else selectCrayon();
}

// Leaving the eraser/magic modifiers (e.g. when the child picks a colour to
// resume drawing) returns to the current BASE brush — pen OR crayon — instead of
// always forcing the pen. So changing colours never kicks a child out of crayon.
export function resumeBaseBrush() {
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
