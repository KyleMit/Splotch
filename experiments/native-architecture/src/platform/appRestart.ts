// The native apps have no document to reload; the app root remounts instead (AppRestartRoot),
// carrying the fresh launch itself.
export function reloadApp(): boolean {
  return false;
}

export function takeFreshStart(): boolean {
  return false;
}
