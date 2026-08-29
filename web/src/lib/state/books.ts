// The rune-free catalog is shared by the app and Node build scripts. Theme-specific fills,
// light/dark vector overlays, cover thumbnails, responsive derivatives, and
// pack membership follow ADR-0043, ADR-0045, ADR-0103, and ADR-0129. `bookAssetPaths()` is the
// distribution authority used by validation, pack manifests, and native asset stripping.

import type { Orientation } from '../platform';
import type { ResolvedTheme } from '../theme';
import { resolveColoringAssetUrl } from '../coloringPacks/assetResolver.ts';
import { createBookCatalog, type PageOverrides } from './bookCatalog.ts';

// Distribution platforms a book may ship on - distinct from the runtime
// platform in $lib/platform (which also has 'ios'/'android').
export type BookPlatform = 'web' | 'mobile';
export type BookOrientation = Orientation;

export interface ResponsiveColoringImage {
  src: string;
  srcset: string;
}

export interface ColoringDerivativeAsset {
  source: string;
  target: string;
  maxEdgePx: number;
  widthPx: number;
  encoding: 'fill' | 'thumbnail' | 'selector' | 'presentation';
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
  /** Transparent white-ink SVG used in dark mode (ADR-0129). */
  darkImages: Record<BookOrientation, string>;
}

export interface Book {
  id: string;
  name: string;
  platforms: BookPlatform[];
  cover: string;
  darkCover: string;
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
const PAGE_SELECTOR_MAX_EDGE_PX = 400;
const PAGE_SELECTOR_WIDTHS: Record<BookOrientation, number> = {
  portrait: 267,
  landscape: 400,
};
const PAGE_PRESENTATION_MAX_EDGE_PX = 1536;
const PAGE_PRESENTATION_WIDTHS: Record<BookOrientation, number> = {
  portrait: 1024,
  landscape: 1536,
};
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
  coverThumbnail: {
    standard: `${TALL_COVER_SIZE}, (max-width: 520px) calc((90vw - 48px) / 2), (max-width: 740px) calc((90vw - 88px) / 3), (max-width: 1022px) calc((90vw - 100px) / 4), 205px`,
    orphan: `${TALL_COVER_SIZE}, (max-width: 520px) calc((90vw - 48px) / 2), (max-width: 1022px) calc((90vw - 88px) / 3), 277px`,
  },
} as const;

export function coloringBookGridLayout(visibleTileCount: number): ColoringBookGridLayout {
  const hasOrphan = visibleTileCount > 1 && visibleTileCount % BOOK_GRID_DEFAULT_COLUMNS === 1;
  const imageSizes = hasOrphan
    ? COLORING_IMAGE_SIZES.coverThumbnail.orphan
    : COLORING_IMAGE_SIZES.coverThumbnail.standard;
  return { hasOrphan, imageSizes };
}

const ORIENTATION_SLUGS: Record<BookOrientation, string> = {
  portrait: 'tall',
  landscape: 'wide',
};
const ASSET_SUFFIXES = {
  light: '.light.webp',
  night: '.night.webp',
  thumb: '.thumb.webp',
  chalkThumb: '.chalk.thumb.webp',
  overlay: '.overlay.svg',
  darkOverlay: '.dark.overlay.svg',
  selector: '.selector.webp',
  darkSelector: '.dark.selector.webp',
  presentation: '.presentation.webp',
  darkPresentation: '.dark.presentation.webp',
} as const;

const PAGE_ASSET_SUFFIX_PATTERN = new RegExp(
  `(?:${Object.values(ASSET_SUFFIXES)
    .sort((a, b) => b.length - a.length)
    .map((suffix) => suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?:[?#].*)?$`
);

const ALL_ORIENTATIONS: BookOrientation[] = ['portrait', 'landscape'];

type PageAssetVariant =
  | 'overlay'
  | 'light'
  | 'night'
  | 'darkOverlay'
  | 'selector'
  | 'darkSelector'
  | 'presentation'
  | 'darkPresentation';

