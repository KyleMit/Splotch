export const BOOKS = [
  {
    id: 'frozen',
    name: 'Frozen',
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

export const coloringBookState = $state({
  overlayUrl: null
});

export function setOverlay(url) {
  coloringBookState.overlayUrl = url;
}

export function clearOverlay() {
  coloringBookState.overlayUrl = null;
}
