// Books whose required `platforms` field omits 'mobile'.
// This script-side filter must remain the complement of booksForPlatform('mobile')
// in web/src/lib/state/books.ts.
export const webOnlyBooks = (books) => books.filter((book) => !book.platforms.includes('mobile'));
