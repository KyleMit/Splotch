import { useEffect, useRef } from 'react';

const ESCAPE_KEY = 'Escape';

// Shipping's actionPanelEvents.ts: Escape closes an open Brush or Stroke Width menu wherever focus
// is on the page.
export function useFlyoutEscape(active: boolean, onEscape: () => void) {
  const handler = useRef(onEscape);
  handler.current = onEscape;
  useEffect(() => {
    if (!active) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === ESCAPE_KEY) handler.current();
    };
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [active]);
}

// Shipping's closeFlyout({ restoreFocus: true }): when Escape or a pick removes the menu while the
// keyboard is inside it or on its button, focus goes back to that button rather than falling to
// the page body. A pointer that closed it from elsewhere leaves focus where it is.
export function refocusFlyoutTrigger(menu: unknown, trigger: unknown) {
  const active = document.activeElement;
  if (!(trigger instanceof HTMLElement) || !(active instanceof Node)) return;
  const inMenu = menu instanceof HTMLElement && menu.contains(active);
  if (!inMenu && !trigger.contains(active)) return;
  trigger.querySelector('button')?.focus();
}
