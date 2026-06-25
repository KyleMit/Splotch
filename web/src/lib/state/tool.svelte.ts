// Active drawing tool: pen (default) or eraser. The eraser shares the
// stroke-width setting but removes pixels instead of laying down color.
export const toolState = $state({
  eraser: false,
});

export function selectEraser() {
  toolState.eraser = true;
}

export function selectPen() {
  toolState.eraser = false;
}

// Flip between pen and eraser. Shared by the on-screen eraser button's tap handler
// and the Apple Pencil double-tap bridge (web/src/lib/plugins/pencilEraser.ts).
export function toggleEraser() {
  toolState.eraser = !toolState.eraser;
}
