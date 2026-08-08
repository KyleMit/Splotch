import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOOKS, bookPackAssetPaths } from '../web/src/lib/state/books.ts';
import {
  androidColoringPackName,
  PLAY_COLORING_PACK_BOOK_IDS,
} from './lib/android-coloring-packs.mjs';
import { GENERIC_RELEASE_AAB, RELEASE_AAB } from './lib/android.mjs';
import { listZipEntries, readZipEntry } from './lib/artifact-version.mjs';
import { ROOT, fail, isMain } from './lib/proc.mjs';

function aabAssetPath(bookId, logicalPath) {
  return `${androidColoringPackName(bookId)}/assets/${logicalPath.slice(1)}`;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function checkAndroidColoringPacks({
  root = ROOT,
  aabPath = RELEASE_AAB,
  books = BOOKS,
  bookIds = PLAY_COLORING_PACK_BOOK_IDS,
} = {}) {
  const entries = listZipEntries(aabPath);
  const booksById = new Map(books.map((book) => [book.id, book]));

  for (const bookId of bookIds) {
    const book = booksById.get(bookId);
    if (!book) throw new Error(`[android-coloring-packs] unknown book: ${bookId}`);

    const logicalPaths = bookPackAssetPaths(book);
    const expectedEntries = logicalPaths.map((path) => aabAssetPath(bookId, path)).sort();
    const entryPrefix = `${androidColoringPackName(bookId)}/assets/`;
    const actualEntries = entries
      .filter((entry) => entry.startsWith(entryPrefix) && !entry.endsWith('/'))
      .sort();
    if (actualEntries.join('\n') !== expectedEntries.join('\n')) {
      throw new Error(
        `[android-coloring-packs] ${bookId} AAB file list does not match the catalog`
      );
    }

    for (const logicalPath of logicalPaths) {
      const source = readFileSync(join(root, 'web', 'static', logicalPath));
      const bundled = readZipEntry(aabPath, aabAssetPath(bookId, logicalPath));
      if (source.byteLength !== bundled.byteLength || sha256(source) !== sha256(bundled)) {
        throw new Error(`[android-coloring-packs] bundled bytes differ: ${logicalPath}`);
      }
    }
  }
}

export function checkNoAndroidColoringPacks({ aabPath = GENERIC_RELEASE_AAB } = {}) {
  const assetPackEntries = listZipEntries(aabPath).filter((entry) =>
    /^coloring_[^/]+\//.test(entry)
  );
  if (assetPackEntries.length > 0) {
    throw new Error('[android-coloring-packs] generic AAB contains a Play asset-pack module');
  }
}

if (isMain(import.meta.url)) {
  try {
    if (process.argv.includes('--absent')) {
      checkNoAndroidColoringPacks();
      console.log('Generic Android bundle contains no Play coloring asset packs.');
    } else {
      checkAndroidColoringPacks();
      console.log('Android coloring asset packs verified.');
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
