import { describe, it, expect, beforeEach } from 'vitest';
import { coloringBookState, setOverlayPage, clearOverlay } from './coloringBook.svelte';
import { BOOKS, bookAssetPaths, pageNightImage } from './books';

const page = BOOKS[0].pages[0];
const spaceBook = BOOKS.find((b) => b.id === 'space')!;
const spacePage = spaceBook.pages[0];

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

  it('clearOverlay drops the line art, the color sheet, and the night sheet', () => {
    setOverlayPage(spacePage, 'portrait');
    clearOverlay();
    expect(coloringBookState.overlayUrl).toBeNull();
    expect(coloringBookState.colorSheetUrl).toBeNull();
    expect(coloringBookState.nightSheetUrl).toBeNull();
    expect(coloringBookState.overlayPage).toBeNull();
  });

  it('the colored twin is derived from the line-art path', () => {
    expect(page.colorImages.portrait).toBe(page.images.portrait.replace('.webp', '.color.webp'));
    expect(page.colorImages.landscape).toBe(page.images.landscape.replace('.webp', '.color.webp'));
  });

  it('tracks the night twin only for orientations that have one', () => {
    // Space ships portrait night twins (ADR-0052 direction B) but not landscape yet.
    setOverlayPage(spacePage, 'portrait');
    expect(coloringBookState.nightSheetUrl).toBe(spacePage.nightImages.portrait);
    expect(coloringBookState.nightSheetUrl).toBe(
      spacePage.images.portrait.replace('.webp', '.night.webp')
    );
    setOverlayPage(spacePage, 'landscape');
    expect(coloringBookState.nightSheetUrl).toBeNull();
  });

  it('pages without a night twin track a null night sheet', () => {
    setOverlayPage(page, 'portrait');
    expect(coloringBookState.nightSheetUrl).toBeNull();
    expect(pageNightImage(page, 'portrait')).toBeNull();
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
        // Night twins are listed only where they exist, so check-assets guards them too.
        for (const url of Object.values(p.nightImages)) {
          expect(paths).toContain(url);
        }
      }
    }
  });

  it('lists the shipped Space night twins', () => {
    const paths = bookAssetPaths(spaceBook);
    for (const p of spaceBook.pages) {
      expect(paths).toContain(p.nightImages.portrait);
    }
  });
});
