import { PRESS_CLICK_CONSUME_WINDOW_MS } from './scribbleGuard';

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
  let consumableClicks = 0;
  let consumeClicksUntil = 0;

  function down(event: PointerEvent) {
    if (pointerId !== undefined || event.button !== 0) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    travel = 0;
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
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (travel < TAP_TRAVEL_PX) current.tap();
    else if (Math.abs(dy) >= TAP_TRAVEL_PX && Math.abs(dy) > Math.abs(dx)) current.fold(dy > 0);
    consumableClicks += 1;
    consumeClicksUntil = performance.now() + PRESS_CLICK_CONSUME_WINDOW_MS;
  }

  function cancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return;
    release();
  }

  function click(event: MouseEvent) {
    if (performance.now() >= consumeClicksUntil) consumableClicks = 0;
    if (event.detail === 0 || consumableClicks === 0) current.tap();
    else consumableClicks -= 1;
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
