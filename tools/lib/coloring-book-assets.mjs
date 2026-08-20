// Books whose required `platforms` field omits 'mobile'.
// This script-side filter must remain the complement of booksForPlatform('mobile')
// in web/src/lib/state/books.ts.
export const webOnlyBooks = (books) => books.filter((book) => !book.platforms.includes('mobile'));

export const downloadableMobileBooks = (books, starterBookId) =>
  books.filter((book) => book.platforms.includes('mobile') && book.id !== starterBookId);

export const nativeUnusedLineArt = (books) =>
  books
    .filter((book) => book.platforms.includes('mobile'))
    .flatMap((book) => [
      book.cover,
      book.chalkCover,
      ...book.pages.flatMap((page) => [
        ...Object.values(page.images),
        ...Object.values(page.chalkImages),
      ]),
    ]);
