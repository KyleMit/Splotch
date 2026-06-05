// Coloring-book catalog — the single source of truth for which books exist and
// where each one is allowed to ship. This file is intentionally plain JS (no
// Svelte runes) so it can be imported both by the app and by Node build scripts
// (see scripts/strip-native-assets.mjs).
//
// `platforms` controls distribution per book:
//   ['web']            → web only          (hidden + assets stripped on native)
//   ['mobile']         → native only       (hidden on web)
//   ['web', 'mobile']  → ships everywhere  ("both")
// Omitting the field is treated as ships-everywhere.
//
// Licensed IP (Bluey, Frozen) is web-only: we don't bundle it into the
// App Store / Play Store builds.

// Distribution platforms a book may ship on — distinct from the runtime
// platform in platform.ts (which also has 'ios'/'android').
export type BookPlatform = 'web' | 'mobile';

export interface Book {
  id: string;
  name: string;
  platforms?: BookPlatform[];
  cover: string;
  pages: string[];
}

export const PLATFORMS = { WEB: 'web', MOBILE: 'mobile' } as const;

export const BOOKS: Book[] = [
  {
    id: 'frozen',
    name: 'Frozen',
    platforms: ['web'],
    cover: '/coloring/frozen/frozen-cover.webp',
    pages: [
      '/coloring/frozen/anna.webp',
      '/coloring/frozen/elsa.webp',
      '/coloring/frozen/kristoff.webp',
      '/coloring/frozen/olaf.webp',
      '/coloring/frozen/pabbie.webp',
      '/coloring/frozen/sven.webp'
    ]
  },
  {
    id: 'animals',
    name: 'Animals',
    platforms: ['web', 'mobile'],
    cover: '/coloring/animals/animals-cover.webp',
    pages: [
      '/coloring/animals/cat.webp',
      '/coloring/animals/cow.webp',
      '/coloring/animals/dog.webp',
      '/coloring/animals/duck.webp',
      '/coloring/animals/horse.webp',
      '/coloring/animals/pig.webp'
    ]
  },
  {
    id: 'bluey',
    name: 'Bluey',
    platforms: ['web'],
    cover: '/coloring/bluey/bluey-cover.webp',
    pages: [
      '/coloring/bluey/bandit.webp',
      '/coloring/bluey/bingo.webp',
      '/coloring/bluey/bluey.webp',
      '/coloring/bluey/chili.webp',
      '/coloring/bluey/muffin.webp',
      '/coloring/bluey/socks.webp'
    ]
  }
];

/** Books allowed on the given platform ('web' | 'mobile'). */
export function booksForPlatform(platform: BookPlatform): Book[] {
  return BOOKS.filter((book) => (book.platforms ?? ['web', 'mobile']).includes(platform));
}
