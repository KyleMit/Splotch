// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOOKS,
  COLORING_IMAGE_SIZES,
  bookAssetPaths,
  bookPackAssetPaths,
  coloringBookGridLayout,
  coverThumb,
  coverThumbImageSource,
  pageColorImage,
  pageCompositionKey,
  pageImage,
  pageOverlayImage,
  responsiveColoringAssets,
} from './books';
import {
  clearLocalColoringBookRoots,
  setLocalColoringBookRoot,
} from '../coloringPacks/assetResolver';

const coloringBookComponent = readFileSync(
  new URL('../components/ColoringBook.svelte', import.meta.url),
  'utf8'
);
const activePageChipComponent = readFileSync(
  new URL('../components/ActivePageChip.svelte', import.meta.url),
  'utf8'
);

describe('page defaults', () => {
  it('every page still ships night + chalk for both orientations', () => {
    for (const book of BOOKS) {
      for (const page of book.pages) {
        expect(Object.keys(page.nightImages).sort()).toEqual(['landscape', 'portrait']);
        expect(Object.keys(page.chalkImages).sort()).toEqual(['landscape', 'portrait']);
      }
    }
  });
});

describe('coverThumb', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;

  it('uses the pen cover in light mode and the chalk cover in dark mode', () => {
    expect(coverThumb(farm, 'light')).toBe('/coloring/farm/cover.thumb.webp');
    expect(coverThumb(farm, 'dark')).toBe('/coloring/farm/cover.chalk.thumb.webp');
  });
});

describe('pageOverlayImage', () => {
  const cat = BOOKS.find((book) => book.id === 'farm')!.pages.find((p) => p.id === 'cat')!;

  it('uses transparent presentation overlays for both themes', () => {
    expect(pageOverlayImage(cat, 'portrait', 'light')).toBe('/coloring/farm/cat-tall.overlay.svg');
    expect(pageOverlayImage(cat, 'portrait', 'dark')).toBe(
      '/coloring/farm/cat-tall.dark.overlay.svg'
    );
  });

  it('keeps the dark presentation path stable when its generator falls back to pen line art', () => {
    const unforked = { ...cat, chalkImages: {} };
    expect(pageOverlayImage(unforked, 'landscape', 'dark')).toBe(
      '/coloring/farm/cat-wide.dark.overlay.svg'
    );
  });
});

describe('vector overlays', () => {
  it('maps every catalog page, orientation, and theme to its canonical SVG', () => {
    for (const book of BOOKS) {
      for (const page of book.pages) {
        for (const orientation of ['portrait', 'landscape'] as const) {
          const stem = page.images[orientation].slice(0, -'.overlay.svg'.length);
          expect(pageOverlayImage(page, orientation, 'light')).toBe(`${stem}.overlay.svg`);
          expect(pageOverlayImage(page, orientation, 'dark')).toBe(`${stem}.dark.overlay.svg`);
        }
      }
    }
  });

  it('resolves a canonical SVG through an installed native book root', () => {
    const owl = BOOKS.find((book) => book.id === 'creatures')!.pages.find(
      (page) => page.id === 'owl'
    )!;
    setLocalColoringBookRoot('creatures', 'https://localhost/_capacitor_file_/packs/creatures/');
    try {
      expect(pageOverlayImage(owl, 'portrait', 'dark')).toBe(
        'https://localhost/_capacitor_file_/packs/creatures/owl-tall.dark.overlay.svg'
      );
    } finally {
      clearLocalColoringBookRoots();
    }
  });
});

describe('responsive image sources', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;

  it('gives light and dark cover thumbnails responsive candidates', () => {
    expect(coverThumbImageSource(farm, 'light')).toEqual({
      src: '/coloring/farm/cover.thumb.webp',
      srcset:
        '/coloring/max-240px/farm/cover.thumb.webp 240w, /coloring/farm/cover.thumb.webp 400w',
    });
    expect(coverThumbImageSource(farm, 'dark')).toEqual({
      src: '/coloring/farm/cover.chalk.thumb.webp',
      srcset:
        '/coloring/max-240px/farm/cover.chalk.thumb.webp 240w, /coloring/farm/cover.chalk.thumb.webp 400w',
    });
  });

  it('keeps picker sizes aligned with the modal grid geometry', () => {
    for (const ownedCssValue of [
      'max-width: min(920px, calc(100vw - 32px))',
      '--book-grid-max-width: 856px',
      '--book-cols: 4',
      '@media (max-width: 520px)',
    ]) {
      expect(coloringBookComponent).toContain(ownedCssValue);
    }
    expect(coloringBookGridLayout(8)).toEqual({
      hasOrphan: false,
      imageSizes: COLORING_IMAGE_SIZES.coverThumbnail.standard,
    });
    expect(coloringBookGridLayout(13)).toEqual({
      hasOrphan: true,
      imageSizes: COLORING_IMAGE_SIZES.coverThumbnail.orphan,
    });
    expect(COLORING_IMAGE_SIZES.coverThumbnail.standard).toContain('(90vw - 100px) / 4');
    expect(COLORING_IMAGE_SIZES.coverThumbnail.orphan).toContain('(90vw - 88px) / 3');
    expect(coloringBookComponent).toContain('pageOverlayImage(page, orientation, resolvedTheme())');
    expect(activePageChipComponent).not.toContain('srcset=');
    expect(activePageChipComponent).not.toContain('sizes=');
  });

  // The `sizes` hint's leading clause and the CSS that changes the grid under it
  // are one decision written twice — a media query can't read the constant — and
  // a hint that disagrees with the layout hands the browser the wrong candidate
  // at exactly the widths the CSS moved. Both are derived from the shipped hint
  // rather than restated, the dialogTabletScaling.test.ts pattern.
  it('gates the tall cover grid and its size hint on the same condition', () => {
    const [tallClause] = COLORING_IMAGE_SIZES.coverThumbnail.standard.split(', ');
    const tallCondition = tallClause.slice(0, tallClause.lastIndexOf(' '));
    expect(coloringBookComponent).toContain(`@media ${tallCondition} {`);

    // The width floor the tall layout shares with the four-column layout it
    // replaces, and the complement one pixel below it that the phone columns
    // take — a gap between them leaves a band of widths with no rule.
    const floorPx = Number(/min-width: (\d+)px/.exec(tallCondition)?.[1]);
    expect(floorPx).toBeGreaterThan(0);
    expect(coloringBookComponent).toContain(`@media (min-width: ${floorPx}px) {`);
    expect(coloringBookComponent).toContain(`@media (max-width: ${floorPx - 1}px) {`);
  });
});

