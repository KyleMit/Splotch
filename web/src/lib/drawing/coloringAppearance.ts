import type { ResolvedTheme } from '$lib/theme';
import { clearOverlay, coloringBookState, setOverlayPage } from '$lib/state/coloringBook.svelte';
import {
  pageColorImage,
  pageNightImage,
  type BookOrientation,
  type ColoringPage,
} from '$lib/state/books';
import { prepareMagicSheetRecode } from './engine';

export function applyColoringPageWithMagicUndo(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
) {
  const previousPage = coloringBookState.overlayPage;
  const previousOrientation = coloringBookState.orientation;
  setOverlayPage(page, orientation);
  if (previousPage?.id === page.id && previousOrientation === orientation) return;
  const targetUrl = theme === 'dark' ? pageNightImage(page, orientation) : null;
  prepareMagicSheetRecode(targetUrl ?? pageColorImage(page, orientation), () => {
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