function pageAssetPath(
  bookId: string,
  pageId: string,
  orientation: BookOrientation,
  variant: PageAssetVariant
): string {
  return `${COLORING_ROOT}/${bookId}/${pageId}-${ORIENTATION_SLUGS[orientation]}${ASSET_SUFFIXES[variant]}`;
}

function optionalNightAssetPaths(
  bookId: string,
  pageId: string,
  exceptions: BookOrientation[]
): Partial<Record<BookOrientation, string>> {
  const paths: Partial<Record<BookOrientation, string>> = {};
  for (const orientation of ALL_ORIENTATIONS) {
    if (!exceptions.includes(orientation)) {
      paths[orientation] = pageAssetPath(bookId, pageId, orientation, 'night');
    }
  }
  return paths;
}

function coverPath(bookId: string, variant: 'overlay' | 'darkOverlay'): string {
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

function book(
  bookId: string,
  name: string,
  platforms: BookPlatform[],
  buildPages: (
    page: (id: string, name: string, overrides?: PageOverrides) => ColoringPage
  ) => ColoringPage[]
): Book {
  function page(id: string, name: string, { nightExcept = [] }: PageOverrides = {}): ColoringPage {
    return {
      id,
      name,
      images: {
        portrait: pageAssetPath(bookId, id, 'portrait', 'overlay'),
        landscape: pageAssetPath(bookId, id, 'landscape', 'overlay'),
      },
      colorImages: {
        portrait: pageAssetPath(bookId, id, 'portrait', 'light'),
        landscape: pageAssetPath(bookId, id, 'landscape', 'light'),
      },
      nightImages: optionalNightAssetPaths(bookId, id, nightExcept),
      darkImages: {
        portrait: pageAssetPath(bookId, id, 'portrait', 'darkOverlay'),
        landscape: pageAssetPath(bookId, id, 'landscape', 'darkOverlay'),
      },
    };
  }

  return {
    id: bookId,
    name,
    platforms,
    cover: coverPath(bookId, 'overlay'),
    darkCover: coverPath(bookId, 'darkOverlay'),
    pages: buildPages(page),
  };
}

export const BOOKS: Book[] = createBookCatalog(book);

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

function pageOverlayAssetPath(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  return theme === 'dark' ? page.darkImages[orientation] : pageImage(page, orientation);
}

export function pageOverlayImage(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  return resolveColoringAssetUrl(pageOverlayAssetPath(page, orientation, theme));
}

function pageSelectorAssetPath(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  const overlay = pageOverlayAssetPath(page, orientation, theme);
  const sourceSuffix = theme === 'dark' ? ASSET_SUFFIXES.darkOverlay : ASSET_SUFFIXES.overlay;
  const targetSuffix = theme === 'dark' ? ASSET_SUFFIXES.darkSelector : ASSET_SUFFIXES.selector;
  return `${overlay.slice(0, -sourceSuffix.length)}${targetSuffix}`;
}

export function pageSelectorImage(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  return resolveColoringAssetUrl(pageSelectorAssetPath(page, orientation, theme));
}

function pagePresentationAssetPath(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  const overlay = pageOverlayAssetPath(page, orientation, theme);
  const sourceSuffix = theme === 'dark' ? ASSET_SUFFIXES.darkOverlay : ASSET_SUFFIXES.overlay;
  const targetSuffix =
    theme === 'dark' ? ASSET_SUFFIXES.darkPresentation : ASSET_SUFFIXES.presentation;
  return `${overlay.slice(0, -sourceSuffix.length)}${targetSuffix}`;
}

export function pagePresentationImage(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  return resolveColoringAssetUrl(pagePresentationAssetPath(page, orientation, theme));
}

export function pageDisplayImage(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  return __IS_CAPACITOR__
    ? pageOverlayImage(page, orientation, theme)
    : pagePresentationImage(page, orientation, theme);
}

function coverThumbnailPath(src: string, theme: ResolvedTheme): string {
  const sourceSuffix = theme === 'dark' ? ASSET_SUFFIXES.darkOverlay : ASSET_SUFFIXES.overlay;
  if (
    !src.endsWith(sourceSuffix) ||
    (theme === 'light' && src.endsWith(ASSET_SUFFIXES.darkOverlay))
  ) {
    throw new Error(`Coloring asset path must end with ${sourceSuffix}: ${src}`);
  }
  const targetSuffix = theme === 'dark' ? ASSET_SUFFIXES.chalkThumb : ASSET_SUFFIXES.thumb;
  return `${src.slice(0, -sourceSuffix.length)}${targetSuffix}`;
}

export function coverThumb(book: Book, theme: ResolvedTheme): string {
  return coverThumbnailPath(theme === 'dark' ? book.darkCover : book.cover, theme);
}

export function coverThumbImageSource(book: Book, theme: ResolvedTheme): ResponsiveColoringImage {
  const source = coverThumb(book, theme);
  const tier = RESPONSIVE_COLORING_TIERS.thumbnail;
  const widths = tier.widths.cover;
  const image = responsiveImage(source, tier.directory, widths.candidate, widths.source);
  return { ...image, src: resolveColoringAssetUrl(source) };
}

export function responsiveColoringAssets(book: Book): ColoringDerivativeAsset[] {
  const overlayTier = RESPONSIVE_COLORING_TIERS.overlay;
  const thumbnailTier = RESPONSIVE_COLORING_TIERS.thumbnail;
  const thumbnailAssets = [coverThumb(book, 'light'), coverThumb(book, 'dark')].map((source) => {
    const widths = thumbnailTier.widths.cover;
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
  return [...thumbnailAssets, ...fillAssets];
}

export function selectorColoringAssets(book: Book): ColoringDerivativeAsset[] {
  return book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.flatMap((orientation) =>
      (['light', 'dark'] as const).map((theme) => ({
        source: pageOverlayAssetPath(page, orientation, theme),
        target: pageSelectorAssetPath(page, orientation, theme),
        maxEdgePx: PAGE_SELECTOR_MAX_EDGE_PX,
        widthPx: PAGE_SELECTOR_WIDTHS[orientation],
        encoding: 'selector' as const,
      }))
    )
  );
}

export function presentationColoringAssets(book: Book): ColoringDerivativeAsset[] {
  return book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.flatMap((orientation) =>
      (['light', 'dark'] as const).map((theme) => ({
        source: pageOverlayAssetPath(page, orientation, theme),
        target: pagePresentationAssetPath(page, orientation, theme),
        maxEdgePx: PAGE_PRESENTATION_MAX_EDGE_PX,
        widthPx: PAGE_PRESENTATION_WIDTHS[orientation],
        encoding: 'presentation' as const,
      }))
    )
  );
}

export function coloringDerivativeAssets(book: Book): ColoringDerivativeAsset[] {
  return [
    ...responsiveColoringAssets(book),
    ...selectorColoringAssets(book),
    ...presentationColoringAssets(book),
  ];
}

export function bookAssetPaths(book: Book): string[] {
  const lightLineArt = book.pages.flatMap((page) => [page.images.portrait, page.images.landscape]);
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
  const darkLineArt = book.pages.flatMap((page) => [
    page.darkImages.portrait,
    page.darkImages.landscape,
  ]);
  return [
    book.cover,
    book.darkCover,
    ...lightLineArt,
    ...lightFills,
    ...nightFills,
    ...darkLineArt,
    coverThumb(book, 'light'),
    coverThumb(book, 'dark'),
    ...coloringDerivativeAssets(book).map((asset) => asset.target),
  ];
}

export function bookPackAssetPaths(book: Book, platform: BookPlatform = 'web'): string[] {
  const coverThumbs = [coverThumb(book, 'light'), coverThumb(book, 'dark')];
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
  const selectors = selectorColoringAssets(book).map((asset) => asset.target);
  const presentations =
    platform === 'web' ? presentationColoringAssets(book).map((asset) => asset.target) : [];
  return [...coverThumbs, ...fills, ...overlays, ...selectors, ...presentations];
}
