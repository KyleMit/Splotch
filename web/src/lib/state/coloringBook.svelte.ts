// The catalog itself lives in a plain JS module so build scripts can read it
// too. Re-exported here so existing `$lib/state/coloringBook.svelte.js` imports
// keep working.
import { pageImage, pageColorImage, type BookOrientation, type ColoringPage } from './books';

export { BOOKS, PLATFORMS, booksForPlatform } from './books';

interface ColoringBookState {
  overlayUrl: string | null;
  // The flat-colored twin of the active page, revealed by the magic brush
  // (ADR-0043). Tracked alongside overlayUrl so it's always in lockstep with the
  // line art currently shown.
  colorSheetUrl: string | null;
  overlayPage: ColoringPage | null;
}

export const coloringBookState: ColoringBookState = $state({
  overlayUrl: null,
  colorSheetUrl: null,
  overlayPage: null,
});

export function setOverlayPage(page: ColoringPage, orientation: BookOrientation) {
  coloringBookState.overlayPage = page;
  coloringBookState.overlayUrl = pageImage(page, orientation);
  coloringBookState.colorSheetUrl = pageColorImage(page, orientation);
}

export function clearOverlay() {
  coloringBookState.overlayUrl = null;
  coloringBookState.colorSheetUrl = null;
  coloringBookState.overlayPage = null;
}
