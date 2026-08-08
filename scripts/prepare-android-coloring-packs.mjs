import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BOOKS, bookPackAssetPaths } from '../web/src/lib/state/books.ts';
import {
  androidColoringPackName,
  PLAY_COLORING_PACK_BOOK_IDS,
} from './lib/android-coloring-packs.mjs';
import { ROOT, fail, isMain } from './lib/proc.mjs';

export function prepareAndroidColoringPacks({
  root = ROOT,
  books = BOOKS,
  bookIds = PLAY_COLORING_PACK_BOOK_IDS,
} = {}) {
  const booksById = new Map(books.map((book) => [book.id, book]));
  for (const bookId of bookIds) {
    const book = booksById.get(bookId);
    if (!book) throw new Error(`[android-coloring-packs] unknown book: ${bookId}`);

    const assetsRoot = join(
      root,
      'android',
      'coloring-packs',
      androidColoringPackName(bookId),
      'src',
      'main',
      'assets'
    );
    rmSync(assetsRoot, { recursive: true, force: true });

    for (const logicalPath of bookPackAssetPaths(book)) {
      const source = join(root, 'web', 'static', logicalPath);
      if (!existsSync(source)) {
        throw new Error(`[android-coloring-packs] missing source: ${logicalPath}`);
      }
      const destination = join(assetsRoot, logicalPath);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(source, destination);
    }
  }
}

if (isMain(import.meta.url)) {
  try {
    prepareAndroidColoringPacks();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
