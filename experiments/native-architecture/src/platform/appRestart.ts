// The native apps have no document to reload; AppRestartRoot remounts their session owners.
export function reloadApp(): boolean {
  return false;
}
