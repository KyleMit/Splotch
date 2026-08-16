import type { ResolvedTheme } from '$lib/theme';
import {
  clearOverlay,
  coloringBookState,
  colorSheetUrl,
  nightSheetUrl,
  setOverlayPage,
} from '$lib/state/coloringBook.svelte';
import type { BookOrientation, ColoringPage } from '$lib/state/books';
import { prepareMagicSheetRecode } from './engine';

export function applyColoringPageWithMagicUndo(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
) {
  const previousPage = coloringBookState.overlayPage;
  const previousOrientation = coloringBookState.orientation;
  setOverlayPage(page, orientation);
  if (previousPage === page && previousOrientation === orientation) return;
  const targetUrl = theme === 'dark' ? nightSheetUrl() : null;
  prepareMagicSheetRecode(targetUrl ?? colorSheetUrl(), () => {
    if (previousPage) setOverlayPage(previousPage, previousOrientation);
    else clearOverlay();
  });
}

export function clearColoringPageWithMagicUndo() {
  const previousPage = coloringBookState.overlayPage;
  const previousOrientation = coloringBookState.orientation;
  clearOverlay();
  if (!previousPage) return;
  prepareMagicSheetRecode(null, () => setOverlayPage(previousPage, previousOrientation));
}
