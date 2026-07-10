// Coloring-book catalog - the single source of truth for which books exist and
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
// (see scripts/strip-native-assets.mjs).
//
// Image storage format:
//   static/coloring/{book}/cover.outline.webp         cover line art, 1:1
//   static/coloring/{book}/{page}-tall.outline.webp   portrait line art, 2:3
//   static/coloring/{book}/{page}-wide.outline.webp   landscape line art, 3:2
//   static/coloring/{book}/{name}.thumb.webp          grid thumbnail of the line art
//   static/coloring/{book}/{page}-tall.light.webp     portrait colored twin
//   static/coloring/{book}/{page}-wide.light.webp     landscape colored twin
//   static/coloring/{book}/{page}-tall.night.webp     portrait night twin (dark mode)
//   static/coloring/{book}/{page}-wide.night.webp     landscape night twin (dark mode)
//
// Each picker-facing line-art image (cover + pages) has a `.thumb.webp` twin
// (tools/asset-gen/gen-coloring-thumbs.mjs): the picker grid shows the thumbnail, the
// full-screen canvas overlay uses the full-res source. `thumbPath()` maps one to
// the other. The colored `.light.webp` twin is a flat-colored, pixel-aligned
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
  /** Flat-colored twin per orientation, revealed by the magic brush (ADR-0043). */
  colorImages: Record<BookOrientation, string>;
  /** Pre-colored "night" twin per orientation — the dark-mode magic-brush reveal
      (ADR-0052 direction B). Only present for orientations whose night asset has
      been generated; dark mode falls back to the light twin where it's absent. */
  nightImages: Partial<Record<BookOrientation, string>>;
}

export interface Book {
  id: string;
  name: string;
  platforms?: BookPlatform[];
  cover: string;
  pages: ColoringPage[];
}

export const PLATFORMS = { WEB: 'web', MOBILE: 'mobile' } as const;

// `night` lists the orientations that have a generated `.night.webp` twin (empty
// until a category is processed; portrait/landscape naming mirrors tall/wide).
function page(book: string, id: string, name: string, night: BookOrientation[] = []): ColoringPage {
  const nightImages: Partial<Record<BookOrientation, string>> = {};
  if (night.includes('portrait')) nightImages.portrait = `/coloring/${book}/${id}-tall.night.webp`;
  if (night.includes('landscape'))
    nightImages.landscape = `/coloring/${book}/${id}-wide.night.webp`;
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
  };
}

export const BOOKS: Book[] = [
  {
    id: 'farm',
    name: 'Farm',
    platforms: ['web', 'mobile'],
    cover: '/coloring/farm/cover.outline.webp',
    pages: [
      // Night twins shipped for both orientations (ADR-0052).
      page('farm', 'cat', 'Cat', ['portrait', 'landscape']),
      page('farm', 'cow', 'Cow', ['portrait', 'landscape']),
      page('farm', 'dog', 'Dog', ['portrait', 'landscape']),
      page('farm', 'duck', 'Duck', ['portrait', 'landscape']),
      page('farm', 'horse', 'Horse', ['portrait', 'landscape']),
      page('farm', 'pig', 'Pig', ['portrait', 'landscape']),
    ],
  },
  {
    id: 'dinosaur',
    name: 'Dinosaurs',
    platforms: ['web', 'mobile'],
    cover: '/coloring/dinosaur/cover.outline.webp',
    pages: [
      // Night twins shipped for both orientations (ADR-0052).
      page('dinosaur', 'brachiosaurus', 'Brachiosaurus', ['portrait', 'landscape']),
      page('dinosaur', 'pterodactyl', 'Pterodactyl', ['portrait', 'landscape']),
      page('dinosaur', 'stegosaurus', 'Stegosaurus', ['portrait', 'landscape']),
      page('dinosaur', 'trex', 'T. Rex', ['portrait', 'landscape']),
      page('dinosaur', 'triceratops', 'Triceratops', ['portrait', 'landscape']),
      page('dinosaur', 'velociraptor', 'Velociraptor', ['portrait', 'landscape']),
    ],
  },
  {
    id: 'creatures',
    name: 'Creatures',
    platforms: ['web', 'mobile'],
    cover: '/coloring/creatures/cover.outline.webp',
    pages: [
      // Night twins shipped for both orientations (ADR-0052).
      page('creatures', 'dragon', 'Dragon', ['portrait', 'landscape']),
      page('creatures', 'fairy', 'Fairy', ['portrait', 'landscape']),
      page('creatures', 'mermaid', 'Mermaid', ['portrait', 'landscape']),
      page('creatures', 'owl', 'Owl', ['portrait', 'landscape']),
      page('creatures', 'pegasus', 'Pegasus', ['portrait', 'landscape']),
      page('creatures', 'unicorn', 'Unicorn', ['portrait', 'landscape']),
    ],
  },
  {
    id: 'nature',
    name: 'Nature',
    platforms: ['web', 'mobile'],
    cover: '/coloring/nature/cover.outline.webp',
    pages: [
      // Night twins shipped for both orientations (ADR-0052).
      page('nature', 'ant', 'Ant', ['portrait', 'landscape']),
      page('nature', 'bee', 'Bee', ['portrait', 'landscape']),
      page('nature', 'caterpillar', 'Caterpillar', ['portrait', 'landscape']),
      page('nature', 'ladybug', 'Ladybug', ['portrait', 'landscape']),
      page('nature', 'snail', 'Snail', ['portrait', 'landscape']),
      page('nature', 'spider', 'Spider', ['portrait', 'landscape']),
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
    ],
  },
  {
    id: 'shapes',
    name: 'Shapes',
    platforms: ['web', 'mobile'],
    cover: '/coloring/shapes/cover.outline.webp',
    pages: [
      page('shapes', 'circle', 'Circle'),
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
      // Night twins shipped for both orientations (ADR-0052).
      page('space', 'astronaut', 'Astronaut', ['portrait', 'landscape']),
      page('space', 'meteor', 'Meteor', ['portrait', 'landscape']),
      page('space', 'moon', 'Moon', ['portrait', 'landscape']),
      page('space', 'rover', 'Rover', ['portrait', 'landscape']),
      page('space', 'ship', 'Ship', ['portrait', 'landscape']),
      page('space', 'station', 'Station', ['portrait', 'landscape']),
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

/** Night twin path for the orientation, or null when none is generated yet. */
export function pageNightImage(page: ColoringPage, orientation: BookOrientation): string | null {
  return page.nightImages[orientation] ?? null;
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
  // Colored twins are revealed by the magic brush, never shown in the grid, so
  // they have no thumbnail.
  const colorTwins = book.pages.flatMap((page) => [
    page.colorImages.portrait,
    page.colorImages.landscape,
  ]);
  // Night twins exist only for processed orientations (ADR-0052) — no thumbnail,
  // same as the light twins.
  const nightTwins = book.pages.flatMap((page) =>
    (['portrait', 'landscape'] as BookOrientation[])
      .map((o) => page.nightImages[o])
      .filter((p): p is string => !!p)
  );
  return [...lineArt, ...colorTwins, ...nightTwins, ...lineArt.map(thumbPath)];
}