describe('pageCompositionKey', () => {
  it('groups every generated sibling for one page without hardcoded variants', () => {
    const siblings = [
      '/coloring/farm/cat-tall.light.webp',
      '/coloring/farm/cat-tall.night.webp',
      '/coloring/farm/cat-tall.overlay.svg',
      '/coloring/farm/cat-tall.dark.overlay.svg?version=1',
    ];

    expect(new Set(siblings.map(pageCompositionKey))).toEqual(new Set(['/coloring/farm/cat-tall']));
  });
});

describe('bookAssetPaths', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;

  it('keeps every catalog asset inside its enclosing book directory', () => {
    for (const book of BOOKS) {
      for (const path of bookAssetPaths(book)) {
        expect(path).toMatch(new RegExp(`^/coloring/(?:max-(?:1152|240)px/)?${book.id}/`));
      }
    }
  });

  it('lists the cover, both orientations of every page, and the colored fills', () => {
    const paths = bookAssetPaths(farm);
    expect(paths).toContain(farm.cover);
    expect(paths).toContain(farm.chalkCover);
    expect(paths).toContain(coverThumb(farm, 'light'));
    expect(paths).toContain(coverThumb(farm, 'dark'));
    for (const page of farm.pages) {
      expect(paths).toContain(pageImage(page, 'portrait'));
      expect(paths).toContain(pageImage(page, 'landscape'));
      expect(paths).toContain(pageColorImage(page, 'portrait'));
      expect(paths).toContain(pageColorImage(page, 'landscape'));
    }
  });

  it('lists thumbnails only for the light and dark covers', () => {
    const paths = bookAssetPaths(farm);
    const thumbnails = paths.filter(
      (path) => path.endsWith('.thumb.webp') && !path.startsWith('/coloring/max-')
    );
    expect(thumbnails).toEqual([coverThumb(farm, 'light'), coverThumb(farm, 'dark')]);
  });

  it('lists light and dark presentation overlays for every page orientation', () => {
    const paths = bookAssetPaths(farm);
    for (const page of farm.pages) {
      for (const orientation of ['portrait', 'landscape'] as const) {
        expect(paths).toContain(pageOverlayImage(page, orientation, 'light'));
        expect(paths).toContain(pageOverlayImage(page, orientation, 'dark'));
      }
    }
  });

  it('does not thumbnail page art or colored fills', () => {
    const paths = bookAssetPaths(farm);
    const canonicalPaths = paths.filter((path) => !path.startsWith('/coloring/max-'));
    expect(canonicalPaths.filter((path) => path.endsWith('.thumb.webp'))).toHaveLength(2);
    expect(
      canonicalPaths.some((path) => /\/(?:cat|cow|dog|duck|horse|pig)-.+\.thumb\.webp$/.test(path))
    ).toBe(false);
  });

  it('lists every generated responsive candidate', () => {
    const paths = new Set(bookAssetPaths(farm));
    const responsive = responsiveColoringAssets(farm);
    expect(responsive).toHaveLength(26);
    for (const asset of responsive) expect(paths.has(asset.target), asset.target).toBe(true);
    for (const canonical of bookPackAssetPaths(farm)) {
      if (canonical.endsWith('.svg')) continue;
      expect(
        responsive.some((asset) => asset.source === canonical),
        canonical
      ).toBe(true);
    }
  });
});

describe('downloadable coloring packs', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;
  const dinosaur = BOOKS.find((book) => book.id === 'dinosaur')!;

  it('contains exactly the canonical runtime files for one complete book', () => {
    const paths = bookPackAssetPaths(farm);
    expect(paths).toHaveLength(50);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith('/coloring/farm/'))).toBe(true);
    expect(paths.some((path) => /\.(?:outline|chalk)\.webp$/.test(path))).toBe(false);
    expect(paths.some((path) => path.includes('/max-'))).toBe(false);
  });

  it('redirects every runtime URL to a native book root after installation', () => {
    setLocalColoringBookRoot('dinosaur', 'https://localhost/_capacitor_file_/packs/dinosaur/');
    try {
      const page = dinosaur.pages[0];
      expect(pageOverlayImage(page, 'portrait', 'light')).toBe(
        'https://localhost/_capacitor_file_/packs/dinosaur/brachiosaurus-tall.overlay.svg'
      );
      expect(coverThumbImageSource(dinosaur, 'light').src).toBe(
        'https://localhost/_capacitor_file_/packs/dinosaur/cover.thumb.webp'
      );
    } finally {
      clearLocalColoringBookRoots();
    }
  });
});
