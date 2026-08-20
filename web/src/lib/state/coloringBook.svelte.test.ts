import { describe, it, expect, beforeEach } from 'vitest';
import {
  coloringBookState,
  setOverlayPage,
  setOverlayOrientation,
  overlayUrl,
  chalkUrl,
  themedOverlayUrl,
  themedOverlayImageSource,
  colorSheetUrl,
  nightSheetUrl,
  clearOverlay,
} from './coloringBook.svelte';
import { BOOKS, bookAssetPaths, pageNightImage, pageChalkImage } from './books';

const page = BOOKS[0].pages[0];
const spaceBook = BOOKS.find((b) => b.id === 'space')!;
const spacePage = spaceBook.pages[0];
const stationPage = spaceBook.pages.find((candidate) => candidate.id === 'station')!;
// A page with no night fill or chalk outline in any orientation. Synthetic
// rather than a catalog page so the null-fallback tests stay valid as more
// categories ship their assets (eventually every catalog page has them).
const pageWithoutNight = { ...page, nightImages: {}, chalkImages: {} };

describe('coloring book state', () => {
  beforeEach(() => clearOverlay());

  it('setOverlayPage tracks the line art and the colored fill together', () => {
    setOverlayPage(page, 'landscape');
    expect(overlayUrl()).toBe(page.images.landscape);
    expect(colorSheetUrl()).toBe(page.colorImages.landscape);
    expect(coloringBookState.overlayPage?.id).toBe(page.id);
  });

  it('updates every asset accessor when only the orientation changes', () => {
    setOverlayPage(spacePage, 'landscape');
    expect(overlayUrl()).toBe(spacePage.images.landscape);
    expect(chalkUrl()).toBe(spacePage.chalkImages.landscape);
    expect(colorSheetUrl()).toBe(spacePage.colorImages.landscape);
    expect(nightSheetUrl()).toBe(spacePage.nightImages.landscape);

    setOverlayOrientation('portrait');
    expect(overlayUrl()).toBe(spacePage.images.portrait);
    expect(chalkUrl()).toBe(spacePage.chalkImages.portrait);
    expect(colorSheetUrl()).toBe(spacePage.colorImages.portrait);
    expect(nightSheetUrl()).toBe(spacePage.nightImages.portrait);
  });

  it('clearOverlay drops the line art, the chalk, the color sheet, and the night sheet', () => {
    setOverlayPage(spacePage, 'portrait');
    clearOverlay();
    expect(overlayUrl()).toBeNull();
    expect(chalkUrl()).toBeNull();
    expect(colorSheetUrl()).toBeNull();
    expect(nightSheetUrl()).toBeNull();
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
    expect(nightSheetUrl()).toBe(spacePage.nightImages.portrait);
    expect(nightSheetUrl()).toBe(spacePage.images.portrait.replace('.outline.webp', '.night.webp'));
    setOverlayOrientation('landscape');
    expect(nightSheetUrl()).toBe(spacePage.nightImages.landscape);
    expect(nightSheetUrl()).toBe(
      spacePage.images.landscape.replace('.outline.webp', '.night.webp')
    );
  });

  it('pages without a night fill track a null night sheet', () => {
    setOverlayPage(pageWithoutNight, 'portrait');
    expect(nightSheetUrl()).toBeNull();
    expect(pageNightImage(pageWithoutNight, 'portrait')).toBeNull();
  });

  it('tracks the chalk outline where one exists, null otherwise', () => {
    const chalked = {
      ...page,
      chalkImages: { portrait: '/coloring/farm/cat-tall.chalk.webp' },
    };
    setOverlayPage(chalked, 'portrait');
    expect(chalkUrl()).toBe('/coloring/farm/cat-tall.chalk.webp');
    expect(pageChalkImage(chalked, 'portrait')).toBe('/coloring/farm/cat-tall.chalk.webp');
    setOverlayOrientation('landscape');
    expect(chalkUrl()).toBeNull();
    expect(pageChalkImage(chalked, 'landscape')).toBeNull();
  });

  it('picks matching full-resolution art for the resolved theme', () => {
    setOverlayPage(spacePage, 'landscape');
    expect(themedOverlayUrl('light')).toBe(
      spacePage.images.landscape.replace('.outline.webp', '.overlay.svg')
    );
    expect(themedOverlayUrl('dark')).toBe(
      spacePage.images.landscape.replace('.outline.webp', '.dark.overlay.svg')
    );
  });

  it('pairs the active overlay with its responsive web candidate', () => {
    setOverlayPage(spacePage, 'portrait');
    expect(themedOverlayImageSource('dark')).toEqual({
      src: spacePage.images.portrait.replace('.outline.webp', '.dark.overlay.svg'),
      srcset: '/coloring/space/astronaut-tall.dark.overlay.svg',
    });
  });

  it('can derive another orientation without changing the active orientation', () => {
    setOverlayPage(spacePage, 'landscape');
    expect(themedOverlayUrl('dark', 'portrait')).toBe(
      spacePage.images.portrait.replace('.outline.webp', '.dark.overlay.svg')
    );
    expect(coloringBookState.orientation).toBe('landscape');
  });

  it('uses the invariant dark SVG for Station landscape', () => {
    setOverlayPage(stationPage, 'landscape');
    expect(themedOverlayImageSource('dark')).toEqual({
      src: '/coloring/space/station-wide.dark.overlay.svg',
      srcset: '/coloring/space/station-wide.dark.overlay.svg',
    });
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
