// Coloring-book catalog - the single source of truth for which books exist and
// where each one is allowed to ship. This file is intentionally rune-free (and
// is not a `.svelte.ts` module) so it can be imported both by the app and by
// Node build scripts (see tools/mobile/strip-static-assets.mjs).
//
// Image storage format:
//   static/coloring/{book}/cover.outline.webp         cover line art, 1:1
//   static/coloring/{book}/cover.chalk.webp           cover CHALK line art (dark mode)
//   static/coloring/{book}/{page}-tall.outline.webp   portrait PEN outline, 2:3
//   static/coloring/{book}/{page}-wide.outline.webp   landscape PEN outline, 3:2
//   static/coloring/{book}/{page}-tall.chalk.webp     portrait CHALK outline (dark mode)
//   static/coloring/{book}/{page}-wide.chalk.webp     landscape CHALK outline (dark mode)
//   static/coloring/{book}/{page}-tall.overlay.webp   transparent black light-mode overlay
//   static/coloring/{book}/{page}-wide.overlay.webp   transparent black light-mode overlay
//   static/coloring/{book}/{page}-tall.dark.overlay.webp transparent white dark-mode overlay
//   static/coloring/{book}/{page}-wide.dark.overlay.webp transparent white dark-mode overlay
//   static/coloring/{book}/{page}-tall.overlay.svg      traced invariant light overlay where enabled
//   static/coloring/{book}/{page}-tall.dark.overlay.svg traced invariant dark overlay where enabled
//   static/coloring/{book}/{name}.thumb.webp          grid thumbnail of the pen line art
//   static/coloring/{book}/{name}.chalk.thumb.webp    grid thumbnail of the chalk (dark mode)
//   static/coloring/{book}/{page}-tall.light.webp     portrait colored fill
//   static/coloring/{book}/{page}-wide.light.webp     landscape colored fill
//   static/coloring/{book}/{page}-tall.night.webp     portrait night fill (dark mode)
//   static/coloring/{book}/{page}-wide.night.webp     landscape night fill (dark mode)
//   static/coloring/max-{edge}px/{book}/{name}.{variant}.webp web-responsive derivatives
//
// The PEN outline (black ink on white) is the light-mode overlay and the source
// every other asset derives from. The CHALK outline is the dark-mode overlay —
// an AI redraw of the pen as a chalk drawing whose deliberate solid whites
// (eye sclera, catchlights) survive into the night render. It ships INK-ON-WHITE
// (the negation of what dark mode shows). The picker applies invert + screen;
// gen-overlays derives the transparent white full-page presentation.
// Orientations without a chalk derive their dark overlay from the pen instead.
//
// Each picker-facing line-art image (cover + pages, pen AND chalk) has a
// thumbnail sibling (tools/asset-gen/coloring/gen-thumbnails.mjs).
// `thumbPath()` maps a pen outline to its `.thumb.webp`, `chalkThumbPath()` a
// chalk to its `.chalk.thumb.webp`, and `pageThumb()` picks per theme — dark
// mode shows the chalk thumb so each tile previews the same line-art treatment
// the selected page applies.
// The colored `.light.webp` fill is a flat-colored, pixel-aligned
// version of the line-art page (tools/asset-gen/coloring/gen-light-fills.mjs) that the magic
// brush reveals where the child paints (ADR-0043); it never appears in the grid,
// so it has no thumbnail. `bookAssetPaths()` lists them all so check-assets
// validates them, generates the verified pack manifest, and strips native assets
// from the correct distribution boundary. The compact responsive inventory is
// also the smaller pack variant downloaded by compact web and native screens.
// Thumbnails: ADR-0045; packs: ADR-0103.
//
// `platforms` controls distribution per book:
//   ['web']            -> web only          (hidden + assets stripped on native)
//   ['mobile']         -> native only       (hidden on web)
//   ['web', 'mobile']  -> ships everywhere  ("both")

import type { Orientation } from '../platform';
import type { ResolvedTheme } from '../theme';
import { resolveColoringAssetUrl } from '../coloringPacks/assetResolver.ts';

// Distribution platforms a book may ship on - distinct from the runtime
// platform in $lib/platform (which also has 'ios'/'android').
export type BookPlatform = 'web' | 'mobile';
export type BookOrientation = Orientation;

export interface ResponsiveColoringImage {
  src: string;
  srcset: string;
}

