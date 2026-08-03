// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BOOKS,
  COLORING_IMAGE_SIZES,
  bookAssetPaths,
  chalkThumbPath,
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

const coloringBookComponent = readFileSync(
  new URL('../components/ColoringBook.svelte', import.meta.url),
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
    expect(coverThumbImageSource(farm)).toEqual({
      src: '/coloring/farm/cover.thumb.webp',
      srcset:
        '/coloring/max-240px/farm/cover.thumb.webp 240w, /coloring/farm/cover.thumb.webp 400w',
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
      '--book-grid-roomy-max-width: 639px',
      '@media (max-width: 740px)',
      '@media (max-width: 520px)',
    ]) {
      expect(coloringBookComponent).toContain(ownedCssValue);
    }
    expect(COLORING_IMAGE_SIZES.coverThumbnail.withoutClear).toContain('(90vw - 100px) / 4');
    expect(COLORING_IMAGE_SIZES.coverThumbnail.withClear).toContain('205px');
    expect(COLORING_IMAGE_SIZES.pageThumbnail.portrait).toContain('(90vw - 88px) / 3');
    expect(COLORING_IMAGE_SIZES.pageThumbnail.landscape).toContain('(90vw - 76px) / 2');
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
    // Exactly the line art gets a thumb: pen (cover + 2 orientations/page) and
    // chalk (2 orientations/page — no cover chalk yet).
    const canonicalPaths = paths.filter((path) => !path.startsWith('/coloring/max-'));
    const penThumbs = canonicalPaths.filter(
      (p) => p.endsWith('.thumb.webp') && !p.endsWith('.chalk.thumb.webp')
    );
    const chalkThumbs = canonicalPaths.filter((p) => p.endsWith('.chalk.thumb.webp'));
    expect(penThumbs.length).toBe(1 + farm.pages.length * 2);
    expect(chalkThumbs.length).toBe(farm.pages.length * 2);
  });

  it('lists every generated responsive candidate', () => {
    const paths = new Set(bookAssetPaths(farm));
    const responsive = responsiveColoringAssets(farm);
    expect(responsive).toHaveLength(49);
    for (const asset of responsive) expect(paths.has(asset.target), asset.target).toBe(true);
  });
});
