import { afterEach, describe, expect, it, vi } from 'vitest';

import { booksForPlatform, pageFillImage } from '$lib/state/books';
import { clearOverlay, coloringBookState, setOverlayPage } from '$lib/state/coloringBook.svelte';
import { applyColoringPageWithMagicUndo } from './coloringAppearance';
import { prepareMagicSheetRecode } from './engine';

vi.mock('./engine', () => ({
  prepareMagicSheetRecode: vi.fn(),
}));

afterEach(() => {
  clearOverlay();
  vi.clearAllMocks();
});

describe('coloring appearance', () => {
  it('does not create a recode command when the active page is selected again', () => {
    const page = booksForPlatform('web')[0].pages[0];
    setOverlayPage(page, 'landscape');

    applyColoringPageWithMagicUndo(page, 'landscape', 'light');

    expect(coloringBookState.overlayPage?.id).toBe(page.id);
    expect(prepareMagicSheetRecode).not.toHaveBeenCalled();
  });

  it('derives the target sheet from the requested page and orientation', () => {
    const page = booksForPlatform('web')[0].pages[1];

    applyColoringPageWithMagicUndo(page, 'landscape', 'light');

    expect(prepareMagicSheetRecode).toHaveBeenCalledWith(
      pageFillImage(page, 'landscape', 'light'),
      expect.any(Function)
    );
  });

  it('targets the night sheet when the page is applied in dark', () => {
    const page = booksForPlatform('web')[0].pages[1];

    applyColoringPageWithMagicUndo(page, 'landscape', 'dark');

    expect(prepareMagicSheetRecode).toHaveBeenCalledWith(
      page.nightImages.landscape,
      expect.any(Function)
    );
  });
});