export interface ResponsiveColoringAsset {
  source: string;
  target: string;
  maxEdgePx: number;
  widthPx: number;
  encoding: 'fill' | 'overlay' | 'thumbnail';
}

interface ColoringBookGridLayout {
  hasOrphan: boolean;
  imageSizes: string;
}

export interface ColoringPage {
  id: string;
  name: string;
  images: Record<BookOrientation, string>;
  /** Flat-colored fill per orientation, revealed by the magic brush (ADR-0043). */
  colorImages: Record<BookOrientation, string>;
  /** Pre-colored "night" fill per orientation — the dark-mode magic-brush reveal
      (ADR-0052 direction B). Only present for orientations whose night asset has
      been generated; dark mode falls back to the light fill where it's absent. */
  nightImages: Partial<Record<BookOrientation, string>>;
  /** Chalk outline per orientation — the dedicated dark-mode line art, shipped
      ink-on-white so the dark --lineart-* treatment renders it unchanged. Only
      present for orientations whose chalk has been generated; dark mode falls
      back to inverting the pen outline (`images`) where it's absent. */
  chalkImages: Partial<Record<BookOrientation, string>>;
  /** Themes whose full-page presentation is the invariant SVG derivative. */
  vectorOverlayThemes: Partial<Record<BookOrientation, ResolvedTheme[]>>;
}

export interface Book {
  id: string;
  name: string;
  platforms: BookPlatform[];
  cover: string;
  chalkCover: string;
  pages: ColoringPage[];
}

const COLORING_ROOT = '/coloring';
const RESPONSIVE_COLORING_TIERS = {
  overlay: {
    directory: 'max-1152px',
    maxEdgePx: 1152,
    widths: {
      portrait: { candidate: 768, source: 1024 },
      landscape: { candidate: 1152, source: 1536 },
    },
  },
  thumbnail: {
    directory: 'max-240px',
    maxEdgePx: 240,
    widths: {
      cover: { candidate: 240, source: 400 },
      portrait: { candidate: 160, source: 267 },
      landscape: { candidate: 240, source: 400 },
    },
  },
} as const;
export const COMPACT_COLORING_PACK_MAX_EDGE_PX = RESPONSIVE_COLORING_TIERS.overlay.maxEdgePx;
export const COMPACT_COLORING_PACK_SHORT_EDGE_PX =
  RESPONSIVE_COLORING_TIERS.overlay.widths.portrait.candidate;
export const RESPONSIVE_COLORING_TIER_DIRECTORIES = Object.values(RESPONSIVE_COLORING_TIERS).map(
  (tier) => `${COLORING_ROOT}/${tier.directory}`
);
const BOOK_GRID_DEFAULT_COLUMNS = 4;
/**
 * A tall viewport drops the cover grid to two columns and caps its width by the
 * dialog's height, so the width-only clauses below all under-report the tile
 * there. The condition has to be the one ColoringBook.svelte's media query
 * takes that layout under, or the browser reads a tile size for a layout the
 * page isn't wearing; books.test.ts holds the two sides together, since a media
 * query can't read this constant.
 */
const TALL_COVER_GRID_MEDIA = '(max-aspect-ratio: 4 / 5) and (min-width: 741px)';
/**
 * Deliberately over-estimates rather than restating the grid's height
 * arithmetic: `sizes` is a hint, and the source covers are 400px with 240w/400w
 * candidates, so rounding up only ever picks the candidate a retina tablet would
 * pick anyway — while rounding down would ship a soft cover.
 */
const TALL_COVER_SIZE = `${TALL_COVER_GRID_MEDIA} 25vh`;
export const COLORING_IMAGE_SIZES = {
  overlay: '100vw',
  activePageThumbnail: '36px',
  coverThumbnail: {
    standard: `${TALL_COVER_SIZE}, (max-width: 520px) calc((90vw - 48px) / 2), (max-width: 740px) calc((90vw - 88px) / 3), (max-width: 1022px) calc((90vw - 100px) / 4), 205px`,
    orphan: `${TALL_COVER_SIZE}, (max-width: 520px) calc((90vw - 48px) / 2), (max-width: 1022px) calc((90vw - 88px) / 3), 277px`,
  },
  pageThumbnail: {
    portrait:
      '(max-width: 520px) calc((90vw - 48px) / 2), (max-width: 1022px) calc((90vw - 88px) / 3), 277px',
    landscape:
      '(max-width: 520px) calc((90vw - 48px) / 2), (max-width: 1022px) calc((90vw - 76px) / 2), 422px',
  },
} as const;

