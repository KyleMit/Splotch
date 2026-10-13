// The native apps have no document to reload; the app root remounts instead (AppRestartRoot).
export function reloadApp(): boolean {
  return false;
}
