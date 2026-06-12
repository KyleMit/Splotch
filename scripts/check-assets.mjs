// Validates every asset referenced in the coloring-book catalog exists on disk,
// and that the platform filtering used by strip-native-assets.mjs is consistent
// with booksForPlatform. Run with:
//   npm run check:assets

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, fail, webOnlyBooks } from './lib/utils.mjs';
import { BOOKS, booksForPlatform, bookAssetPaths } from '../src/lib/state/books.ts';

const STATIC_DIR = join(ROOT, 'static');

let errors = 0;
let checked = 0;

// 1. Verify every catalog asset exists in static/.
for (const book of BOOKS) {
  for (const assetPath of bookAssetPaths(book)) {
    checked++;
    if (!existsSync(join(STATIC_DIR, assetPath))) {
      console.error(`[check-assets] MISSING: ${assetPath}  (book: ${book.id})`);
      errors++;
    }
  }
}
console.log(`[check-assets] ${checked} asset(s) checked across ${BOOKS.length} book(s).`);

// 2. Cross-check platform filtering: strip-native-assets drops webOnlyBooks
//    (defined script-side in lib/utils.mjs); booksForPlatform('mobile') is the
//    app-side complement. If any book appears in both sets, the filters disagree.
const mobileBooks = new Set(booksForPlatform('mobile').map((b) => b.id));
const webOnly = webOnlyBooks(BOOKS);
const overlap = webOnly.filter((b) => mobileBooks.has(b.id));

if (overlap.length > 0) {
  console.error(
    `[check-assets] PLATFORM MISMATCH: book(s) simultaneously mobile-eligible and web-only: ` +
      overlap.map((b) => b.id).join(', ')
  );
  errors++;
} else {
  console.log(
    `[check-assets] platform filtering OK — ` +
      (webOnly.length > 0
        ? `${webOnly.length} web-only book(s) will be stripped from native: ${webOnly.map((b) => b.id).join(', ')}`
        : 'all books ship on mobile.')
  );
}

if (errors > 0) fail(`[check-assets] ${errors} error(s) found — fix before releasing.`);
console.log('[check-assets] all checks passed.');
