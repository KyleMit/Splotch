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
//   static/coloring/{book}/{name}.thumb.webp          grid thumbnail of the line art
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
// without a chalk fall back to inverting the pen (tools/asset-gen/gen-coloring-chalk.mjs).
//
// Each picker-facing line-art image (cover + pages) has a `.thumb.webp` sibling
// (tools/asset-gen/gen-coloring-thumbs.mjs): the picker grid shows the thumbnail, the
// full-screen canvas overlay uses the full-res source. `thumbPath()` maps one to
// the other. The colored `.light.webp` fill is a flat-colored, pixel-aligned
// version of the line-art page (tools/asset-gen/gen-coloring-fills.mjs) that the magic
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

// `night` lists the orientations that have a generated `.night.webp` fill, and
// `chalk` the ones with a generated `.chalk.webp` outline (both empty until a
// category is processed; portrait/landscape naming mirrors tall/wide).
function page(
  book: string,
  id: string,
  name: string,
  night: BookOrientation[] = [],
  chalk: BookOrientation[] = []
): ColoringPage {
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
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page('farm', 'cat', 'Cat', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('farm', 'cow', 'Cow', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('farm', 'dog', 'Dog', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('farm', 'duck', 'Duck', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('farm', 'horse', 'Horse', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('farm', 'pig', 'Pig', ['portrait', 'landscape'], ['portrait', 'landscape']),
    ],
  },
  {
    id: 'dinosaur',
    name: 'Dinosaurs',
    platforms: ['web', 'mobile'],
    cover: '/coloring/dinosaur/cover.outline.webp',
    pages: [
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page('dinosaur', 'brachiosaurus', 'Brachiosaurus', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('dinosaur', 'pterodactyl', 'Pterodactyl', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('dinosaur', 'stegosaurus', 'Stegosaurus', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('dinosaur', 'trex', 'T. Rex', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('dinosaur', 'triceratops', 'Triceratops', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('dinosaur', 'velociraptor', 'Velociraptor', ['portrait', 'landscape'], ['portrait', 'landscape']),
    ],
  },
  {
    id: 'creatures',
    name: 'Creatures',
    platforms: ['web', 'mobile'],
    cover: '/coloring/creatures/cover.outline.webp',
    pages: [
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page('creatures', 'dragon', 'Dragon', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('creatures', 'fairy', 'Fairy', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('creatures', 'mermaid', 'Mermaid', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('creatures', 'owl', 'Owl', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('creatures', 'pegasus', 'Pegasus', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('creatures', 'unicorn', 'Unicorn', ['portrait', 'landscape'], ['portrait', 'landscape']),
    ],
  },
  {
    id: 'nature',
    name: 'Nature',
    platforms: ['web', 'mobile'],
    cover: '/coloring/nature/cover.outline.webp',
    pages: [
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page('nature', 'ant', 'Ant', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('nature', 'bee', 'Bee', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page(
        'nature',
        'caterpillar',
        'Caterpillar',
        ['portrait', 'landscape'],
        ['portrait', 'landscape']
      ),
      page('nature', 'ladybug', 'Ladybug', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('nature', 'snail', 'Snail', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('nature', 'spider', 'Spider', ['portrait', 'landscape'], ['portrait', 'landscape']),
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    platforms: ['web', 'mobile'],
    cover: '/coloring/objects/cover.outline.webp',
    pages: [
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page('objects', 'apple', 'Apple', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('objects', 'balloon', 'Balloon', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('objects', 'flower', 'Flower', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('objects', 'house', 'House', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('objects', 'teddy', 'Teddy', ['portrait', 'landscape'], ['portrait', 'landscape']),
    ],
  },
  {
    id: 'shapes',
    name: 'Shapes',
    platforms: ['web', 'mobile'],
    cover: '/coloring/shapes/cover.outline.webp',
    pages: [
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page('shapes', 'circle', 'Circle', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page(
        'shapes',
        'rectangle',
        'Rectangle',
        ['portrait', 'landscape'],
        ['portrait', 'landscape']
      ),
      page('shapes', 'square', 'Square', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('shapes', 'star', 'Star', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('shapes', 'triangle', 'Triangle', ['portrait', 'landscape'], ['portrait', 'landscape']),
    ],
  },
  {
    id: 'space',
    name: 'Space',
    platforms: ['web', 'mobile'],
    cover: '/coloring/space/cover.outline.webp',
    pages: [
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page('space', 'astronaut', 'Astronaut', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('space', 'meteor', 'Meteor', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('space', 'moon', 'Moon', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('space', 'rover', 'Rover', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('space', 'ship', 'Ship', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page('space', 'station', 'Station', ['portrait', 'landscape'], ['portrait', 'landscape']),
    ],
  },
  {
    id: 'vehicles',
    name: 'Vehicles',
    platforms: ['web', 'mobile'],
    cover: '/coloring/vehicles/cover.outline.webp',
    pages: [
      // Night fills + chalk outlines shipped for both orientations (ADR-0052;
      // pen/chalk fork — see tools/asset-gen/pipeline.md).
      page(
        'vehicles',
        'excavator',
        'Excavator',
        ['portrait', 'landscape'],
        ['portrait', 'landscape']
      ),
      page('vehicles', 'fire', 'Fire Truck', ['portrait', 'landscape'], ['portrait', 'landscape']),
      page(
        'vehicles',
        'garbage',
        'Garbage Truck',
        ['portrait', 'landscape'],
        ['portrait', 'landscape']
      ),
      page(
        'vehicles',
        'monster',
        'Monster Truck',
        ['portrait', 'landscape'],
        ['portrait', 'landscape']
      ),
      page(
        'vehicles',
        'police',
        'Police Car',
        ['portrait', 'landscape'],
        ['portrait', 'landscape']
      ),
      page('vehicles', 'train', 'Train', ['portrait', 'landscape'], ['portrait', 'landscape']),
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
  // swaps to them in dark mode; the picker keeps inverting the pen thumbnail.
  const chalkOutlines = book.pages.flatMap((page) =>
    (['portrait', 'landscape'] as BookOrientation[])
      .map((o) => page.chalkImages[o])
      .filter((p): p is string => !!p)
  );
  return [...lineArt, ...lightFills, ...nightFills, ...chalkOutlines, ...lineArt.map(thumbPath)];
}
