import { describe, it, expect, beforeEach } from 'vitest';
import { coloringBookState, setOverlayPage, clearOverlay } from './coloringBook.svelte';
import { BOOKS, bookAssetPaths, pageNightImage } from './books';

const page = BOOKS[0].pages[0];
const spaceBook = BOOKS.find((b) => b.id === 'space')!;
const spacePage = spaceBook.pages[0];
// A page with no night twin in any orientation. Synthetic rather than a catalog
// page so the null-night-sheet test stays valid as more categories ship their
// twins (eventually every catalog page has one).
const pageWithoutNight = { ...page, nightImages: {} };

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
    expect(page.colorImages.portrait).toBe(
      page.images.portrait.replace('.outline.webp', '.light.webp')
    );
    expect(page.colorImages.landscape).toBe(
      page.images.landscape.replace('.outline.webp', '.light.webp')
    );
  });

  it('tracks the night twin for each orientation that has one', () => {
    // Space ships night twins for both orientations (ADR-0052 direction B),
    // derived from the line-art path.
    setOverlayPage(spacePage, 'portrait');
    expect(coloringBookState.nightSheetUrl).toBe(spacePage.nightImages.portrait);
    expect(coloringBookState.nightSheetUrl).toBe(
      spacePage.images.portrait.replace('.outline.webp', '.night.webp')
    );
    setOverlayPage(spacePage, 'landscape');
    expect(coloringBookState.nightSheetUrl).toBe(spacePage.nightImages.landscape);
    expect(coloringBookState.nightSheetUrl).toBe(
      spacePage.images.landscape.replace('.outline.webp', '.night.webp')
    );
  });

  it('pages without a night twin track a null night sheet', () => {
    setOverlayPage(pageWithoutNight, 'portrait');
    expect(coloringBookState.nightSheetUrl).toBeNull();
    expect(pageNightImage(pageWithoutNight, 'portrait')).toBeNull();
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

  it('lists the shipped night twins (both orientations) for Space and Nature', () => {
    for (const id of ['space', 'nature']) {
      const book = BOOKS.find((b) => b.id === id)!;
      const paths = bookAssetPaths(book);
      for (const p of book.pages) {
        expect(p.nightImages.portrait).toBeTruthy();
        expect(p.nightImages.landscape).toBeTruthy();
        expect(paths).toContain(p.nightImages.portrait);
        expect(paths).toContain(p.nightImages.landscape);
      }
    }
  });
});
