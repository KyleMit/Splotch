// Coloring-book catalog - the single source of truth for which books exist and
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
// (see scripts/strip-native-assets.mjs).
//
// Image storage format:
//   static/coloring/{book}/cover.webp
//   static/coloring/{book}/{page}-tall.webp   portrait, 2:3
//   static/coloring/{book}/{page}-wide.webp   landscape, 3:2
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
}

export interface Book {
  id: string;
  name: string;
  platforms?: BookPlatform[];
  cover: string;
  pages: ColoringPage[];
}

export const PLATFORMS = { WEB: 'web', MOBILE: 'mobile' } as const;

function page(book: string, id: string, name: string): ColoringPage {
  return {
    id,
    name,
    images: {
      portrait: `/coloring/${book}/${id}-tall.webp`,
      landscape: `/coloring/${book}/${id}-wide.webp`
    }
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
      page('farm', 'pig', 'Pig')
    ]
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
      page('dinosaur', 'velociraptor', 'Velociraptor')
    ]
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
      page('creatures', 'unicorn', 'Unicorn')
    ]
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
      page('nature', 'spider', 'Spider')
    ]
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
      page('objects', 'teddy', 'Teddy')
    ]
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
      page('shapes', 'triangle', 'Triangle')
    ]
  },
  {
    id: 'space',
    name: 'Space',
    platforms: ['web', 'mobile'],
    cover: '/coloring/space/cover.webp',
    pages: [
      page('space', 'astronaut', 'Astronaut'),
      page('space', 'meteor', 'Meteor'),
      page('space', 'moon', 'Moon'),
      page('space', 'rover', 'Rover'),
      page('space', 'ship', 'Ship'),
      page('space', 'station', 'Station')
    ]
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
      page('vehicles', 'train', 'Train')
    ]
  }
];

/** Books allowed on the given platform ('web' | 'mobile'). */
export function booksForPlatform(platform: BookPlatform): Book[] {
  return BOOKS.filter((book) => (book.platforms ?? ['web', 'mobile']).includes(platform));
}

export function pageImage(page: ColoringPage, orientation: BookOrientation): string {
  return page.images[orientation];
}

export function bookAssetPaths(book: Book): string[] {
  return [
    book.cover,
    ...book.pages.flatMap((page) => [page.images.portrait, page.images.landscape])
  ];
}
