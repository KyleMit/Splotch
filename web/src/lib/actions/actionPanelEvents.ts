interface ActionPanelHandlers {
  wrapper: () => HTMLElement | undefined;
  stopMotion: () => void;
  close: (options?: { restoreFocus?: boolean }) => void;
}

export function actionPanelEvents(node: HTMLElement, handlers: ActionPanelHandlers) {
  let current = handlers;
  const document = node.ownerDocument;
  function outside(event: PointerEvent) {
    const wrapper = current.wrapper();
    if (wrapper && event.target instanceof Node && !wrapper.contains(event.target)) current.close();
  }
  function escape(event: KeyboardEvent) {
    if (event.key === 'Escape' && current.wrapper()) current.close({ restoreFocus: true });
  }
  const window = document.defaultView;
  const screenOrientation = window?.screen?.orientation;
  const stopMotion = () => current.stopMotion();
  window?.addEventListener('orientationchange', stopMotion);
  if (typeof screenOrientation?.addEventListener === 'function')
    screenOrientation.addEventListener('change', stopMotion);
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  return {
    update(next: ActionPanelHandlers) {
      current = next;
    },
    destroy() {
      stopMotion();
      window?.removeEventListener('orientationchange', stopMotion);
      if (typeof screenOrientation?.removeEventListener === 'function')
        screenOrientation.removeEventListener('change', stopMotion);
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    },
  };
}
