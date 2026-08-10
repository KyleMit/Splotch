// Validates every asset referenced in the coloring-book catalog exists on disk,
// that the platform filtering used by strip-native-assets.mjs is consistent with
// booksForPlatform, and that no authoring doc sits in the publicly served static
// tree. Run with:
//   npm run check:assets

import { existsSync, globSync } from 'node:fs';
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

// Everything under static/ is served verbatim from splotch.art, so an authoring
// doc dropped here is published the moment it is committed — the trap
// COLORING-BOOK.md fell into. Prose belongs in docs/ or tools/asset-gen/docs/;
// nothing the app fetches is Markdown.
function reportPubliclyServedDocs(staticDir) {
  const docs = globSync('**/*.md', { cwd: staticDir });
  for (const doc of docs) {
    console.error(
      `[check-assets] PUBLISHED DOC: ${doc} — web/static/ is served publicly; move it under docs/`
    );
  }
  if (docs.length === 0) console.log('[check-assets] no authoring docs in the static tree.');
  return docs.length;
}

export function checkAssets(staticDir, books, mobileEligibleBooks) {
  const errors =
    reportMissingCatalogAssets(staticDir, books) +
    reportPlatformFilterMismatch(books, mobileEligibleBooks) +
    reportPubliclyServedDocs(staticDir);
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
