// Coloring-book catalog - the single source of truth for which books exist and
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
// (see scripts/strip-native-assets.mjs).
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
// Omitting the field is treated as ships-everywhere.

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
  platforms?: BookPlatform[];
  cover: string;
  pages: ColoringPage[];
}

export const PLATFORMS = { WEB: 'web', MOBILE: 'mobile' } as const;

const ALL_ORIENTATIONS: BookOrientation[] = ['portrait', 'landscape'];

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

function page(
  book: string,
  id: string,
  name: string,
  { nightExcept = [], chalkExcept = [] }: PageExceptions = {}
): ColoringPage {
  const night = ALL_ORIENTATIONS.filter((o) => !nightExcept.includes(o));
  const chalk = ALL_ORIENTATIONS.filter((o) => !chalkExcept.includes(o));
  const nightImages: Partial<Record<BookOrientation, string>> = {};
  if (night.includes('portrait')) nightImages.portrait = `/coloring/${book}/${id}-tall.night.webp`;
  if (night.includes('landscape'))
    nightImages.landscape = `/coloring/${book}/${id}-wide.night.webp`;
  const chalkImages: Partial<Record<BookOrientation, string>> = {};
  if (chalk.includes('portrait')) chalkImages.portrait = `/coloring/${book}/${id}-tall.chalk.webp`;
  if (chalk.includes('landscape'))
    chalkImages.landscape = `/coloring/${book}/${id}-wide.chalk.webp`;
  return {
    id,
    name,
    images: {
      portrait: `/coloring/${book}/${id}-tall.outline.webp`,
      landscape: `/coloring/${book}/${id}-wide.outline.webp`,
    },
    colorImages: {
      portrait: `/coloring/${book}/${id}-tall.light.webp`,
      landscape: `/coloring/${book}/${id}-wide.light.webp`,
    },
    nightImages,
    chalkImages,
  };
}

export const BOOKS: Book[] = [
  {
    id: 'farm',
    name: 'Farm',
    platforms: ['web', 'mobile'],
    cover: '/coloring/farm/cover.outline.webp',
    pages: [
      page('farm', 'cat', 'Cat'),
      page('farm', 'cow', 'Cow'),
      page('farm', 'dog', 'Dog'),
      page('farm', 'duck', 'Duck'),
      page('farm', 'horse', 'Horse'),
      page('farm', 'pig', 'Pig'),
    ],
  },
  {
    id: 'dinosaur',
    name: 'Dinosaurs',
    platforms: ['web', 'mobile'],
    cover: '/coloring/dinosaur/cover.outline.webp',
    pages: [
      page('dinosaur', 'brachiosaurus', 'Brachiosaurus'),
      page('dinosaur', 'pterodactyl', 'Pterodactyl'),
      page('dinosaur', 'stegosaurus', 'Stegosaurus'),
      page('dinosaur', 'trex', 'T. Rex'),
      page('dinosaur', 'triceratops', 'Triceratops'),
      page('dinosaur', 'velociraptor', 'Velociraptor'),
    ],
  },
  {
    id: 'creatures',
    name: 'Creatures',
    platforms: ['web', 'mobile'],
    cover: '/coloring/creatures/cover.outline.webp',
    pages: [
      page('creatures', 'dragon', 'Dragon'),
      page('creatures', 'fairy', 'Fairy'),
      page('creatures', 'mermaid', 'Mermaid'),
      page('creatures', 'owl', 'Owl'),
      page('creatures', 'pegasus', 'Pegasus'),
      page('creatures', 'unicorn', 'Unicorn'),
    ],
  },
  {
    id: 'nature',
    name: 'Nature',
    platforms: ['web', 'mobile'],
    cover: '/coloring/nature/cover.outline.webp',
    pages: [
      page('nature', 'ant', 'Ant'),
      page('nature', 'bee', 'Bee'),
      page('nature', 'caterpillar', 'Caterpillar'),
      page('nature', 'ladybug', 'Ladybug'),
      page('nature', 'snail', 'Snail'),
      page('nature', 'spider', 'Spider'),
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    platforms: ['web', 'mobile'],
    cover: '/coloring/objects/cover.outline.webp',
    pages: [
      page('objects', 'apple', 'Apple'),
      page('objects', 'balloon', 'Balloon'),
      page('objects', 'flower', 'Flower'),
      page('objects', 'house', 'House'),
      page('objects', 'teddy', 'Teddy'),
      page('objects', 'umbrella', 'Umbrella'),
    ],
  },
  {
    id: 'shapes',
    name: 'Shapes',
    platforms: ['web', 'mobile'],
    cover: '/coloring/shapes/cover.outline.webp',
    pages: [
      page('shapes', 'circle', 'Circle'),
      page('shapes', 'heart', 'Heart'),
      page('shapes', 'rectangle', 'Rectangle'),
      page('shapes', 'square', 'Square'),
      page('shapes', 'star', 'Star'),
      page('shapes', 'triangle', 'Triangle'),
    ],
  },
  {
    id: 'space',
    name: 'Space',
    platforms: ['web', 'mobile'],
    cover: '/coloring/space/cover.outline.webp',
    pages: [
      page('space', 'astronaut', 'Astronaut'),
      page('space', 'meteor', 'Meteor'),
      page('space', 'moon', 'Moon'),
      page('space', 'rover', 'Rover'),
      page('space', 'ship', 'Ship'),
      page('space', 'station', 'Station'),
    ],
  },
  {
    id: 'vehicles',
    name: 'Vehicles',
    platforms: ['web', 'mobile'],
    cover: '/coloring/vehicles/cover.outline.webp',
    pages: [
      page('vehicles', 'excavator', 'Excavator'),
      page('vehicles', 'fire', 'Fire Truck'),
      page('vehicles', 'garbage', 'Garbage Truck'),
      page('vehicles', 'monster', 'Monster Truck'),
      page('vehicles', 'police', 'Police Car'),
      page('vehicles', 'train', 'Train'),
    ],
  },
];

/** Books allowed on the given platform ('web' | 'mobile'). */
export function booksForPlatform(platform: BookPlatform): Book[] {
  return BOOKS.filter((book) => (book.platforms ?? ['web', 'mobile']).includes(platform));
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

/** Grid-thumbnail path for a picker-facing line-art image (`x.outline.webp` -> `x.thumb.webp`). */
export function thumbPath(src: string): string {
  return src.replace(/\.outline\.webp$/, '.thumb.webp');
}

/** Grid-thumbnail path for a chalk outline (`x.chalk.webp` -> `x.chalk.thumb.webp`). */
export function chalkThumbPath(src: string): string {
  return src.replace(/\.chalk\.webp$/, '.chalk.thumb.webp');
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
  theme: 'light' | 'dark'
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
    (['portrait', 'landscape'] as BookOrientation[])
      .map((o) => page.nightImages[o])
      .filter((p): p is string => !!p)
  );
  // Chalk outlines exist only for forked orientations — the full-screen overlay
  // and the picker tile (via its .chalk.thumb sibling) swap to them in dark mode.
  const chalkOutlines = book.pages.flatMap((page) =>
    (['portrait', 'landscape'] as BookOrientation[])
      .map((o) => page.chalkImages[o])
      .filter((p): p is string => !!p)
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
