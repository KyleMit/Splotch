import { describe, it, expect, beforeEach } from 'vitest';
import { createColoringBook, type ColoringBookState } from './coloringBook.svelte';
import { BOOKS, bookAssetPaths } from './books';

const page = BOOKS[0].pages[0];
const spaceBook = BOOKS.find((b) => b.id === 'space')!;
const spacePage = spaceBook.pages[0];
const pageWithoutNight = { ...page, nightFill: {} };

describe('coloring book state', () => {
  let book: ColoringBookState;

  beforeEach(() => {
    book = createColoringBook();
  });

  it('starts with no overlay in portrait', () => {
    expect(book.overlayPage).toBeNull();
    expect(book.orientation).toBe('portrait');
    expect(book.overlayUrl()).toBeNull();
  });

  it('refuses writes through the overlay-page getter', () => {
    const mutablePage = {
      ...page,
      lightLineArt: { ...page.lightLineArt },
      lightFill: { ...page.lightFill },
      nightFill: { ...page.nightFill },
      darkLineArt: { ...page.darkLineArt },
    };
    book.setOverlayPage(mutablePage, 'portrait');

    expect(() => {
      Object.assign(book.overlayPage!.lightLineArt, { portrait: '/tampered.svg' });
    }).toThrow(TypeError);
    expect(book.overlayPage?.lightLineArt.portrait).toBe(page.lightLineArt.portrait);
  });

  it('keeps the same view when an overlay-page getter value is stored again', () => {
    book.setOverlayPage(page, 'portrait');
    const view = book.overlayPage!;

    book.setOverlayPage(view, 'portrait');

    expect(book.overlayPage).toBe(view);
  });

  it('setOverlayPage tracks the line art and the colored fill together', () => {
    book.setOverlayPage(page, 'landscape');
    expect(book.overlayUrl()).toBe(page.lightLineArt.landscape);
    expect(book.fillSheetUrl('light')).toBe(page.lightFill.landscape);
    expect(book.overlayPage?.id).toBe(page.id);
  });

  it('updates every asset accessor when only the orientation changes', () => {
    book.setOverlayPage(spacePage, 'landscape');
    expect(book.overlayUrl()).toBe(spacePage.lightLineArt.landscape);
    expect(book.fillSheetUrl('light')).toBe(spacePage.lightFill.landscape);
    expect(book.fillSheetUrl('dark')).toBe(spacePage.nightFill.landscape);

    book.setOverlayOrientation('portrait');
    expect(book.overlayUrl()).toBe(spacePage.lightLineArt.portrait);
    expect(book.fillSheetUrl('light')).toBe(spacePage.lightFill.portrait);
    expect(book.fillSheetUrl('dark')).toBe(spacePage.nightFill.portrait);
  });

  it('clearOverlay drops the line art and the fill sheet for either theme', () => {
    book.setOverlayPage(spacePage, 'portrait');
    book.clearOverlay();
    expect(book.overlayUrl()).toBeNull();
    expect(book.fillSheetUrl('light')).toBeNull();
    expect(book.fillSheetUrl('dark')).toBeNull();
    expect(book.overlayPage).toBeNull();
  });

  it('the colored fill is derived from the line-art path', () => {
    expect(page.lightFill.portrait).toBe(
      page.lightLineArt.portrait.replace('.overlay.svg', '.light.webp')
    );
    expect(page.lightFill.landscape).toBe(
      page.lightLineArt.landscape.replace('.overlay.svg', '.light.webp')
    );
  });

  it('tracks the night fill in dark for each orientation that has one', () => {
    // Space ships night fills for both orientations (ADR-0052 direction B),
    // derived from the line-art path.
    book.setOverlayPage(spacePage, 'portrait');
    expect(book.fillSheetUrl('dark')).toBe(spacePage.nightFill.portrait);
    expect(book.fillSheetUrl('dark')).toBe(
      spacePage.lightLineArt.portrait.replace('.overlay.svg', '.night.webp')
    );
    book.setOverlayOrientation('landscape');
    expect(book.fillSheetUrl('dark')).toBe(spacePage.nightFill.landscape);
    expect(book.fillSheetUrl('dark')).toBe(
      spacePage.lightLineArt.landscape.replace('.overlay.svg', '.night.webp')
    );
  });

  it('pages without a night fill fall back to the light fill in dark', () => {
    book.setOverlayPage(pageWithoutNight, 'portrait');
    expect(book.fillSheetUrl('dark')).toBe(pageWithoutNight.lightFill.portrait);
  });

  it('picks matching full-resolution art for the resolved theme', () => {
    book.setOverlayPage(spacePage, 'landscape');
    expect(book.themedOverlayUrl('light')).toBe(spacePage.lightLineArt.landscape);
    expect(book.themedOverlayUrl('dark')).toBe(
      spacePage.lightLineArt.landscape.replace('.overlay.svg', '.dark.overlay.svg')
    );
  });

  it('can derive another orientation without changing the active orientation', () => {
    book.setOverlayPage(spacePage, 'landscape');
    expect(book.themedOverlayUrl('dark', 'portrait')).toBe(
      spacePage.lightLineArt.portrait.replace('.overlay.svg', '.dark.overlay.svg')
    );
    expect(book.orientation).toBe('landscape');
  });
});

describe('book asset manifest', () => {
  it('bookAssetPaths lists each page and its colored fill (so check-assets guards it)', () => {
    for (const book of BOOKS) {
      const paths = bookAssetPaths(book);
      for (const p of book.pages) {
        expect(paths).toContain(p.lightLineArt.portrait);
        expect(paths).toContain(p.lightLineArt.landscape);
        expect(paths).toContain(p.lightFill.portrait);
        expect(paths).toContain(p.lightFill.landscape);
        // Night fills are listed only where they exist; dark overlays are invariant.
        for (const url of [...Object.values(p.nightFill), ...Object.values(p.darkLineArt)]) {
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
        expect(p.nightFill.portrait).toBeTruthy();
        expect(p.nightFill.landscape).toBeTruthy();
        expect(paths).toContain(p.nightFill.portrait);
        expect(paths).toContain(p.nightFill.landscape);
      }
    }
  });
});
