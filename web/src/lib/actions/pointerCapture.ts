// setPointerCapture/releasePointerCapture throw if the pointer id was already
// released (e.g. the pointer went up between the event and this call).
export function capturePointer(node: Element, pointerId: number): void {
  try {
    node.setPointerCapture(pointerId);
  } catch {}
}

export function releasePointer(node: Element, pointerId: number): void {
  try {
    node.releasePointerCapture(pointerId);
  } catch {}
}
