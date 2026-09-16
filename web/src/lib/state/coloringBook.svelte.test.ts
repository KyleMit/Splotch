import { describe, it, expect, beforeEach } from 'vitest';
import { createColoringBook, type ColoringBookState } from './coloringBook.svelte';
import { BOOKS, bookAssetPaths, pageNightImage } from './books';

const page = BOOKS[0].pages[0];
const spaceBook = BOOKS.find((b) => b.id === 'space')!;
const spacePage = spaceBook.pages[0];
const pageWithoutNight = { ...page, nightImages: {} };

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
      images: { ...page.images },
      colorImages: { ...page.colorImages },
      nightImages: { ...page.nightImages },
      darkImages: { ...page.darkImages },
    };
    book.setOverlayPage(mutablePage, 'portrait');

    expect(() => {
      Object.assign(book.overlayPage!.images, { portrait: '/tampered.svg' });
    }).toThrow(TypeError);
    expect(book.overlayPage?.images.portrait).toBe(page.images.portrait);
  });

  it('keeps the same view when an overlay-page getter value is stored again', () => {
    book.setOverlayPage(page, 'portrait');
    const view = book.overlayPage!;

    book.setOverlayPage(view, 'portrait');

    expect(book.overlayPage).toBe(view);
  });

  it('setOverlayPage tracks the line art and the colored fill together', () => {
    book.setOverlayPage(page, 'landscape');
    expect(book.overlayUrl()).toBe(page.images.landscape);
    expect(book.colorSheetUrl()).toBe(page.colorImages.landscape);
    expect(book.overlayPage?.id).toBe(page.id);
  });

  it('updates every asset accessor when only the orientation changes', () => {
    book.setOverlayPage(spacePage, 'landscape');
    expect(book.overlayUrl()).toBe(spacePage.images.landscape);
    expect(book.colorSheetUrl()).toBe(spacePage.colorImages.landscape);
    expect(book.nightSheetUrl()).toBe(spacePage.nightImages.landscape);

    book.setOverlayOrientation('portrait');
    expect(book.overlayUrl()).toBe(spacePage.images.portrait);
    expect(book.colorSheetUrl()).toBe(spacePage.colorImages.portrait);
    expect(book.nightSheetUrl()).toBe(spacePage.nightImages.portrait);
  });

  it('clearOverlay drops the line art, color sheet, and night sheet', () => {
    book.setOverlayPage(spacePage, 'portrait');
    book.clearOverlay();
    expect(book.overlayUrl()).toBeNull();
    expect(book.colorSheetUrl()).toBeNull();
    expect(book.nightSheetUrl()).toBeNull();
    expect(book.overlayPage).toBeNull();
  });

  it('the colored fill is derived from the line-art path', () => {
    expect(page.colorImages.portrait).toBe(
      page.images.portrait.replace('.overlay.svg', '.light.webp')
    );
    expect(page.colorImages.landscape).toBe(
      page.images.landscape.replace('.overlay.svg', '.light.webp')
    );
  });

  it('tracks the night fill for each orientation that has one', () => {
    // Space ships night fills for both orientations (ADR-0052 direction B),
    // derived from the line-art path.
    book.setOverlayPage(spacePage, 'portrait');
    expect(book.nightSheetUrl()).toBe(spacePage.nightImages.portrait);
    expect(book.nightSheetUrl()).toBe(
      spacePage.images.portrait.replace('.overlay.svg', '.night.webp')
    );
    book.setOverlayOrientation('landscape');
    expect(book.nightSheetUrl()).toBe(spacePage.nightImages.landscape);
    expect(book.nightSheetUrl()).toBe(
      spacePage.images.landscape.replace('.overlay.svg', '.night.webp')
    );
  });

  it('pages without a night fill track a null night sheet', () => {
    book.setOverlayPage(pageWithoutNight, 'portrait');
    expect(book.nightSheetUrl()).toBeNull();
    expect(pageNightImage(pageWithoutNight, 'portrait')).toBeNull();
  });

  it('picks matching full-resolution art for the resolved theme', () => {
    book.setOverlayPage(spacePage, 'landscape');
    expect(book.themedOverlayUrl('light')).toBe(spacePage.images.landscape);
    expect(book.themedOverlayUrl('dark')).toBe(
      spacePage.images.landscape.replace('.overlay.svg', '.dark.overlay.svg')
    );
  });

  it('can derive another orientation without changing the active orientation', () => {
    book.setOverlayPage(spacePage, 'landscape');
    expect(book.themedOverlayUrl('dark', 'portrait')).toBe(
      spacePage.images.portrait.replace('.overlay.svg', '.dark.overlay.svg')
    );
    expect(book.orientation).toBe('landscape');
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
        // Night fills are listed only where they exist; dark overlays are invariant.
        for (const url of [...Object.values(p.nightImages), ...Object.values(p.darkImages)]) {
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
