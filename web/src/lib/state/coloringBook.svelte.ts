// The catalog lives in a rune-free TypeScript module so build scripts can read it too.
import {
  pageImage,
  pageColorImage,
  pageNightImage,
  pageOverlayImage,
  pageOverlayImageSource,
  type BookOrientation,
  type ColoringPage,
  type ResponsivePaperImage,
} from './books';
import type { ResolvedTheme } from '../theme';

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

export function themedOverlayUrl(
  theme: ResolvedTheme,
  orientation = coloringBookState.orientation
): string | null {
  const page = coloringBookState.overlayPage;
  return page ? pageOverlayImage(page, orientation, theme) : null;
}

export function themedOverlaySource(
  theme: ResolvedTheme,
  orientation = coloringBookState.orientation
): ResponsivePaperImage | null {
  const page = coloringBookState.overlayPage;
  return page ? pageOverlayImageSource(page, orientation, theme) : null;
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