export function coloringBookGridLayout(visibleTileCount: number): ColoringBookGridLayout {
  const hasOrphan = visibleTileCount > 1 && visibleTileCount % BOOK_GRID_DEFAULT_COLUMNS === 1;
  const imageSizes = hasOrphan
    ? COLORING_IMAGE_SIZES.coverThumbnail.orphan
    : COLORING_IMAGE_SIZES.coverThumbnail.standard;
  return { hasOrphan, imageSizes };
}

export function coloringOverlayImageSize(paperCssWidth: number): string {
  return paperCssWidth ? `${paperCssWidth}px` : COLORING_IMAGE_SIZES.overlay;
}
const ORIENTATION_SLUGS: Record<BookOrientation, string> = {
  portrait: 'tall',
  landscape: 'wide',
};
const ASSET_SUFFIXES = {
  outline: '.outline.webp',
  light: '.light.webp',
  night: '.night.webp',
  chalk: '.chalk.webp',
  thumb: '.thumb.webp',
  chalkThumb: '.chalk.thumb.webp',
  overlay: '.overlay.webp',
  darkOverlay: '.dark.overlay.webp',
  vectorOverlay: '.overlay.svg',
  darkVectorOverlay: '.dark.overlay.svg',
} as const;

const PAGE_ASSET_SUFFIX_PATTERN = new RegExp(
  `(?:${Object.values(ASSET_SUFFIXES)
    .sort((a, b) => b.length - a.length)
    .map((suffix) => suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?:[?#].*)?$`
);

const ALL_ORIENTATIONS: BookOrientation[] = ['portrait', 'landscape'];

type PageAssetVariant = 'outline' | 'light' | 'night' | 'chalk';

function pageAssetPath(
  bookId: string,
  pageId: string,
  orientation: BookOrientation,
  variant: PageAssetVariant
): string {
  return `${COLORING_ROOT}/${bookId}/${pageId}-${ORIENTATION_SLUGS[orientation]}${ASSET_SUFFIXES[variant]}`;
}

function optionalPageAssetPaths(
  bookId: string,
  pageId: string,
  exceptions: BookOrientation[],
  variant: Extract<PageAssetVariant, 'night' | 'chalk'>
): Partial<Record<BookOrientation, string>> {
  const paths: Partial<Record<BookOrientation, string>> = {};
  for (const orientation of ALL_ORIENTATIONS) {
    if (!exceptions.includes(orientation)) {
      paths[orientation] = pageAssetPath(bookId, pageId, orientation, variant);
    }
  }
  return paths;
}

function coverPath(
  bookId: string,
  variant: Extract<PageAssetVariant, 'outline' | 'chalk'>
): string {
  return `${COLORING_ROOT}/${bookId}/cover${ASSET_SUFFIXES[variant]}`;
}

function responsiveTierPath(src: string, directory: string): string {
  const coloringPrefix = `${COLORING_ROOT}/`;
  if (!src.startsWith(coloringPrefix)) {
    throw new Error(`Coloring asset path must start with ${coloringPrefix}: ${src}`);
  }
  return `${coloringPrefix}${directory}/${src.slice(coloringPrefix.length)}`;
}

function responsiveImage(
  src: string,
  directory: string,
  candidateWidthPx: number,
  sourceWidthPx: number
): ResponsiveColoringImage {
  return {
    src,
    srcset: `${responsiveTierPath(src, directory)} ${candidateWidthPx}w, ${src} ${sourceWidthPx}w`,
  };
}

interface PageOverrides {
  // Night fills and chalk outlines ship for both orientations unless their derivative is absent.
  nightExcept?: BookOrientation[];
  chalkExcept?: BookOrientation[];
  // Only traced orientation/theme pairs replace their runtime WebP overlay with invariant SVG.
  vectorOverlayThemes?: Partial<Record<BookOrientation, ResolvedTheme[]>>;
}

