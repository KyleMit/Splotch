const TAP_TRAVEL_PX = 18;

interface ColorFoldHandlers {
  tap: () => void;
  fold: (folded: boolean) => void;
}

export function colorFoldGesture(node: HTMLButtonElement, handlers: ColorFoldHandlers) {
  let current = handlers;
  let pointerId: number | undefined;
  let startX = 0;
  let startY = 0;
  let travel = 0;
  let consumeClick = false;

  function down(event: PointerEvent) {
    if (pointerId !== undefined || event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    travel = 0;
    consumeClick = false;
    node.setPointerCapture(pointerId);
    event.preventDefault();
  }

  function move(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    travel = Math.max(travel, Math.hypot(event.clientX - startX, event.clientY - startY));
  }

  function release() {
    const captured = pointerId;
    pointerId = undefined;
    if (captured !== undefined && node.hasPointerCapture(captured))
      node.releasePointerCapture(captured);
  }

  function up(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    move(event);
    release();
    consumeClick = true;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (travel < TAP_TRAVEL_PX) current.tap();
    else if (Math.abs(dy) >= TAP_TRAVEL_PX && Math.abs(dy) > Math.abs(dx)) current.fold(dy > 0);
  }

  function cancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    release();
    consumeClick = true;
  }

  function click(event: MouseEvent) {
    if (event.detail === 0 || !consumeClick) current.tap();
    consumeClick = false;
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', cancel);
  node.addEventListener('lostpointercapture', cancel);
  node.addEventListener('click', click);
  return {
    update(next: ColorFoldHandlers) {
      current = next;
    },
    destroy() {
      release();
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', cancel);
      node.removeEventListener('lostpointercapture', cancel);
      node.removeEventListener('click', click);
    },
  };
}
