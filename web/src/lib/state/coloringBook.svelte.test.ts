import { describe, it, expect, beforeEach } from 'vitest';
import { coloringBookState, setOverlayPage, clearOverlay } from './coloringBook.svelte';
import { BOOKS, bookAssetPaths, pageNightImage, pageChalkImage } from './books';

const page = BOOKS[0].pages[0];
const spaceBook = BOOKS.find((b) => b.id === 'space')!;
const spacePage = spaceBook.pages[0];
// A page with no night fill or chalk outline in any orientation. Synthetic
// rather than a catalog page so the null-fallback tests stay valid as more
// categories ship their assets (eventually every catalog page has them).
const pageWithoutNight = { ...page, nightImages: {}, chalkImages: {} };

describe('coloring book state', () => {
  beforeEach(() => clearOverlay());

  it('setOverlayPage tracks the line art and the colored fill together', () => {
    setOverlayPage(page, 'landscape');
    expect(coloringBookState.overlayUrl).toBe(page.images.landscape);
    expect(coloringBookState.colorSheetUrl).toBe(page.colorImages.landscape);
    expect(coloringBookState.overlayPage?.id).toBe(page.id);
  });

  it('swaps both URLs to the orientation fill on rotation', () => {
    setOverlayPage(page, 'landscape');
    setOverlayPage(page, 'portrait');
    expect(coloringBookState.overlayUrl).toBe(page.images.portrait);
    expect(coloringBookState.colorSheetUrl).toBe(page.colorImages.portrait);
  });

  it('clearOverlay drops the line art, the chalk, the color sheet, and the night sheet', () => {
    setOverlayPage(spacePage, 'portrait');
    clearOverlay();
    expect(coloringBookState.overlayUrl).toBeNull();
    expect(coloringBookState.chalkUrl).toBeNull();
    expect(coloringBookState.colorSheetUrl).toBeNull();
    expect(coloringBookState.nightSheetUrl).toBeNull();
    expect(coloringBookState.overlayPage).toBeNull();
  });

  it('the colored fill is derived from the line-art path', () => {
    expect(page.colorImages.portrait).toBe(
      page.images.portrait.replace('.outline.webp', '.light.webp')
    );
    expect(page.colorImages.landscape).toBe(
      page.images.landscape.replace('.outline.webp', '.light.webp')
    );
  });

  it('tracks the night fill for each orientation that has one', () => {
    // Space ships night fills for both orientations (ADR-0052 direction B),
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

  it('pages without a night fill track a null night sheet', () => {
    setOverlayPage(pageWithoutNight, 'portrait');
    expect(coloringBookState.nightSheetUrl).toBeNull();
    expect(pageNightImage(pageWithoutNight, 'portrait')).toBeNull();
  });

  it('tracks the chalk outline where one exists, null otherwise', () => {
    const chalked = {
      ...page,
      chalkImages: { portrait: '/coloring/farm/cat-tall.chalk.webp' },
    };
    setOverlayPage(chalked, 'portrait');
    expect(coloringBookState.chalkUrl).toBe('/coloring/farm/cat-tall.chalk.webp');
    expect(pageChalkImage(chalked, 'portrait')).toBe('/coloring/farm/cat-tall.chalk.webp');
    setOverlayPage(chalked, 'landscape');
    expect(coloringBookState.chalkUrl).toBeNull();
    expect(pageChalkImage(chalked, 'landscape')).toBeNull();
  });
});

describe('book asset manifest', () => {
  it('bookAssetPaths lists each page and its colored fill (so check-assets guards it)', () => {
    for (const book of BOOKS) {
      const paths = bookAssetPaths(book);
      for (const p of book.pages) {
        expect(paths).toContain(p.images.portrait);
        expect(paths).toContain(p.images.landscape);
        expect(paths).toContain(p.colorImages.portrait);
        expect(paths).toContain(p.colorImages.landscape);
        // Night fills and chalk outlines are listed only where they exist, so
        // check-assets guards them too.
        for (const url of [...Object.values(p.nightImages), ...Object.values(p.chalkImages)]) {
          expect(paths).toContain(url);
        }
      }
    }
  });

  it('lists the shipped night fills (both orientations) for Space and Nature', () => {
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
