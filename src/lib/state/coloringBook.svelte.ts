// The catalog itself lives in a plain JS module so build scripts can read it
// too. Re-exported here so existing `$lib/state/coloringBook.svelte.js` imports
// keep working.
import { pageImage, type BookOrientation, type ColoringPage } from './books';

export { BOOKS, PLATFORMS, booksForPlatform } from './books';

interface ColoringBookState {
  overlayUrl: string | null;
  overlayPage: ColoringPage | null;
}

export const coloringBookState: ColoringBookState = $state({
  overlayUrl: null,
  overlayPage: null
});

export function setOverlay(url: string) {
  coloringBookState.overlayUrl = url;
  coloringBookState.overlayPage = null;
}

export function setOverlayPage(page: ColoringPage, orientation: BookOrientation) {
  coloringBookState.overlayPage = page;
  coloringBookState.overlayUrl = pageImage(page, orientation);
}

export function updateOverlayOrientation(orientation: BookOrientation) {
  if (!coloringBookState.overlayPage) return;
  coloringBookState.overlayUrl = pageImage(coloringBookState.overlayPage, orientation);
}

export function clearOverlay() {
  coloringBookState.overlayUrl = null;
  coloringBookState.overlayPage = null;
}
