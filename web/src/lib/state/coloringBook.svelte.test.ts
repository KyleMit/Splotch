import { describe, it, expect, beforeEach } from 'vitest';
import { coloringBookState, setOverlayPage, clearOverlay } from './coloringBook.svelte';
import { BOOKS, bookAssetPaths } from './books';

const page = BOOKS[0].pages[0];

describe('coloring book state', () => {
  beforeEach(() => clearOverlay());

  it('setOverlayPage tracks the line art and the colored twin together', () => {
    setOverlayPage(page, 'landscape');
    expect(coloringBookState.overlayUrl).toBe(page.images.landscape);
    expect(coloringBookState.colorSheetUrl).toBe(page.colorImages.landscape);
    expect(coloringBookState.overlayPage?.id).toBe(page.id);
  });

  it('swaps both URLs to the orientation twin on rotation', () => {
    setOverlayPage(page, 'landscape');
    setOverlayPage(page, 'portrait');
    expect(coloringBookState.overlayUrl).toBe(page.images.portrait);
    expect(coloringBookState.colorSheetUrl).toBe(page.colorImages.portrait);
  });

  it('clearOverlay drops the line art and the color sheet', () => {
    setOverlayPage(page, 'portrait');
    clearOverlay();
    expect(coloringBookState.overlayUrl).toBeNull();
    expect(coloringBookState.colorSheetUrl).toBeNull();
    expect(coloringBookState.overlayPage).toBeNull();
  });

  it('the colored twin is derived from the line-art path', () => {
    expect(page.colorImages.portrait).toBe(page.images.portrait.replace('.webp', '.color.webp'));
    expect(page.colorImages.landscape).toBe(page.images.landscape.replace('.webp', '.color.webp'));
  });
});

describe('book asset manifest', () => {
  it('bookAssetPaths lists each page and its colored twin (so check-assets guards it)', () => {
    for (const book of BOOKS) {
      const paths = bookAssetPaths(book);
      for (const p of book.pages) {
        expect(paths).toContain(p.images.portrait);
        expect(paths).toContain(p.images.landscape);
        expect(paths).toContain(p.colorImages.portrait);
        expect(paths).toContain(p.colorImages.landscape);
      }
    }
  });
});