function book(
  bookId: string,
  name: string,
  platforms: BookPlatform[],
  buildPages: (
    page: (id: string, name: string, overrides?: PageOverrides) => ColoringPage
  ) => ColoringPage[]
): Book {
  function page(
    id: string,
    name: string,
    { nightExcept = [], chalkExcept = [], vectorOverlayThemes = {} }: PageOverrides = {}
  ): ColoringPage {
    return {
      id,
      name,
      images: {
        portrait: pageAssetPath(bookId, id, 'portrait', 'outline'),
        landscape: pageAssetPath(bookId, id, 'landscape', 'outline'),
      },
      colorImages: {
        portrait: pageAssetPath(bookId, id, 'portrait', 'light'),
        landscape: pageAssetPath(bookId, id, 'landscape', 'light'),
      },
      nightImages: optionalPageAssetPaths(bookId, id, nightExcept, 'night'),
      chalkImages: optionalPageAssetPaths(bookId, id, chalkExcept, 'chalk'),
      vectorOverlayThemes,
    };
  }

  return {
    id: bookId,
    name,
    platforms,
    cover: coverPath(bookId, 'outline'),
    chalkCover: coverPath(bookId, 'chalk'),
    pages: buildPages(page),
  };
}

export const BOOKS: Book[] = [
  book('farm', 'Farm', ['web', 'mobile'], (page) => [
    page('cat', 'Cat'),
    page('cow', 'Cow'),
    page('dog', 'Dog'),
    page('duck', 'Duck'),
    page('horse', 'Horse'),
    page('pig', 'Pig'),
  ]),
  book('dinosaur', 'Dinosaurs', ['web', 'mobile'], (page) => [
    page('brachiosaurus', 'Brachiosaurus'),
    page('pterodactyl', 'Pterodactyl'),
    page('stegosaurus', 'Stegosaurus'),
    page('trex', 'T. Rex'),
    page('triceratops', 'Triceratops'),
    page('velociraptor', 'Velociraptor'),
  ]),
  book('creatures', 'Creatures', ['web', 'mobile'], (page) => [
    page('dragon', 'Dragon'),
    page('fairy', 'Fairy'),
    page('mermaid', 'Mermaid'),
    page('owl', 'Owl', { vectorOverlayThemes: { portrait: ['light', 'dark'] } }),
    page('pegasus', 'Pegasus'),
    page('unicorn', 'Unicorn'),
  ]),
  book('nature', 'Nature', ['web', 'mobile'], (page) => [
    page('ant', 'Ant'),
    page('bee', 'Bee'),
    page('caterpillar', 'Caterpillar'),
    page('ladybug', 'Ladybug'),
    page('snail', 'Snail'),
    page('spider', 'Spider'),
  ]),
  book('objects', 'Objects', ['web', 'mobile'], (page) => [
    page('apple', 'Apple'),
    page('balloon', 'Balloon'),
    page('flower', 'Flower'),
    page('house', 'House'),
    page('teddy', 'Teddy'),
    page('umbrella', 'Umbrella'),
  ]),
  book('shapes', 'Shapes', ['web', 'mobile'], (page) => [
    page('circle', 'Circle', { vectorOverlayThemes: { portrait: ['light'] } }),
    page('heart', 'Heart'),
    page('rectangle', 'Rectangle'),
    page('square', 'Square'),
    page('star', 'Star'),
    page('triangle', 'Triangle'),
  ]),
  book('space', 'Space', ['web', 'mobile'], (page) => [
    page('astronaut', 'Astronaut'),
    page('meteor', 'Meteor'),
    page('moon', 'Moon'),
    page('rover', 'Rover'),
    page('ship', 'Ship'),
    page('station', 'Station'),
  ]),
  book('vehicles', 'Vehicles', ['web', 'mobile'], (page) => [
    page('excavator', 'Excavator'),
    page('fire', 'Fire Truck'),
    page('garbage', 'Garbage Truck'),
    page('monster', 'Monster Truck'),
    page('police', 'Police Car'),
    page('train', 'Train'),
  ]),
];

export const STARTER_COLORING_BOOK_ID = 'farm';

/** Books allowed on the given platform ('web' | 'mobile'). */
export function booksForPlatform(platform: BookPlatform): Book[] {
  return BOOKS.filter((book) => book.platforms.includes(platform));
}

export function pageImage(page: ColoringPage, orientation: BookOrientation): string {
  return page.images[orientation];
}

export function pageCompositionKey(url: string): string {
  return url.replace(PAGE_ASSET_SUFFIX_PATTERN, '');
}

export function pageColorImage(page: ColoringPage, orientation: BookOrientation): string {
  return resolveColoringAssetUrl(page.colorImages[orientation]);
}

/** Night fill path for the orientation, or null when none is generated yet. */
export function pageNightImage(page: ColoringPage, orientation: BookOrientation): string | null {
  const path = page.nightImages[orientation];
  return path ? resolveColoringAssetUrl(path) : null;
}

