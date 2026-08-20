// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOOKS,
  COLORING_IMAGE_SIZES,
  bookAssetPaths,
  bookPackAssetPaths,
  chalkThumbPath,
  coloringBookGridLayout,
  coloringOverlayImageSize,
  coverThumb,
  coverThumbImageSource,
  pageColorImage,
  pageCompositionKey,
  pageImage,
  pageOverlayImage,
  pageOverlayImageSource,
  pageThumb,
  pageThumbImageSource,
  responsiveColoringAssets,
  thumbPath,
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

describe('thumbPath', () => {
  it('swaps the .outline variant suffix for .thumb', () => {
    expect(thumbPath('/coloring/farm/cover.outline.webp')).toBe('/coloring/farm/cover.thumb.webp');
    expect(thumbPath('/coloring/farm/cat-tall.outline.webp')).toBe(
      '/coloring/farm/cat-tall.thumb.webp'
    );
  });
});

describe('chalkThumbPath', () => {
  it('swaps the .chalk variant suffix for .chalk.thumb', () => {
    expect(chalkThumbPath('/coloring/farm/cat-tall.chalk.webp')).toBe(
      '/coloring/farm/cat-tall.chalk.thumb.webp'
    );
  });
});

describe('pageThumb', () => {
  const cat = BOOKS.find((book) => book.id === 'farm')!.pages.find((p) => p.id === 'cat')!;

  it('light mode shows the pen thumbnail', () => {
    expect(pageThumb(cat, 'portrait', 'light')).toBe('/coloring/farm/cat-tall.thumb.webp');
  });

  it('dark mode shows the chalk thumbnail where the orientation has a chalk', () => {
    expect(pageThumb(cat, 'portrait', 'dark')).toBe('/coloring/farm/cat-tall.chalk.thumb.webp');
    expect(pageThumb(cat, 'landscape', 'dark')).toBe('/coloring/farm/cat-wide.chalk.thumb.webp');
  });

  it('dark mode falls back to the pen thumbnail for un-forked orientations', () => {
    const unforked = { ...cat, chalkImages: {} };
    expect(pageThumb(unforked, 'portrait', 'dark')).toBe('/coloring/farm/cat-tall.thumb.webp');
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
    expect(pageOverlayImage(cat, 'portrait', 'light')).toBe('/coloring/farm/cat-tall.overlay.webp');
    expect(pageOverlayImage(cat, 'portrait', 'dark')).toBe(
      '/coloring/farm/cat-tall.dark.overlay.webp'
    );
  });

  it('keeps the dark presentation path stable when its generator falls back to pen line art', () => {
    const unforked = { ...cat, chalkImages: {} };
    expect(pageOverlayImage(unforked, 'landscape', 'dark')).toBe(
      '/coloring/farm/cat-wide.dark.overlay.webp'
    );
  });
});

describe('vector overlay slice', () => {
  const circle = BOOKS.find((book) => book.id === 'shapes')!.pages.find(
    (page) => page.id === 'circle'
  )!;
  const owl = BOOKS.find((book) => book.id === 'creatures')!.pages.find(
    (page) => page.id === 'owl'
  )!;

  it('uses invariant SVGs only for the traced orientation and themes', () => {
    expect(pageOverlayImage(circle, 'portrait', 'light')).toBe(
      '/coloring/shapes/circle-tall.overlay.svg'
    );
    expect(pageOverlayImage(circle, 'portrait', 'dark')).toBe(
      '/coloring/shapes/circle-tall.dark.overlay.webp'
    );
    expect(pageOverlayImage(owl, 'portrait', 'light')).toBe(
      '/coloring/creatures/owl-tall.overlay.svg'
    );
    expect(pageOverlayImage(owl, 'portrait', 'dark')).toBe(
      '/coloring/creatures/owl-tall.dark.overlay.svg'
    );
    expect(pageOverlayImage(owl, 'landscape', 'light')).toBe(
      '/coloring/creatures/owl-wide.overlay.webp'
    );
  });

  it('offers no redundant responsive candidate for an invariant SVG', () => {
    expect(pageOverlayImageSource(owl, 'portrait', 'dark')).toEqual({
      src: '/coloring/creatures/owl-tall.dark.overlay.svg',
      srcset: '/coloring/creatures/owl-tall.dark.overlay.svg',
    });
  });

  it('resolves both invariant SVG source fields through an installed native book root', () => {
    setLocalColoringBookRoot('creatures', 'https://localhost/_capacitor_file_/packs/creatures/');
    try {
      expect(pageOverlayImageSource(owl, 'portrait', 'dark')).toEqual({
        src: 'https://localhost/_capacitor_file_/packs/creatures/owl-tall.dark.overlay.svg',
        srcset: 'https://localhost/_capacitor_file_/packs/creatures/owl-tall.dark.overlay.svg',
      });
    } finally {
      clearLocalColoringBookRoots();
    }
  });
});

