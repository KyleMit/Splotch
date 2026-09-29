import type { ResolvedTheme } from '$lib/theme';
import { clearOverlay, coloringBookState, setOverlayPage } from '$lib/state/coloringBook.svelte';
import { settingsState } from '$lib/state/settings.svelte';
import { pageFillImage, type BookOrientation, type ColoringPage } from '$lib/state/books';
import { prepareMagicSheetRecode } from './engine';

// Undo history outlives the Settings switch: a page change made while Coloring
// book was on can be undone after it is off, when the paper shows no page and
// the child has no control left to remove one.
function restoreColoringPage(page: ColoringPage | null, orientation: BookOrientation) {
  if (page && settingsState.coloringBookEnabled) setOverlayPage(page, orientation);
  else clearOverlay();
}

export function applyColoringPageWithMagicUndo(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
) {
  const previousPage = coloringBookState.overlayPage;
  const previousOrientation = coloringBookState.orientation;
  setOverlayPage(page, orientation);
  if (previousPage?.id === page.id && previousOrientation === orientation) return;
  prepareMagicSheetRecode(pageFillImage(page, orientation, theme), () =>
    restoreColoringPage(previousPage, previousOrientation)
  );
}

export function clearColoringPageWithMagicUndo() {
  const previousPage = coloringBookState.overlayPage;
  const previousOrientation = coloringBookState.orientation;
  clearOverlay();
  if (!previousPage) return;
  prepareMagicSheetRecode(null, () => restoreColoringPage(previousPage, previousOrientation));
}
