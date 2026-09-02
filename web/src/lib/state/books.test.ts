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
  pageSelectorImage,
  pageSelectorImageSource,
  responsiveColoringAssets,
  responsiveSelectorColoringAssets,
  selectorColoringAssets,
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
const tokensCss = readFileSync(new URL('../../tokens.css', import.meta.url), 'utf8');

function spacingTokenPx(token: string): number {
  const value = new RegExp(`--${token}: (\\d+)px`).exec(tokensCss)?.[1];
  expect(value, token).toBeDefined();
  return Number(value);
}

describe('page defaults', () => {
  it('every page ships night fills and dark overlays for both orientations', () => {
    for (const book of BOOKS) {
      for (const page of book.pages) {
        expect(Object.keys(page.nightImages).sort()).toEqual(['landscape', 'portrait']);
        expect(Object.keys(page.darkImages).sort()).toEqual(['landscape', 'portrait']);
      }
    }
  });
});

describe('coverThumb', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;

  it('uses the matching light or dark cover source', () => {
    expect(farm.cover).toBe('/coloring/farm/cover.overlay.svg');
    expect(farm.darkCover).toBe('/coloring/farm/cover.dark.overlay.svg');
    expect(coverThumb(farm, 'light')).toBe('/coloring/farm/cover.thumb.webp');
    expect(coverThumb(farm, 'dark')).toBe('/coloring/farm/cover.chalk.thumb.webp');
  });

  it('rejects a theme/suffix mismatch instead of inventing a thumbnail path', () => {
    expect(() => coverThumb({ ...farm, cover: farm.darkCover }, 'light')).toThrow(
      'must end with .overlay.svg'
    );
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
});

describe('pageSelectorImage', () => {
  const cat = BOOKS.find((book) => book.id === 'farm')!.pages.find((p) => p.id === 'cat')!;

  it('uses theme-specific raster presentation derivatives', () => {
    expect(pageSelectorImage(cat, 'portrait', 'light')).toBe(
      '/coloring/farm/cat-tall.selector.webp'
    );
    expect(pageSelectorImage(cat, 'portrait', 'dark')).toBe(
      '/coloring/farm/cat-tall.dark.selector.webp'
    );
  });

  it('resolves through an installed native book root', () => {
    setLocalColoringBookRoot('farm', 'https://localhost/_capacitor_file_/packs/farm/');
    try {
      expect(pageSelectorImage(cat, 'landscape', 'dark')).toBe(
        'https://localhost/_capacitor_file_/packs/farm/cat-wide.dark.selector.webp'
      );
    } finally {
      clearLocalColoringBookRoots();
    }
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

  it('gives page selectors 240 and 400 pixel responsive candidates', () => {
    const cat = farm.pages.find((page) => page.id === 'cat')!;
    expect(pageSelectorImageSource(cat, 'portrait', 'light')).toEqual({
      src: '/coloring/farm/cat-tall.selector.webp',
      srcset:
        '/coloring/max-240px/farm/cat-tall.selector.webp 160w, /coloring/farm/cat-tall.selector.webp 267w',
    });
    expect(pageSelectorImageSource(cat, 'landscape', 'dark')).toEqual({
      src: '/coloring/farm/cat-wide.dark.selector.webp',
      srcset:
        '/coloring/max-240px/farm/cat-wide.dark.selector.webp 240w, /coloring/farm/cat-wide.dark.selector.webp 400w',
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
    for (const ownedCssValue of [
      '.coloring-pages-grid {',
      '--page-cols: 2',
      '.coloring-pages-grid.portrait-pages {',
      '--page-cols: 3',
      'gap: var(--space-3)',
      'padding: var(--space-7)',
      'gap: var(--space-2)',
      'padding: var(--space-6) var(--space-4)',
    ]) {
      expect(coloringBookComponent).toContain(ownedCssValue);
    }
    const narrowChromePx = 2 * spacingTokenPx('space-4') + spacingTokenPx('space-2');
    const scrollbarReservePx = spacingTokenPx('space-4');
    const widePortraitChromePx =
      2 * spacingTokenPx('space-7') + 2 * spacingTokenPx('space-3') + scrollbarReservePx;
    const wideLandscapeChromePx =
      2 * spacingTokenPx('space-7') + spacingTokenPx('space-3') + scrollbarReservePx;
    expect(COLORING_IMAGE_SIZES.pageSelector.portrait).toBe(
      `(max-width: 520px) calc((90vw - ${narrowChromePx}px) / 2), min(calc((90vw - ${widePortraitChromePx}px) / 3), 272px)`
    );
    expect(COLORING_IMAGE_SIZES.pageSelector.landscape).toBe(
      `(max-width: 520px) calc((90vw - ${narrowChromePx}px) / 2), min(calc((90vw - ${wideLandscapeChromePx}px) / 2), 414px)`
    );
    expect(coloringBookComponent).toContain(
      'pageSelectorImageSource(page, orientation, resolvedTheme())'
    );
    const pickPage = coloringBookComponent.slice(
      coloringBookComponent.indexOf('async function pickPage'),
      coloringBookComponent.indexOf('async function clearAndClose')
    );
    const suppressRetiringTransitionsAt = pickPage.indexOf('retiringAfterPageSelection = true');
    const hideAt = pickPage.indexOf('coloringBookModal.hide()');
    const applyAt = pickPage.indexOf('applyColoringPageWithMagicUndo');
    expect(suppressRetiringTransitionsAt).toBeGreaterThanOrEqual(0);
    expect(hideAt).toBeGreaterThanOrEqual(0);
    expect(applyAt).toBeGreaterThanOrEqual(0);
    expect(suppressRetiringTransitionsAt).toBeLessThan(hideAt);
    expect(hideAt).toBeLessThan(applyAt);
    expect(coloringBookComponent).toContain('retiringAfterPageSelection = false');
    const retiringRule = coloringBookComponent.slice(
      coloringBookComponent.indexOf('.retiring-after-page-selection .coloring-tile {'),
      coloringBookComponent.indexOf('.coloring-tile img {')
    );
    expect(retiringRule).toContain('transition: none');
    expect(coloringBookComponent).toContain('COLORING_IMAGE_SIZES.pageSelector[orientation]');
    expect(activePageChipComponent).toContain('srcset=');
    expect(activePageChipComponent).toContain('COLORING_IMAGE_SIZES.activePageChip');
  });

  it('uses danger colors for active-page press feedback', () => {
    const activeRule = activePageChipComponent.slice(
      activePageChipComponent.indexOf('.active-page-chip:active,'),
      activePageChipComponent.indexOf('@media (max-width: 360px)')
    );
    expect(activeRule).toContain('background: var(--danger-wash)');
    expect(activeRule).toContain('border-color: var(--danger-text)');
    expect(activeRule).toContain('background: var(--danger-text)');
    expect(activeRule).toContain('fill: var(--surface)');
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
      '/coloring/farm/cat-tall.selector.webp',
      '/coloring/farm/cat-tall.dark.selector.webp',
    ];

    expect(new Set(siblings.map(pageCompositionKey))).toEqual(new Set(['/coloring/farm/cat-tall']));
  });
});

describe('bookAssetPaths', () => {
  const farm = BOOKS.find((book) => book.id === 'farm')!;

  it('keeps every catalog asset inside its enclosing book directory', () => {
    for (const book of BOOKS) {
      for (const path of bookAssetPaths(book)) {
        expect(path).toMatch(new RegExp(`^/coloring/(?:max-(?:1152|240|96)px/)?${book.id}/`));
      }
    }
  });

  it('lists the cover, both orientations of every page, and the colored fills', () => {
    const paths = bookAssetPaths(farm);
    expect(paths).toContain(farm.cover);
    expect(paths).toContain(farm.darkCover);
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
        expect(paths).toContain(pageSelectorImage(page, orientation, 'light'));
        expect(paths).toContain(pageSelectorImage(page, orientation, 'dark'));
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
      if (canonical.endsWith('.svg') || canonical.endsWith('.selector.webp')) {
        continue;
      }
      expect(
        responsive.some((asset) => asset.source === canonical),
        canonical
      ).toBe(true);
    }
  });

  it('lists every generated page selector derivative', () => {
    const paths = new Set(bookAssetPaths(farm));
    const selectors = selectorColoringAssets(farm);
    expect(selectors).toHaveLength(24);
    for (const asset of selectors) expect(paths.has(asset.target), asset.target).toBe(true);
  });

  it('lists every generated responsive page selector derivative', () => {
    const paths = new Set(bookAssetPaths(farm));
    const selectors = responsiveSelectorColoringAssets(farm);
    expect(selectors).toHaveLength(24);
    for (const asset of selectors) {
      expect(paths.has(asset.target), asset.target).toBe(true);
      expect(asset.target).toContain('/coloring/max-240px/');
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
    expect(paths.some((path) => path.endsWith('.presentation.webp'))).toBe(false);
    expect(paths.filter((path) => path.endsWith('.overlay.svg'))).toHaveLength(24);
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
      expect(pageSelectorImage(page, 'portrait', 'dark')).toBe(
        'https://localhost/_capacitor_file_/packs/dinosaur/brachiosaurus-tall.dark.selector.webp'
      );
    } finally {
      clearLocalColoringBookRoots();
    }
  });
});
