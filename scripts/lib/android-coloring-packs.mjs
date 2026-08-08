export const PLAY_COLORING_PACK_BOOK_IDS = ['dinosaur'];

export function androidColoringPackName(bookId) {
  return `coloring_${bookId.replaceAll('-', '_')}`;
}