/** Chalk-outline path for the orientation, or null when none is generated yet
    (dark mode then falls back to inverting the pen outline). */
export function pageChalkImage(page: ColoringPage, orientation: BookOrientation): string | null {
  return page.chalkImages[orientation] ?? null;
}

function pageOverlayAssetPath(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  const source = pageImage(page, orientation);
  const vector = page.vectorOverlayThemes[orientation]?.includes(theme) ?? false;
  const suffix = vector
    ? theme === 'dark'
      ? ASSET_SUFFIXES.darkVectorOverlay
      : ASSET_SUFFIXES.vectorOverlay
    : theme === 'dark'
      ? ASSET_SUFFIXES.darkOverlay
      : ASSET_SUFFIXES.overlay;
  return source.slice(0, -ASSET_SUFFIXES.outline.length) + suffix;
}

export function pageOverlayImage(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  return resolveColoringAssetUrl(pageOverlayAssetPath(page, orientation, theme));
}

export function pageOverlayImageSource(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): ResponsiveColoringImage {
  const source = pageOverlayAssetPath(page, orientation, theme);
  if (source.endsWith('.svg')) {
    const url = resolveColoringAssetUrl(source);
    return { src: url, srcset: url };
  }
  const tier = RESPONSIVE_COLORING_TIERS.overlay;
  const widths = tier.widths[orientation];
  const image = responsiveImage(source, tier.directory, widths.candidate, widths.source);
  return { ...image, src: resolveColoringAssetUrl(source) };
}

/** Grid-thumbnail path for a picker-facing line-art image (`x.outline.webp` -> `x.thumb.webp`). */
export function thumbPath(src: string): string {
  return src.endsWith(ASSET_SUFFIXES.outline)
    ? `${src.slice(0, -ASSET_SUFFIXES.outline.length)}${ASSET_SUFFIXES.thumb}`
    : src;
}

/** Grid-thumbnail path for a chalk outline (`x.chalk.webp` -> `x.chalk.thumb.webp`). */
export function chalkThumbPath(src: string): string {
  return src.endsWith(ASSET_SUFFIXES.chalk)
    ? `${src.slice(0, -ASSET_SUFFIXES.chalk.length)}${ASSET_SUFFIXES.chalkThumb}`
    : src;
}

/** Picker-tile thumbnail for a page, theme-aware: dark mode shows the CHALK
    thumbnail where the orientation has a chalk (stored ink-on-white like every
    source line-art asset — the tile's --lineart-filter invert + screen renders
    it as white chalk), falling back to the inverted pen thumbnail for un-forked
    pages. */
export function pageThumb(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  const chalk = theme === 'dark' ? page.chalkImages[orientation] : undefined;
  return chalk ? chalkThumbPath(chalk) : thumbPath(page.images[orientation]);
}

export function coverThumb(book: Book, theme: ResolvedTheme): string {
  return theme === 'dark' ? chalkThumbPath(book.chalkCover) : thumbPath(book.cover);
}

export function coverThumbImageSource(book: Book, theme: ResolvedTheme): ResponsiveColoringImage {
  const source = coverThumb(book, theme);
  const tier = RESPONSIVE_COLORING_TIERS.thumbnail;
  const widths = tier.widths.cover;
  const image = responsiveImage(source, tier.directory, widths.candidate, widths.source);
  return { ...image, src: resolveColoringAssetUrl(source) };
}

export function pageThumbImageSource(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): ResponsiveColoringImage {
  const source = pageThumb(page, orientation, theme);
  const tier = RESPONSIVE_COLORING_TIERS.thumbnail;
  const widths = tier.widths[orientation];
  const image = responsiveImage(source, tier.directory, widths.candidate, widths.source);
  return { ...image, src: resolveColoringAssetUrl(source) };
}

