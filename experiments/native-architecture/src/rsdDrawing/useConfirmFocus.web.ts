import { useEffect, type ReactNode, type RefObject } from 'react';

export function useConfirmFocus(
  card: RefObject<HTMLElement | null>,
  active: boolean,
  children: ReactNode
) {
  useEffect(() => {
    if (!active) return;
    let current = true;
    // RNW's parent focus trap saves its opener in a passive effect after the body mounts.
    queueMicrotask(() => {
      const element = card.current;
      const focused = document.activeElement;
      if (
        !current ||
        !element?.isConnected ||
        element.closest('[inert]') ||
        (element.contains(focused) && focused?.matches('button, input, select, textarea, a[href]'))
      )
        return;
      element.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
    });
    return () => {
      current = false;
    };
  }, [card, active, children]);
}
