// Validates every asset referenced in the coloring-book catalog exists on disk,
// and that the platform filtering used by strip-native-assets.mjs is consistent
// with booksForPlatform. Run with:
//   npm run check:assets

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { webOnlyBooks } from './lib/book-assets.mjs';
import { ROOT, fail, isMain } from './lib/proc.mjs';
import { BOOKS, booksForPlatform, bookAssetPaths } from '../web/src/lib/state/books.ts';

const STATIC_DIR = join(ROOT, 'web', 'static');

function reportMissingCatalogAssets(staticDir, books) {
  let missing = 0;
  let checked = 0;

  for (const book of books) {
    for (const assetPath of bookAssetPaths(book)) {
      checked++;
      if (!existsSync(join(staticDir, assetPath))) {
        console.error(`[check-assets] MISSING: ${assetPath}  (book: ${book.id})`);
        missing++;
      }
    }
  }
  console.log(`[check-assets] ${checked} asset(s) checked across ${books.length} book(s).`);
  return missing;
}

function reportPlatformFilterMismatch(books, mobileEligibleBooks) {
  // webOnlyBooks is script-side; the app-side booksForPlatform('mobile') result must complement it.
  const mobileBookIds = new Set(mobileEligibleBooks.map((book) => book.id));
  const webOnly = webOnlyBooks(books);
  const overlap = webOnly.filter((book) => mobileBookIds.has(book.id));

  if (overlap.length > 0) {
    console.error(
      `[check-assets] PLATFORM MISMATCH: book(s) simultaneously mobile-eligible and web-only: ` +
        overlap.map((book) => book.id).join(', ')
    );
    return 1;
  }

  console.log(
    `[check-assets] platform filtering OK — ` +
      (webOnly.length > 0
        ? `${webOnly.length} web-only book(s) will be stripped from native: ${webOnly.map((book) => book.id).join(', ')}`
        : 'all books ship on mobile.')
  );
  return 0;
}

export function checkAssets(staticDir, books, mobileEligibleBooks) {
  const errors =
    reportMissingCatalogAssets(staticDir, books) +
    reportPlatformFilterMismatch(books, mobileEligibleBooks);
  if (errors > 0) {
    throw new Error(`[check-assets] ${errors} error(s) found — fix before releasing.`);
  }
  console.log('[check-assets] all checks passed.');
}

if (isMain(import.meta.url)) {
  try {
    checkAssets(STATIC_DIR, BOOKS, booksForPlatform('mobile'));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}
