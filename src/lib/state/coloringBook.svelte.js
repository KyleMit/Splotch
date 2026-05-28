export const BOOKS = [
  {
    id: 'frozen',
    name: 'Frozen',
    cover: '/coloring/frozen/frozen-cover.png',
    pages: [
      '/coloring/frozen/anna.png',
      '/coloring/frozen/elsa.png',
      '/coloring/frozen/kristoff.png',
      '/coloring/frozen/olaf.png',
      '/coloring/frozen/pabbie.png',
      '/coloring/frozen/sven.png'
    ]
  },
  {
    id: 'animals',
    name: 'Animals',
    cover: '/coloring/animals/animals-cover.png',
    pages: [
      '/coloring/animals/cat.png',
      '/coloring/animals/cow.png',
      '/coloring/animals/dog.png',
      '/coloring/animals/duck.png',
      '/coloring/animals/horse.png',
      '/coloring/animals/pig.png'
    ]
  },
  {
    id: 'bluey',
    name: 'Bluey',
    cover: '/coloring/bluey/bluey-cover.png',
    pages: [
      '/coloring/bluey/bandit.png',
      '/coloring/bluey/bingo.png',
      '/coloring/bluey/bluey.png',
      '/coloring/bluey/chili.png',
      '/coloring/bluey/muffin.png',
      '/coloring/bluey/socks.png'
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
