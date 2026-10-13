// A control replaced by another with the same id hands focus across by that id; the browser would
// otherwise leave it on <body> once the focused control unmounts.
export function focusedElementId(): string | null {
  return document.activeElement?.id || null;
}

export function focusElementById(id: string) {
  document.getElementById(id)?.focus();
}