export function responsiveColoringAssets(book: Book): ResponsiveColoringAsset[] {
  const overlayTier = RESPONSIVE_COLORING_TIERS.overlay;
  const thumbnailTier = RESPONSIVE_COLORING_TIERS.thumbnail;
  const overlayAssets = book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.flatMap((orientation) => {
      const widths = overlayTier.widths[orientation];
      return (['light', 'dark'] as const).flatMap((theme) => {
        const source = pageOverlayAssetPath(page, orientation, theme);
        return source.endsWith('.svg')
          ? []
          : [
              {
                source,
                target: responsiveTierPath(source, overlayTier.directory),
                maxEdgePx: overlayTier.maxEdgePx,
                widthPx: widths.candidate,
                encoding: 'overlay' as const,
              },
            ];
      });
    })
  );
  const thumbnailSources: Array<{
    source: string;
    shape: BookOrientation | 'cover';
  }> = [
    { source: thumbPath(book.cover), shape: 'cover' },
    { source: chalkThumbPath(book.chalkCover), shape: 'cover' },
  ];
  for (const page of book.pages) {
    for (const orientation of ALL_ORIENTATIONS) {
      thumbnailSources.push({ source: thumbPath(page.images[orientation]), shape: orientation });
      const chalk = page.chalkImages[orientation];
      if (chalk) thumbnailSources.push({ source: chalkThumbPath(chalk), shape: orientation });
    }
  }
  const thumbnailAssets = thumbnailSources.map(({ source, shape }) => {
    const widths = thumbnailTier.widths[shape];
    return {
      source,
      target: responsiveTierPath(source, thumbnailTier.directory),
      maxEdgePx: thumbnailTier.maxEdgePx,
      widthPx: widths.candidate,
      encoding: 'thumbnail' as const,
    };
  });
  const fillAssets = book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.flatMap((orientation) => {
      const widths = overlayTier.widths[orientation];
      return [page.colorImages[orientation], page.nightImages[orientation]]
        .filter((source): source is string => !!source)
        .map((source) => ({
          source,
          target: responsiveTierPath(source, overlayTier.directory),
          maxEdgePx: overlayTier.maxEdgePx,
          widthPx: widths.candidate,
          encoding: 'fill' as const,
        }));
    })
  );
  return [...overlayAssets, ...thumbnailAssets, ...fillAssets];
}

export function bookAssetPaths(book: Book): string[] {
  // Pen line art shown in the picker (cover + both orientations of each page).
  const penLineArt = [
    book.cover,
    ...book.pages.flatMap((page) => [page.images.portrait, page.images.landscape]),
  ];
  // Colored fills are revealed by the magic brush, never shown in the grid, so
  // they have no thumbnail.
  const lightFills = book.pages.flatMap((page) => [
    page.colorImages.portrait,
    page.colorImages.landscape,
  ]);
  // Night fills exist only for processed orientations (ADR-0052) — no thumbnail,
  // same as the light fills.
  const nightFills = book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.map((o) => page.nightImages[o]).filter((p): p is string => !!p)
  );
  // Chalk outlines exist only for forked orientations — they produce the dark
  // presentation overlay and the picker tile's .chalk.thumb sibling.
  const chalkOutlines = [
    book.chalkCover,
    ...book.pages.flatMap((page) =>
      ALL_ORIENTATIONS.map((o) => page.chalkImages[o]).filter((p): p is string => !!p)
    ),
  ];
  const overlays = book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.flatMap((orientation) => [
      pageOverlayAssetPath(page, orientation, 'light'),
      pageOverlayAssetPath(page, orientation, 'dark'),
    ])
  );
  return [
    ...penLineArt,
    ...lightFills,
    ...nightFills,
    ...chalkOutlines,
    ...penLineArt.map(thumbPath),
    ...chalkOutlines.map(chalkThumbPath),
    ...overlays,
    ...responsiveColoringAssets(book).map((asset) => asset.target),
  ];
}

export function bookPackAssetPaths(book: Book): string[] {
  const penThumbs = [
    thumbPath(book.cover),
    ...book.pages.flatMap((page) =>
      ALL_ORIENTATIONS.map((orientation) => thumbPath(page.images[orientation]))
    ),
  ];
  const chalkThumbs = [
    chalkThumbPath(book.chalkCover),
    ...book.pages.flatMap((page) =>
      ALL_ORIENTATIONS.map((orientation) => page.chalkImages[orientation])
        .filter((path): path is string => !!path)
        .map(chalkThumbPath)
    ),
  ];
  const fills = book.pages.flatMap((page) => [
    ...ALL_ORIENTATIONS.map((orientation) => page.colorImages[orientation]),
    ...ALL_ORIENTATIONS.map((orientation) => page.nightImages[orientation]).filter(
      (path): path is string => !!path
    ),
  ]);
  const overlays = book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.flatMap((orientation) => [
      pageOverlayAssetPath(page, orientation, 'light'),
      pageOverlayAssetPath(page, orientation, 'dark'),
    ])
  );
  return [...penThumbs, ...chalkThumbs, ...fills, ...overlays];
}
