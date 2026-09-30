import { afterEach, describe, expect, it, vi } from 'vitest';

import { booksForPlatform, pageFillImage } from '$lib/state/books';
import { clearOverlay, coloringBookState, setOverlayPage } from '$lib/state/coloringBook.svelte';
import { setColoringBook } from '$lib/state/settings.svelte';
import {
  applyColoringPageWithMagicUndo,
  clearColoringPageWithMagicUndo,
} from './coloringAppearance';
import { prepareMagicSheetRecode } from './engine';

vi.mock('./engine', () => ({
  prepareMagicSheetRecode: vi.fn(),
}));

afterEach(() => {
  clearOverlay();
  setColoringBook(true);
  vi.clearAllMocks();
});

// The engine keeps the callback a page change hands it and runs it on Undo.
function undoLastPageChange() {
  const restoreAppearance = vi.mocked(prepareMagicSheetRecode).mock.lastCall?.[1];
  if (!restoreAppearance) throw new Error('No page change prepared an undo');
  restoreAppearance();
}

// What the Settings switch does as it turns the feature off.
function switchColoringBookOff() {
  setColoringBook(false);
  clearOverlay();
}

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
      page.nightFill.landscape,
      expect.any(Function)
    );
  });
});

describe('undoing a coloring page change', () => {
  it('restores the earlier page and its orientation while Coloring book is on', () => {
    const [earlier, later] = booksForPlatform('web')[0].pages;
    applyColoringPageWithMagicUndo(earlier, 'portrait', 'light');
    applyColoringPageWithMagicUndo(later, 'landscape', 'light');

    undoLastPageChange();

    expect(coloringBookState.overlayPage?.id).toBe(earlier.id);
    expect(coloringBookState.orientation).toBe('portrait');
  });

  it('leaves the paper without a page once Coloring book is switched off', () => {
    const [earlier, later] = booksForPlatform('web')[0].pages;
    applyColoringPageWithMagicUndo(earlier, 'landscape', 'light');
    applyColoringPageWithMagicUndo(later, 'landscape', 'light');
    switchColoringBookOff();

    undoLastPageChange();

    expect(coloringBookState.overlayPage).toBeNull();
  });

  it('clears the page when the change was the first pick on a blank paper', () => {
    const page = booksForPlatform('web')[0].pages[0];
    applyColoringPageWithMagicUndo(page, 'landscape', 'light');

    undoLastPageChange();

    expect(coloringBookState.overlayPage).toBeNull();
  });
});

describe('undoing a coloring page removal', () => {
  it('restores the removed page while Coloring book is on', () => {
    const page = booksForPlatform('web')[0].pages[0];
    setOverlayPage(page, 'landscape');
    clearColoringPageWithMagicUndo();

    undoLastPageChange();

    expect(coloringBookState.overlayPage?.id).toBe(page.id);
    expect(coloringBookState.orientation).toBe('landscape');
  });

  it('leaves the paper without a page once Coloring book is switched off', () => {
    const page = booksForPlatform('web')[0].pages[0];
    setOverlayPage(page, 'landscape');
    clearColoringPageWithMagicUndo();
    switchColoringBookOff();

    undoLastPageChange();

    expect(coloringBookState.overlayPage).toBeNull();
  });
});
