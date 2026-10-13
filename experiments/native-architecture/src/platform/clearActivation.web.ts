const ACTIVATION_KEYS = new Set(['Enter', ' ']);

// The shipping button's keyboard and assistive path (web/src/lib/actions/dragToClear.ts onClick):
// a click with detail zero comes from a key or a screen reader, never a pointer, which only ever
// drags. React Native Web's View forwards these DOM handlers; a focusable button role gets no
// synthesized click from Enter or Space, so the keys are read directly.
export function clearActivationProps(activate: () => void) {
  return {
    focusable: true,
    onClick: (event: { detail: number }) => {
      if (event.detail === 0) activate();
    },
    onKeyDown: (event: { key: string; preventDefault(): void }) => {
      if (!ACTIVATION_KEYS.has(event.key)) return;
      event.preventDefault();
      activate();
    },
  };
}
