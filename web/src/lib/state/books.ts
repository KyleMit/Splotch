// Coloring-book catalog - the single source of truth for which books exist and
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
// (see scripts/strip-native-assets.mjs).
//
// Image storage format:
//   static/coloring/{book}/cover.webp               cover line art, 1:1
//   static/coloring/{book}/{page}-tall.webp         portrait line art, 2:3
//   static/coloring/{book}/{page}-wide.webp         landscape line art, 3:2
//   static/coloring/{book}/{name}-thumb.webp        grid thumbnail of the line art
//   static/coloring/{book}/{page}-tall.color.webp   portrait colored twin
//   static/coloring/{book}/{page}-wide.color.webp   landscape colored twin
//   static/coloring/{book}/{page}-tall.night.webp   portrait night twin (dark mode)
//   static/coloring/{book}/{page}-wide.night.webp   landscape night twin (dark mode)
//
// Each picker-facing line-art image (cover + pages) has a `-thumb.webp` twin
// (scripts/gen-coloring-thumbs.mjs): the picker grid shows the thumbnail, the
// full-screen canvas overlay uses the full-res source. `thumbPath()` maps one to
// the other. The colored `.color.webp` twin is a flat-colored, pixel-aligned
// version of the line-art page (scripts/gen-coloring-fills.mjs) that the magic
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
      portrait: `/coloring/${book}/${id}-tall.webp`,
      landscape: `/coloring/${book}/${id}-wide.webp`,
    },
    colorImages: {
      portrait: `/coloring/${book}/${id}-tall.color.webp`,
      landscape: `/coloring/${book}/${id}-wide.color.webp`,
    },
    nightImages,
  };
}

export const BOOKS: Book[] = [
  {
    id: 'farm',
    name: 'Farm',
    platforms: ['web', 'mobile'],
    cover: '/coloring/farm/cover.webp',
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
    cover: '/coloring/dinosaur/cover.webp',
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
    cover: '/coloring/creatures/cover.webp',
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
    cover: '/coloring/nature/cover.webp',
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
    cover: '/coloring/objects/cover.webp',
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
    cover: '/coloring/shapes/cover.webp',
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
    cover: '/coloring/space/cover.webp',
    pages: [
      // Portrait night twins shipped (Phase 1 testbed, ADR-0052); landscape twins
      // land in a later pass.
      page('space', 'astronaut', 'Astronaut', ['portrait']),
      page('space', 'meteor', 'Meteor', ['portrait']),
      page('space', 'moon', 'Moon', ['portrait']),
      page('space', 'rover', 'Rover', ['portrait']),
      page('space', 'ship', 'Ship', ['portrait']),
      page('space', 'station', 'Station', ['portrait']),
    ],
  },
  {
    id: 'vehicles',
    name: 'Vehicles',
    platforms: ['web', 'mobile'],
    cover: '/coloring/vehicles/cover.webp',
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

/** Grid-thumbnail path for a picker-facing line-art image (`x.webp` -> `x-thumb.webp`). */
export function thumbPath(src: string): string {
  return src.replace(/\.webp$/, '-thumb.webp');
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
