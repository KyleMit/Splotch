// Focus moves to the element that replaced the control holding it, which the browser would
// otherwise leave on <body> once that control unmounts.
export function landFocus(element: HTMLElement | null) {
  element?.focus();
}
