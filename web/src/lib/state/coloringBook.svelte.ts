// The catalog itself lives in a plain JS module so build scripts can read it
// too. Re-exported here so existing `$lib/state/coloringBook.svelte.js` imports
// keep working.
import {
  pageImage,
  pageColorImage,
  pageNightImage,
  pageChalkImage,
  type BookOrientation,
  type ColoringPage,
} from './books';

export { BOOKS, PLATFORMS, booksForPlatform } from './books';

interface ColoringBookState {
  overlayUrl: string | null;
  // The chalk outline for the active page/orientation — the dedicated dark-mode
  // line art (ink-on-white, inverted by --lineart-filter at render) — or null
  // when the page hasn't forked yet. DrawingCanvas shows this instead of
  // overlayUrl in dark mode, falling back to overlayUrl if null.
  chalkUrl: string | null;
  // The flat-colored fill of the active page, revealed by the magic brush
  // (ADR-0043). Tracked alongside overlayUrl so it's always in lockstep with the
  // line art currently shown.
  colorSheetUrl: string | null;
  // The pre-colored "night" fill for the active page/orientation (ADR-0052
  // direction B), or null when none is generated yet. Dark mode reveals this
  // instead of colorSheetUrl; DrawingCanvas falls back to colorSheetUrl if null.
  nightSheetUrl: string | null;
  overlayPage: ColoringPage | null;
}

export const coloringBookState: ColoringBookState = $state({
  overlayUrl: null,
  chalkUrl: null,
  colorSheetUrl: null,
  nightSheetUrl: null,
  overlayPage: null,
});

export function setOverlayPage(page: ColoringPage, orientation: BookOrientation) {
  coloringBookState.overlayPage = page;
  coloringBookState.overlayUrl = pageImage(page, orientation);
  coloringBookState.chalkUrl = pageChalkImage(page, orientation);
  coloringBookState.colorSheetUrl = pageColorImage(page, orientation);
  coloringBookState.nightSheetUrl = pageNightImage(page, orientation);
}

export function clearOverlay() {
  coloringBookState.overlayUrl = null;
  coloringBookState.chalkUrl = null;
  coloringBookState.colorSheetUrl = null;
  coloringBookState.nightSheetUrl = null;
  coloringBookState.overlayPage = null;
}
