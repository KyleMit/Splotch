// The catalog itself lives in a plain JS module so build scripts can read it
// too. Re-exported here so existing `$lib/state/coloringBook.svelte.js` imports
// keep working.
export { BOOKS, PLATFORMS, booksForPlatform } from './books';

export const coloringBookState: { overlayUrl: string | null } = $state({
  overlayUrl: null
});

export function setOverlay(url: string) {
  coloringBookState.overlayUrl = url;
}

export function clearOverlay() {
  coloringBookState.overlayUrl = null;
}
