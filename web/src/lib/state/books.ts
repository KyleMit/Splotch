// Coloring-book catalog - the single source of truth for which books exist and
// where each one is allowed to ship. This file is intentionally rune-free (and
// is not a `.svelte.ts` module) so it can be imported both by the app and by
// Node build scripts (see scripts/strip-native-assets.mjs).
//
// Image storage format:
//   static/coloring/{book}/cover.outline.webp         cover line art, 1:1
//   static/coloring/{book}/{page}-tall.outline.webp   portrait PEN outline, 2:3
//   static/coloring/{book}/{page}-wide.outline.webp   landscape PEN outline, 3:2
//   static/coloring/{book}/{page}-tall.chalk.webp     portrait CHALK outline (dark mode)
//   static/coloring/{book}/{page}-wide.chalk.webp     landscape CHALK outline (dark mode)
//   static/coloring/{book}/{name}.thumb.webp          grid thumbnail of the pen line art
//   static/coloring/{book}/{name}.chalk.thumb.webp    grid thumbnail of the chalk (dark mode)
//   static/coloring/{book}/{page}-tall.light.webp     portrait colored fill
//   static/coloring/{book}/{page}-wide.light.webp     landscape colored fill
//   static/coloring/{book}/{page}-tall.night.webp     portrait night fill (dark mode)
//   static/coloring/{book}/{page}-wide.night.webp     landscape night fill (dark mode)
//
// The PEN outline (black ink on white) is the light-mode overlay and the source
// every other asset derives from. The CHALK outline is the dark-mode overlay —
// a Gemini redraw of the pen as a chalk drawing whose deliberate solid whites
// (eye sclera, catchlights) survive into the night render. It ships INK-ON-WHITE
// (the negation of what dark mode shows) so the existing dark treatment
// (--lineart-filter: invert(1) + screen) renders it unchanged; orientations
// without a chalk fall back to inverting the pen (tools/asset-gen/bin/gen-coloring-chalk.mjs).
//
// Each picker-facing line-art image (cover + pages, pen AND chalk) has a
// thumbnail sibling (tools/asset-gen/bin/gen-coloring-thumbs.mjs): the picker grid
// shows the thumbnail, the full-screen canvas overlay uses the full-res source.
// `thumbPath()` maps a pen outline to its `.thumb.webp`, `chalkThumbPath()` a
// chalk to its `.chalk.thumb.webp`, and `pageThumb()` picks per theme — dark
// mode shows the chalk thumb so the tile previews the same art the canvas
// applies (covers have no chalk yet, so book tiles stay on the pen thumb).
// The colored `.light.webp` fill is a flat-colored, pixel-aligned
// version of the line-art page (tools/asset-gen/bin/gen-coloring-fills.mjs) that the magic
// brush reveals where the child paints (ADR-0043); it never appears in the grid,
// so it has no thumbnail. `bookAssetPaths()` lists them all so check-assets
// validates and strip-native-assets removes them together. Thumbnails: ADR-0045.
//
// `platforms` controls distribution per book:
//   ['web']            -> web only          (hidden + assets stripped on native)
//   ['mobile']         -> native only       (hidden on web)
//   ['web', 'mobile']  -> ships everywhere  ("both")

import type { ResolvedTheme } from '../theme';

// Distribution platforms a book may ship on - distinct from the runtime
// platform in platform.ts (which also has 'ios'/'android').
export type BookPlatform = 'web' | 'mobile';
export type BookOrientation = 'portrait' | 'landscape';

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
}

export interface Book {
  id: string;
  name: string;
  platforms: BookPlatform[];
  cover: string;
  pages: ColoringPage[];
}

const COLORING_ROOT = '/coloring';
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
} as const;

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

function coverPath(bookId: string): string {
  return `${COLORING_ROOT}/${bookId}/cover${ASSET_SUFFIXES.outline}`;
}

// A page ships night fills + chalk outlines for BOTH orientations by default —
// the norm once a category is fully processed. Pass the SUBTRACTIVE exceptions
// only: `nightExcept`/`chalkExcept` list the orientations whose `.night.webp` /
// `.chalk.webp` asset hasn't been generated yet, so those keys are omitted (dark
// mode falls back — light fill for night, inverted pen for chalk). Forgetting an
// exception makes bookAssetPaths() reference a missing file and check-assets
// fails loudly at build. Empty exceptions (the default) => both orientations.
interface PageExceptions {
  nightExcept?: BookOrientation[];
  chalkExcept?: BookOrientation[];
}

function book(
  bookId: string,
  name: string,
  platforms: BookPlatform[],
  buildPages: (
    page: (id: string, name: string, exceptions?: PageExceptions) => ColoringPage
  ) => ColoringPage[]
): Book {
  function page(
    id: string,
    name: string,
    { nightExcept = [], chalkExcept = [] }: PageExceptions = {}
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
    };
  }

  return {
    id: bookId,
    name,
    platforms,
    cover: coverPath(bookId),
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
    page('owl', 'Owl'),
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
    page('circle', 'Circle'),
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

/** Books allowed on the given platform ('web' | 'mobile'). */
export function booksForPlatform(platform: BookPlatform): Book[] {
  return BOOKS.filter((book) => book.platforms.includes(platform));
}

export function pageImage(page: ColoringPage, orientation: BookOrientation): string {
  return page.images[orientation];
}

export function pageColorImage(page: ColoringPage, orientation: BookOrientation): string {
  return page.colorImages[orientation];
}

/** Night fill path for the orientation, or null when none is generated yet. */
export function pageNightImage(page: ColoringPage, orientation: BookOrientation): string | null {
  return page.nightImages[orientation] ?? null;
}

/** Chalk-outline path for the orientation, or null when none is generated yet
    (dark mode then falls back to inverting the pen outline). */
export function pageChalkImage(page: ColoringPage, orientation: BookOrientation): string | null {
  return page.chalkImages[orientation] ?? null;
}

export function pageOverlayImage(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  return (
    (theme === 'dark' ? pageChalkImage(page, orientation) : null) ?? pageImage(page, orientation)
  );
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
    line-art asset — the tile's --lineart-filter invert + screen renders it as
    white chalk, the same treatment the canvas overlay gets), falling back to
    the inverted pen thumbnail for un-forked pages. Covers have no chalk yet,
    so book tiles keep `thumbPath(book.cover)`. */
export function pageThumb(
  page: ColoringPage,
  orientation: BookOrientation,
  theme: ResolvedTheme
): string {
  const chalk = theme === 'dark' ? page.chalkImages[orientation] : undefined;
  return chalk ? chalkThumbPath(chalk) : thumbPath(page.images[orientation]);
}

export function bookAssetPaths(book: Book): string[] {
  // Line art shown in the picker (cover + both orientations of each page) — the
  // only images that get a grid thumbnail.
  const lineArt = [
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
  // Chalk outlines exist only for forked orientations — the full-screen overlay
  // and the picker tile (via its .chalk.thumb sibling) swap to them in dark mode.
  const chalkOutlines = book.pages.flatMap((page) =>
    ALL_ORIENTATIONS.map((o) => page.chalkImages[o]).filter((p): p is string => !!p)
  );
  return [
    ...lineArt,
    ...lightFills,
    ...nightFills,
    ...chalkOutlines,
    ...lineArt.map(thumbPath),
    ...chalkOutlines.map(chalkThumbPath),
  ];
}