describe('responsive image sources', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;
  const cat = farm.pages.find((page) => page.id === 'cat')!;

  it('keeps max-edge tiers in directories while width descriptors use intrinsic width', () => {
    expect(pageOverlayImageSource(cat, 'portrait', 'light')).toEqual({
      src: '/coloring/farm/cat-tall.overlay.webp',
      srcset:
        '/coloring/max-1152px/farm/cat-tall.overlay.webp 768w, /coloring/farm/cat-tall.overlay.webp 1024w',
    });
    expect(pageOverlayImageSource(cat, 'landscape', 'dark')).toEqual({
      src: '/coloring/farm/cat-wide.dark.overlay.webp',
      srcset:
        '/coloring/max-1152px/farm/cat-wide.dark.overlay.webp 1152w, /coloring/farm/cat-wide.dark.overlay.webp 1536w',
    });
  });

  it('gives cover, pen, and chalk thumbnails responsive candidates', () => {
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
    expect(pageThumbImageSource(cat, 'portrait', 'light').srcset).toContain(
      '/coloring/max-240px/farm/cat-tall.thumb.webp 160w'
    );
    expect(pageThumbImageSource(cat, 'portrait', 'dark').srcset).toContain(
      '/coloring/max-240px/farm/cat-tall.chalk.thumb.webp 160w'
    );
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
    expect(COLORING_IMAGE_SIZES.pageThumbnail.portrait).toContain('(90vw - 88px) / 3');
    expect(COLORING_IMAGE_SIZES.pageThumbnail.landscape).toContain('(90vw - 76px) / 2');
    expect(activePageChipComponent).toContain(
      `--active-page-thumbnail-size: ${COLORING_IMAGE_SIZES.activePageThumbnail}`
    );
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

  it('uses the adopted paper width for overlay selection', () => {
    expect(coloringOverlayImageSize(390)).toBe('390px');
    expect(coloringOverlayImageSize(0)).toBe(COLORING_IMAGE_SIZES.overlay);
  });
});

describe('pageCompositionKey', () => {
  it('groups every generated sibling for one page without hardcoded variants', () => {
    const siblings = [
      '/coloring/farm/cat-tall.outline.webp',
      '/coloring/farm/cat-tall.light.webp',
      '/coloring/farm/cat-tall.night.webp',
      '/coloring/farm/cat-tall.chalk.webp',
      '/coloring/farm/cat-tall.thumb.webp',
      '/coloring/farm/cat-tall.chalk.thumb.webp',
      '/coloring/farm/cat-tall.overlay.webp',
      '/coloring/farm/cat-tall.dark.overlay.webp?version=1',
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
    expect(paths).toContain(chalkThumbPath(farm.chalkCover));
    for (const page of farm.pages) {
      expect(paths).toContain(pageImage(page, 'portrait'));
      expect(paths).toContain(pageImage(page, 'landscape'));
      expect(paths).toContain(pageColorImage(page, 'portrait'));
      expect(paths).toContain(pageColorImage(page, 'landscape'));
    }
  });

  it('gives every picker-facing line-art image a thumbnail sibling', () => {
    const paths = bookAssetPaths(farm);
    const lineArt = [
      farm.cover,
      ...farm.pages.flatMap((page) => [pageImage(page, 'portrait'), pageImage(page, 'landscape')]),
    ];
    for (const src of lineArt) {
      expect(paths).toContain(thumbPath(src));
    }
  });

  it('gives every chalk outline a thumbnail sibling (the dark-mode picker tile)', () => {
    const paths = bookAssetPaths(farm);
    for (const page of farm.pages) {
      for (const chalk of Object.values(page.chalkImages)) {
        expect(paths).toContain(chalkThumbPath(chalk));
      }
    }
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

  it('does not thumbnail the colored fills (they never appear in the grid)', () => {
    const paths = bookAssetPaths(farm);
    // thumbPath derives only from `.outline.webp` line art — a fill path is a no-op.
    for (const page of farm.pages) {
      expect(thumbPath(pageColorImage(page, 'portrait'))).toBe(pageColorImage(page, 'portrait'));
    }
    // Exactly the line art gets a thumb: pen and chalk each cover the book tile
    // plus both orientations of every page.
    const canonicalPaths = paths.filter((path) => !path.startsWith('/coloring/max-'));
    const penThumbs = canonicalPaths.filter(
      (p) => p.endsWith('.thumb.webp') && !p.endsWith('.chalk.thumb.webp')
    );
    const chalkThumbs = canonicalPaths.filter((p) => p.endsWith('.chalk.thumb.webp'));
    expect(penThumbs.length).toBe(1 + farm.pages.length * 2);
    expect(chalkThumbs.length).toBe(1 + farm.pages.length * 2);
  });

  it('lists every generated responsive candidate', () => {
    const paths = new Set(bookAssetPaths(farm));
    const responsive = responsiveColoringAssets(farm);
    expect(responsive).toHaveLength(74);
    for (const asset of responsive) expect(paths.has(asset.target), asset.target).toBe(true);
    for (const canonical of bookPackAssetPaths(farm)) {
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
    expect(paths).toHaveLength(74);
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
        'https://localhost/_capacitor_file_/packs/dinosaur/brachiosaurus-tall.overlay.webp'
      );
      expect(coverThumbImageSource(dinosaur, 'light').src).toBe(
        'https://localhost/_capacitor_file_/packs/dinosaur/cover.thumb.webp'
      );
    } finally {
      clearLocalColoringBookRoots();
    }
  });
});
