// Focus moves to the element that replaced the control holding it, which the browser would
// otherwise leave on <body> once that control unmounts.
export function landFocus(element: HTMLElement | null) {
  element?.focus();
}

// A confirm body can arrive after the web Modal's initial focus trap ran against an empty lazy
// scroller. Shipping showModal() sees its controls immediately and focuses the first enabled one.
export function landFirstControl(element: HTMLElement | null) {
  if (
    !element?.isConnected ||
    element.closest('[inert]') ||
    element.contains(document.activeElement)
  )
    return;
  element.querySelector<HTMLElement>('button:not(:disabled)')?.focus();
}

export function retainFocus() {
  const element = document.activeElement;
  return () => {
    if (element instanceof HTMLElement && element.isConnected) element.focus();
  };
}
