// Active drawing tool: pen (default) or eraser. The eraser shares the
// stroke-width setting but removes pixels instead of laying down color.
export const toolState = $state({
  eraser: false
});

export function selectEraser() {
  toolState.eraser = true;
}

export function selectPen() {
  toolState.eraser = false;
}
