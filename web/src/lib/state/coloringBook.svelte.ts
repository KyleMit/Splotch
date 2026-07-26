// The catalog lives in a rune-free TypeScript module so build scripts can read it too.
import {
  pageImage,
  pageColorImage,
  pageNightImage,
  pageChalkImage,
  type BookOrientation,
  type ColoringPage,
} from './books';

export { BOOKS, booksForPlatform } from './books';

interface ColoringBookState {
  overlayPage: ColoringPage | null;
  orientation: BookOrientation;
}

export const coloringBookState: ColoringBookState = $state({
  overlayPage: null,
  orientation: 'portrait',
});

export function setOverlayPage(page: ColoringPage, orientation: BookOrientation) {
  coloringBookState.overlayPage = page;
  coloringBookState.orientation = orientation;
}

export function setOverlayOrientation(orientation: BookOrientation) {
  coloringBookState.orientation = orientation;
}

export function overlayUrl(): string | null {
  const page = coloringBookState.overlayPage;
  return page ? pageImage(page, coloringBookState.orientation) : null;
}

export function chalkUrl(): string | null {
  const page = coloringBookState.overlayPage;
  return page ? pageChalkImage(page, coloringBookState.orientation) : null;
}

export function colorSheetUrl(): string | null {
  const page = coloringBookState.overlayPage;
  return page ? pageColorImage(page, coloringBookState.orientation) : null;
}

export function nightSheetUrl(): string | null {
  const page = coloringBookState.overlayPage;
  return page ? pageNightImage(page, coloringBookState.orientation) : null;
}

export function clearOverlay() {
  coloringBookState.overlayPage = null;
}
