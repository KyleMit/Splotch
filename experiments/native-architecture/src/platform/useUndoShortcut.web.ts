import { useEffect, useRef } from 'react';

export function useUndoShortcut(undo: () => void, enabled: boolean) {
  const current = useRef({ undo, enabled });
  current.current = { undo, enabled };
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        !current.current.enabled ||
        event.defaultPrevented ||
        event.isComposing ||
        (!event.ctrlKey && !event.metaKey) ||
        event.shiftKey ||
        event.altKey ||
        event.key.toLowerCase() !== 'z' ||
        (event.target instanceof Element &&
          event.target.closest('input, textarea, select, [contenteditable]')) ||
        document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]')
      )
        return;
      event.preventDefault();
      current.current.undo();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
